-- ============================================================================
-- MIGRATION 000023: VENDOR CATEGORY GOVERNANCE (UP)
-- Non-Overwriting Backfill, Provenance Tracking, Scoped Constraints, State Support
-- ============================================================================

DO $$
DECLARE
    v_con_exists BOOLEAN;
    v_con_def TEXT;
    v_vca_exists BOOLEAN;
    v_col_record RECORD;
BEGIN
    -- ------------------------------------------------------------------------
    -- 1. SCOPED UNIQUE CONSTRAINT ON user_skills_assets(id, user_id)
    -- ------------------------------------------------------------------------
    SELECT EXISTS (
        SELECT 1 
        FROM pg_constraint con
        JOIN pg_class rel ON con.conrelid = rel.oid
        JOIN pg_namespace nsp ON rel.relnamespace = nsp.oid
        WHERE nsp.nspname = 'public' 
          AND rel.relname = 'user_skills_assets'
          AND con.conname = 'uq_user_skills_assets_id_user'
    ) INTO v_con_exists;

    IF v_con_exists THEN
        SELECT pg_get_constraintdef(con.oid) INTO v_con_def
        FROM pg_constraint con
        JOIN pg_class rel ON con.conrelid = rel.oid
        JOIN pg_namespace nsp ON rel.relnamespace = nsp.oid
        WHERE nsp.nspname = 'public' 
          AND rel.relname = 'user_skills_assets'
          AND con.conname = 'uq_user_skills_assets_id_user';

        IF v_con_def NOT LIKE '%(id, user_id)%' THEN
            RAISE EXCEPTION '000023: Incompatible pre-existing constraint uq_user_skills_assets_id_user: %', v_con_def;
        END IF;
    ELSE
        ALTER TABLE public.user_skills_assets 
        ADD CONSTRAINT uq_user_skills_assets_id_user UNIQUE (id, user_id);

        INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
        VALUES ('000023', 'CONSTRAINT', 'public', 'user_skills_assets.uq_user_skills_assets_id_user')
        ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;
    END IF;

    -- ------------------------------------------------------------------------
    -- 2. VALIDATE / CREATE vendor_category_approvals TABLE
    -- ------------------------------------------------------------------------
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'vendor_category_approvals'
    ) INTO v_vca_exists;

    IF v_vca_exists THEN
        -- Validate required column types
        FOR v_col_record IN 
            SELECT column_name, udt_name 
            FROM information_schema.columns 
            WHERE table_schema = 'public' AND table_name = 'vendor_category_approvals'
              AND column_name IN ('vendor_id', 'category_id', 'status', 'asset_id')
        LOOP
            IF v_col_record.column_name IN ('vendor_id', 'category_id', 'asset_id') AND v_col_record.udt_name <> 'uuid' THEN
                RAISE EXCEPTION '000023: Incompatible column type in vendor_category_approvals: % is % (expected uuid).',
                    v_col_record.column_name, v_col_record.udt_name;
            END IF;
        END LOOP;
    ELSE
        CREATE TABLE public.vendor_category_approvals (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            vendor_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
            category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
            status VARCHAR(50) NOT NULL DEFAULT 'PENDING_APPROVAL',
            asset_id UUID NOT NULL,
            secondary_asset_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
            rejection_reason TEXT,
            change_request_notes TEXT,
            history JSONB NOT NULL DEFAULT '[]'::jsonb,
            approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
            approved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            CONSTRAINT uq_vendor_category UNIQUE (vendor_id, category_id),
            CONSTRAINT chk_vca_status CHECK (status IN ('PENDING_APPROVAL', 'CHANGES_REQUESTED', 'ACTIVE', 'REJECTED', 'SUSPENDED')),
            CONSTRAINT fk_vca_canonical_asset FOREIGN KEY (asset_id, vendor_id) 
                REFERENCES public.user_skills_assets(id, user_id) ON DELETE RESTRICT
        );

        INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
        VALUES ('000023', 'TABLE', 'public', 'vendor_category_approvals')
        ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;

        CREATE INDEX idx_vca_vendor ON public.vendor_category_approvals(vendor_id);
        CREATE INDEX idx_vca_category ON public.vendor_category_approvals(category_id);
        CREATE INDEX idx_vca_status ON public.vendor_category_approvals(status);
        CREATE INDEX idx_vca_asset ON public.vendor_category_approvals(asset_id);

        INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
        VALUES 
            ('000023', 'INDEX', 'public', 'idx_vca_vendor'),
            ('000023', 'INDEX', 'public', 'idx_vca_category'),
            ('000023', 'INDEX', 'public', 'idx_vca_status'),
            ('000023', 'INDEX', 'public', 'idx_vca_asset')
        ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;
    END IF;

    -- ------------------------------------------------------------------------
    -- 3. PROVENANCE TABLE TO RECORD BACKFILLED APPROVALS
    -- ------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS public._migration_000023_backfill_records (
        vendor_id UUID NOT NULL,
        category_id UUID NOT NULL,
        asset_id UUID NOT NULL,
        backfilled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (vendor_id, category_id)
    );

    -- ------------------------------------------------------------------------
    -- 4. DETERMINISTIC BACKFILL (NO OVERWRITE OF EXISTING APPROVALS)
    -- ------------------------------------------------------------------------
    WITH ranked_assets AS (
        SELECT 
            usa.id AS asset_id,
            usa.user_id AS vendor_id,
            usa.category_id,
            ROW_NUMBER() OVER (
                PARTITION BY usa.user_id, usa.category_id 
                ORDER BY 
                    CASE WHEN EXISTS (
                        SELECT 1 FROM public.vendor_catalog_items vci 
                        WHERE vci.vendor_asset_id = usa.id AND vci.is_available = true
                    ) THEN 0 ELSE 1 END,
                    CASE WHEN usa.documents IS NOT NULL AND usa.documents <> '{}'::jsonb THEN 0 ELSE 1 END,
                    usa.updated_at DESC,
                    usa.created_at ASC,
                    usa.id ASC
            ) AS rank_order
        FROM public.user_skills_assets usa
        WHERE usa.status = 'ACTIVE' 
          AND usa.category_id IS NOT NULL
    ),
    all_assets_per_pair AS (
        SELECT 
            usa.user_id AS vendor_id,
            usa.category_id,
            ARRAY_AGG(usa.id ORDER BY usa.id ASC) AS all_asset_ids
        FROM public.user_skills_assets usa
        WHERE usa.status = 'ACTIVE' 
          AND usa.category_id IS NOT NULL
        GROUP BY usa.user_id, usa.category_id
    ),
    selected_backfill AS (
        SELECT 
            ra.vendor_id,
            ra.category_id,
            ra.asset_id,
            ARRAY_REMOVE(ap.all_asset_ids, ra.asset_id) AS secondary_asset_ids
        FROM ranked_assets ra
        JOIN all_assets_per_pair ap 
          ON ra.vendor_id = ap.vendor_id AND ra.category_id = ap.category_id
        WHERE ra.rank_order = 1
    )
    INSERT INTO public.vendor_category_approvals (
        vendor_id, category_id, status, asset_id, secondary_asset_ids, approved_at
    )
    SELECT 
        sb.vendor_id,
        sb.category_id,
        'ACTIVE',
        sb.asset_id,
        sb.secondary_asset_ids,
        NOW()
    FROM selected_backfill sb
    ON CONFLICT (vendor_id, category_id) DO NOTHING;

    -- Record provenance of backfilled entries
    INSERT INTO public._migration_000023_backfill_records (vendor_id, category_id, asset_id)
    SELECT sb.vendor_id, sb.category_id, sb.asset_id
    FROM (
        SELECT ra.vendor_id, ra.category_id, ra.asset_id
        FROM (
            SELECT usa.id AS asset_id, usa.user_id AS vendor_id, usa.category_id,
                   ROW_NUMBER() OVER (
                       PARTITION BY usa.user_id, usa.category_id 
                       ORDER BY 
                           CASE WHEN EXISTS (
                               SELECT 1 FROM public.vendor_catalog_items vci 
                               WHERE vci.vendor_asset_id = usa.id AND vci.is_available = true
                           ) THEN 0 ELSE 1 END,
                           CASE WHEN usa.documents IS NOT NULL AND usa.documents <> '{}'::jsonb THEN 0 ELSE 1 END,
                           usa.updated_at DESC,
                           usa.created_at ASC,
                           usa.id ASC
                   ) AS rank_order
            FROM public.user_skills_assets usa
            WHERE usa.status = 'ACTIVE' AND usa.category_id IS NOT NULL
        ) ra
        WHERE ra.rank_order = 1
    ) sb
    ON CONFLICT (vendor_id, category_id) DO NOTHING;

    RAISE NOTICE '000023: Deterministic vendor category governance backfill complete.';
END $$;
