-- ============================================================================
-- MIGRATION 000023: VENDOR CATEGORY GOVERNANCE (DOWN)
-- Safe Teardown, Provenance-Targeted Deletion, Constraint Ownership Check
-- ============================================================================

DO $$
DECLARE
    v_ref_record RECORD;
    v_table_owned BOOLEAN;
BEGIN
    -- ------------------------------------------------------------------------
    -- 1. INSPECT EXTERNAL REFERENCES (REFUSE DESTRUCTIVE CASCADE)
    -- ------------------------------------------------------------------------
    SELECT 
        con.conname AS constraint_name,
        rel.relname AS referencing_table
    INTO v_ref_record
    FROM pg_constraint con
    JOIN pg_class rel ON con.conrelid = rel.oid
    JOIN pg_namespace nsp ON rel.relnamespace = nsp.oid
    WHERE con.confrelid = 'public.vendor_category_approvals'::regclass
      AND rel.relname NOT IN ('vendor_category_approvals', 'category_proposals', '_migration_000023_backfill_records')
    LIMIT 1;

    IF v_ref_record.constraint_name IS NOT NULL THEN
        RAISE EXCEPTION '000023 DOWN: Rollback blocked! Table % references vendor_category_approvals via %.',
            v_ref_record.referencing_table, v_ref_record.constraint_name;
    END IF;

    -- ------------------------------------------------------------------------
    -- 2. PURGE ONLY BACKFILLED RECORDS (PRESERVE OPERATIONAL APPROVALS)
    -- ------------------------------------------------------------------------
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_migration_000023_backfill_records') THEN
        DELETE FROM public.vendor_category_approvals vca
        USING public._migration_000023_backfill_records b
        WHERE vca.vendor_id = b.vendor_id AND vca.category_id = b.category_id;

        DROP TABLE public._migration_000023_backfill_records;
    END IF;

    -- ------------------------------------------------------------------------
    -- 3. DROP TABLES ONLY IF CREATED BY 000023
    -- ------------------------------------------------------------------------
    SELECT EXISTS (
        SELECT 1 FROM public._migration_schema_ownership 
        WHERE migration_id = '000023' AND object_type = 'TABLE' AND object_name = 'vendor_category_approvals'
    ) INTO v_table_owned;

    IF v_table_owned THEN
        -- Only drop if empty
        IF (SELECT COUNT(*) FROM public.vendor_category_approvals) = 0 THEN
            DROP TABLE public.vendor_category_approvals;
            DELETE FROM public._migration_schema_ownership 
            WHERE migration_id = '000023' AND object_name = 'vendor_category_approvals';
        ELSE
            RAISE WARNING '000023 DOWN: Table vendor_category_approvals contains operational records. Retaining table.';
        END IF;
    END IF;

    -- ------------------------------------------------------------------------
    -- 4. DROP CONSTRAINT ONLY IF CREATED BY 000023
    -- ------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM public._migration_schema_ownership 
        WHERE migration_id = '000023' AND object_type = 'CONSTRAINT' 
          AND object_name = 'user_skills_assets.uq_user_skills_assets_id_user'
    ) THEN
        ALTER TABLE public.user_skills_assets DROP CONSTRAINT IF EXISTS uq_user_skills_assets_id_user;
        DELETE FROM public._migration_schema_ownership 
        WHERE migration_id = '000023' AND object_name = 'user_skills_assets.uq_user_skills_assets_id_user';
    END IF;

    DELETE FROM public._migration_schema_ownership WHERE migration_id = '000023';
    RAISE NOTICE '000023 DOWN: Rollback completed cleanly.';
END $$;
