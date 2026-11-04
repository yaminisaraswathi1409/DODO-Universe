-- ============================================================================
-- MIGRATION 000022: PLATFORM CATEGORY HIERARCHY (UP)
-- Fully Idempotent, Set-Validated Snapshotting, Dynamic Hierarchy, Cycle Audit
-- ============================================================================

DO $$
DECLARE
    v_backup_exists BOOLEAN;
    v_missing_in_backup INTEGER;
    v_unexpected_in_backup INTEGER;
    v_col_record RECORD;
    v_cycle_count INTEGER;
    v_cycle_path TEXT;
BEGIN
    -- ------------------------------------------------------------------------
    -- 1. INITIALIZE SCHEMA OWNERSHIP TRACKER
    -- ------------------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS public._migration_schema_ownership (
        migration_id VARCHAR(50) NOT NULL,
        object_type VARCHAR(50) NOT NULL,
        object_schema VARCHAR(50) NOT NULL DEFAULT 'public',
        object_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (object_type, object_schema, object_name)
    );

    -- ------------------------------------------------------------------------
    -- 2. EXACT SNAPSHOT VALIDATION / BACKUP CAPTURE
    -- ------------------------------------------------------------------------
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = '_migration_000022_category_backup'
    ) INTO v_backup_exists;

    IF v_backup_exists THEN
        -- Validate that the backup contains every single one of the 21 expected UUID/slug pairs
        SELECT COUNT(*) INTO v_missing_in_backup
        FROM (VALUES 
            ('c7dd5d0d-f3d8-4746-8731-0ab92e3dc225'::uuid, 'agriculture-farming'),
            ('b98a0f2b-fbb5-4c3a-ae03-98338f5d9422'::uuid, 'auto-parts-procurement'),
            ('bd83cd6a-d746-4b31-9050-1575bc48e39d'::uuid, 'bricks-building-materials'),
            ('9f1e9805-6c85-49f7-b759-bfa63eb82147'::uuid, 'cement-construction'),
            ('35d6d550-593a-4d60-bb10-957b39679538'::uuid, 'commercial-driver'),
            ('47bd2e2d-5c7d-4216-9ec0-3d392c9cd6ed'::uuid, 'commuter-micro-logistics'),
            ('159f6e93-f096-4c51-8ae8-8f4e95b55b95'::uuid, 'construction-labour'),
            ('37098e77-3236-4eaa-86ce-c8142bfdee37'::uuid, 'education-tutoring'),
            ('2660ad1f-6b5a-46a9-8fff-e1d123522f2c'::uuid, 'roadside-repair'),
            ('befe1dec-6fa8-46c1-bf45-194bc9d88dfb'::uuid, 'equipment-machinery'),
            ('c2abd5dd-51e6-4def-b89a-a309b1067dfa'::uuid, 'essential-medicine-delivery'),
            ('d205266f-1a13-47b4-9033-2b4f65b3b9be'::uuid, 'farm-labour'),
            ('3d32aeae-1ae4-4580-8f79-84d50fb02235'::uuid, 'flatbed-transport'),
            ('7f470cf2-4045-4595-bcec-59ea93263693'::uuid, 'home-services'),
            ('40f1120d-0255-4160-8186-3d8946fa62f3'::uuid, 'labour-services'),
            ('27bbe15c-08d1-47f9-8ac3-ab05c2566e1c'::uuid, 'logistics-transport'),
            ('167f4300-7752-4eed-ae1d-96ca53741e07'::uuid, 'medicine-healthcare'),
            ('14f1944a-9956-475c-a976-a8d4aca00c1a'::uuid, 'solar-panel-installation'),
            ('3c02b631-0e69-4b85-aa94-ecf415c25ac7'::uuid, 'solar-panel-installation-&-maintenance'),
            ('af525b30-1ac0-455f-8362-bf3192d4b858'::uuid, 'vehicle-repair'),
            ('ecbfe66a-80dc-4b09-9bc7-dad48c6384c5'::uuid, 'water-supply')
        ) AS v(target_id, target_slug)
        LEFT JOIN public._migration_000022_category_backup b 
          ON b.id = v.target_id AND b.slug = v.target_slug
        WHERE b.id IS NULL;

        SELECT COUNT(*) INTO v_unexpected_in_backup
        FROM public._migration_000022_category_backup b
        WHERE b.id NOT IN (
            'c7dd5d0d-f3d8-4746-8731-0ab92e3dc225'::uuid, 'b98a0f2b-fbb5-4c3a-ae03-98338f5d9422'::uuid,
            'bd83cd6a-d746-4b31-9050-1575bc48e39d'::uuid, '9f1e9805-6c85-49f7-b759-bfa63eb82147'::uuid,
            '35d6d550-593a-4d60-bb10-957b39679538'::uuid, '47bd2e2d-5c7d-4216-9ec0-3d392c9cd6ed'::uuid,
            '159f6e93-f096-4c51-8ae8-8f4e95b55b95'::uuid, '37098e77-3236-4eaa-86ce-c8142bfdee37'::uuid,
            '2660ad1f-6b5a-46a9-8fff-e1d123522f2c'::uuid, 'befe1dec-6fa8-46c1-bf45-194bc9d88dfb'::uuid,
            'c2abd5dd-51e6-4def-b89a-a309b1067dfa'::uuid, 'd205266f-1a13-47b4-9033-2b4f65b3b9be'::uuid,
            '3d32aeae-1ae4-4580-8f79-84d50fb02235'::uuid, '7f470cf2-4045-4595-bcec-59ea93263693'::uuid,
            '40f1120d-0255-4160-8186-3d8946fa62f3'::uuid, '27bbe15c-08d1-47f9-8ac3-ab05c2566e1c'::uuid,
            '167f4300-7752-4eed-ae1d-96ca53741e07'::uuid, '14f1944a-9956-475c-a976-a8d4aca00c1a'::uuid,
            '3c02b631-0e69-4b85-aa94-ecf415c25ac7'::uuid, 'af525b30-1ac0-455f-8362-bf3192d4b858'::uuid,
            'ecbfe66a-80dc-4b09-9bc7-dad48c6384c5'::uuid
        );

        IF v_missing_in_backup > 0 OR v_unexpected_in_backup > 0 THEN
            RAISE EXCEPTION '000022: Invalid snapshot in _migration_000022_category_backup (% missing, % unexpected).',
                v_missing_in_backup, v_unexpected_in_backup;
        END IF;
        RAISE NOTICE '000022: Pre-existing category backup snapshot verified.';
    ELSE
        CREATE TABLE public._migration_000022_category_backup AS 
        SELECT *, NOW() AS _snapshot_taken_at 
        FROM public.categories;

        IF (SELECT COUNT(*) FROM public._migration_000022_category_backup) <> 21 THEN
            RAISE EXCEPTION '000022: Newly created backup count mismatch (expected 21 rows).';
        END IF;
        RAISE NOTICE '000022: Immutable backup of 21 category rows successfully created.';
    END IF;

    -- ------------------------------------------------------------------------
    -- 3. VALIDATE PRE-EXISTING COLUMNS & DATA TYPES
    -- ------------------------------------------------------------------------
    FOR v_col_record IN 
        SELECT column_name, udt_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'categories'
          AND column_name IN ('parent_id', 'level', 'path', 'display_order', 'is_selectable')
    LOOP
        IF v_col_record.column_name = 'parent_id' AND v_col_record.udt_name <> 'uuid' THEN
            RAISE EXCEPTION '000022: Column categories.parent_id has incompatible type % (expected uuid).', v_col_record.udt_name;
        ELSIF v_col_record.column_name = 'level' AND v_col_record.udt_name NOT IN ('int4', 'integer') THEN
            RAISE EXCEPTION '000022: Column categories.level has incompatible type % (expected integer).', v_col_record.udt_name;
        ELSIF v_col_record.column_name = 'path' AND v_col_record.udt_name <> 'text' THEN
            RAISE EXCEPTION '000022: Column categories.path has incompatible type % (expected text).', v_col_record.udt_name;
        ELSIF v_col_record.column_name = 'is_selectable' AND v_col_record.udt_name <> 'bool' THEN
            RAISE EXCEPTION '000022: Column categories.is_selectable has incompatible type % (expected bool).', v_col_record.udt_name;
        END IF;
    END LOOP;

    -- ------------------------------------------------------------------------
    -- 4. ADD COLUMNS ONLY IF ABSENT & RECORD OWNERSHIP
    -- ------------------------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'parent_id') THEN
        ALTER TABLE public.categories ADD COLUMN parent_id UUID REFERENCES public.categories(id) ON DELETE RESTRICT;
        INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
        VALUES ('000022', 'COLUMN', 'public', 'categories.parent_id')
        ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'level') THEN
        ALTER TABLE public.categories ADD COLUMN level INTEGER NOT NULL DEFAULT 1;
        INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
        VALUES ('000022', 'COLUMN', 'public', 'categories.level')
        ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'path') THEN
        ALTER TABLE public.categories ADD COLUMN path TEXT NOT NULL DEFAULT '';
        INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
        VALUES ('000022', 'COLUMN', 'public', 'categories.path')
        ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'display_order') THEN
        ALTER TABLE public.categories ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;
        INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
        VALUES ('000022', 'COLUMN', 'public', 'categories.display_order')
        ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'is_selectable') THEN
        ALTER TABLE public.categories ADD COLUMN is_selectable BOOLEAN NOT NULL DEFAULT true;
        INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
        VALUES ('000022', 'COLUMN', 'public', 'categories.is_selectable')
        ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;
    END IF;

    -- ------------------------------------------------------------------------
    -- 5. CREATE INDEXES ONLY IF ABSENT & RECORD OWNERSHIP
    -- ------------------------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'categories' AND indexname = 'idx_categories_parent') THEN
        CREATE INDEX idx_categories_parent ON public.categories(parent_id);
        INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
        VALUES ('000022', 'INDEX', 'public', 'idx_categories_parent')
        ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'categories' AND indexname = 'idx_categories_active_selectable') THEN
        CREATE INDEX idx_categories_active_selectable ON public.categories(is_active, is_selectable);
        INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
        VALUES ('000022', 'INDEX', 'public', 'idx_categories_active_selectable')
        ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;
    END IF;

    -- ------------------------------------------------------------------------
    -- 6. INSERT 8 LEVEL-1 GROUPINGS SAFELY (NO BLIND OVERWRITE)
    -- ------------------------------------------------------------------------
    IF EXISTS (
        SELECT 1 FROM public.categories c
        JOIN (VALUES 
            ('a1000000-0000-0000-0000-000000000001'::uuid, 'building-construction-supplies'),
            ('a1000000-0000-0000-0000-000000000002'::uuid, 'freight-transport-logistics'),
            ('a1000000-0000-0000-0000-000000000003'::uuid, 'automotive-machinery-repair'),
            ('a1000000-0000-0000-0000-000000000004'::uuid, 'agriculture-farming-equipment'),
            ('a1000000-0000-0000-0000-000000000005'::uuid, 'manpower-labour-services'),
            ('a1000000-0000-0000-0000-000000000006'::uuid, 'healthcare-pharmaceutical-services'),
            ('a1000000-0000-0000-0000-000000000007'::uuid, 'education-vocational-skills'),
            ('a1000000-0000-0000-0000-000000000008'::uuid, 'facility-home-maintenance')
        ) AS v(target_id, target_slug)
        ON (c.id = v.target_id AND c.slug <> v.target_slug)
        OR (c.slug = v.target_slug AND c.id <> v.target_id)
    ) THEN
        RAISE EXCEPTION '000022: Cross-matched UUID/slug collision detected among proposed groupings.';
    END IF;

    INSERT INTO public.categories (
        id, slug, name, description, icon, is_active, 
        parent_id, level, path, display_order, is_selectable
    )
    VALUES 
    ('a1000000-0000-0000-0000-000000000001', 'building-construction-supplies', 'Building & Construction Supplies', 'Structural materials, cement, bricks, stone aggregates', 'cube', true, NULL, 1, 'a1000000-0000-0000-0000-000000000001', 1, false),
    ('a1000000-0000-0000-0000-000000000002', 'freight-transport-logistics', 'Freight Transport & Logistics', 'Long-haul freight, flatbed logistics, commercial transport', 'truck', true, NULL, 1, 'a1000000-0000-0000-0000-000000000002', 2, false),
    ('a1000000-0000-0000-0000-000000000003', 'automotive-machinery-repair', 'Automotive & Machinery Repair', 'Emergency roadside mechanics, spare parts, vehicle maintenance', 'wrench', true, NULL, 1, 'a1000000-0000-0000-0000-000000000003', 3, false),
    ('a1000000-0000-0000-0000-000000000004', 'agriculture-farming-equipment', 'Agriculture & Farming Services', 'Tractor rental, agricultural implements, harvest workforce', 'tractor', true, NULL, 1, 'a1000000-0000-0000-0000-000000000004', 4, false),
    ('a1000000-0000-0000-0000-000000000005', 'manpower-labour-services', 'Manpower & Labour Services', 'Construction helpers, warehouse labor, daily wage crews', 'users', true, NULL, 1, 'a1000000-0000-0000-0000-000000000005', 5, false),
    ('a1000000-0000-0000-0000-000000000006', 'healthcare-pharmaceutical-services', 'Healthcare & Pharmaceutical Services', 'Doorstep medicine procurement, diagnostic courier', 'heart-pulse', true, NULL, 1, 'a1000000-0000-0000-0000-000000000006', 6, false),
    ('a1000000-0000-0000-0000-000000000007', 'education-vocational-skills', 'Education & Vocational Skills', 'Academic tutoring, trade skills coaching, training', 'graduation-cap', true, NULL, 1, 'a1000000-0000-0000-0000-000000000007', 7, false),
    ('a1000000-0000-0000-0000-000000000008', 'facility-home-maintenance', 'Facility & Home Maintenance', 'Plumbing, electrical installation, carpentry, site repair', 'home', true, NULL, 1, 'a1000000-0000-0000-0000-000000000008', 8, false)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
    VALUES 
        ('000022', 'CATEGORY_GROUPING', 'public', 'a1000000-0000-0000-0000-000000000001'),
        ('000022', 'CATEGORY_GROUPING', 'public', 'a1000000-0000-0000-0000-000000000002'),
        ('000022', 'CATEGORY_GROUPING', 'public', 'a1000000-0000-0000-0000-000000000003'),
        ('000022', 'CATEGORY_GROUPING', 'public', 'a1000000-0000-0000-0000-000000000004'),
        ('000022', 'CATEGORY_GROUPING', 'public', 'a1000000-0000-0000-0000-000000000005'),
        ('000022', 'CATEGORY_GROUPING', 'public', 'a1000000-0000-0000-0000-000000000006'),
        ('000022', 'CATEGORY_GROUPING', 'public', 'a1000000-0000-0000-0000-000000000007'),
        ('000022', 'CATEGORY_GROUPING', 'public', 'a1000000-0000-0000-0000-000000000008')
    ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;

    -- ------------------------------------------------------------------------
    -- 7. RE-PARENT 17 CHILD CATEGORIES & CONFIGURE STANDALONES
    -- ------------------------------------------------------------------------
    UPDATE public.categories SET parent_id = 'a1000000-0000-0000-0000-000000000001', level = 2, path = 'a1000000-0000-0000-0000-000000000001/' || id::text, is_selectable = true WHERE id IN ('bd83cd6a-d746-4b31-9050-1575bc48e39d', '9f1e9805-6c85-49f7-b759-bfa63eb82147');
    UPDATE public.categories SET parent_id = 'a1000000-0000-0000-0000-000000000002', level = 2, path = 'a1000000-0000-0000-0000-000000000002/' || id::text, is_selectable = true WHERE id IN ('27bbe15c-08d1-47f9-8ac3-ab05c2566e1c', '3d32aeae-1ae4-4580-8f79-84d50fb02235', '35d6d550-593a-4d60-bb10-957b39679538');
    UPDATE public.categories SET parent_id = 'a1000000-0000-0000-0000-000000000003', level = 2, path = 'a1000000-0000-0000-0000-000000000003/' || id::text, is_selectable = true WHERE id IN ('af525b30-1ac0-455f-8362-bf3192d4b858', '2660ad1f-6b5a-46a9-8fff-e1d123522f2c', 'b98a0f2b-fbb5-4c3a-ae03-98338f5d9422');
    UPDATE public.categories SET parent_id = 'a1000000-0000-0000-0000-000000000004', level = 2, path = 'a1000000-0000-0000-0000-000000000004/' || id::text, is_selectable = true WHERE id IN ('c7dd5d0d-f3d8-4746-8731-0ab92e3dc225', 'd205266f-1a13-47b4-9033-2b4f65b3b9be', 'befe1dec-6fa8-46c1-bf45-194bc9d88dfb');
    UPDATE public.categories SET parent_id = 'a1000000-0000-0000-0000-000000000005', level = 2, path = 'a1000000-0000-0000-0000-000000000005/' || id::text, is_selectable = true WHERE id IN ('40f1120d-0255-4160-8186-3d8946fa62f3', '159f6e93-f096-4c51-8ae8-8f4e95b55b95');
    UPDATE public.categories SET parent_id = 'a1000000-0000-0000-0000-000000000006', level = 2, path = 'a1000000-0000-0000-0000-000000000006/' || id::text, is_selectable = true WHERE id IN ('167f4300-7752-4eed-ae1d-96ca53741e07', 'c2abd5dd-51e6-4def-b89a-a309b1067dfa');
    UPDATE public.categories SET parent_id = 'a1000000-0000-0000-0000-000000000007', level = 2, path = 'a1000000-0000-0000-0000-000000000007/' || id::text, is_selectable = true WHERE id IN ('37098e77-3236-4eaa-86ce-c8142bfdee37');
    UPDATE public.categories SET parent_id = 'a1000000-0000-0000-0000-000000000008', level = 2, path = 'a1000000-0000-0000-0000-000000000008/' || id::text, is_selectable = true WHERE id IN ('7f470cf2-4045-4595-bcec-59ea93263693');

    -- Standalone categories remain Level 1, selectable, parent_id IS NULL
    UPDATE public.categories SET parent_id = NULL, level = 1, path = id::text, is_selectable = true
    WHERE id IN (
        '47bd2e2d-5c7d-4216-9ec0-3d392c9cd6ed', 'ecbfe66a-80dc-4b09-9bc7-dad48c6384c5',
        '14f1944a-9956-475c-a976-a8d4aca00c1a', '3c02b631-0e69-4b85-aa94-ecf415c25ac7'
    );

    -- ------------------------------------------------------------------------
    -- 8. UNBOUNDED VISITED-PATH RECURSIVE CYCLE AUDIT
    -- ------------------------------------------------------------------------
    WITH RECURSIVE category_tree AS (
        SELECT id, parent_id, ARRAY[id] AS path, false AS is_cycle
        FROM public.categories
        WHERE parent_id IS NOT NULL

        UNION ALL

        SELECT c.id, c.parent_id, ct.path || c.id, c.id = ANY(ct.path) AS is_cycle
        FROM public.categories c
        JOIN category_tree ct ON c.id = ct.parent_id
        WHERE NOT ct.is_cycle
    )
    SELECT COUNT(*), array_to_string((ARRAY_AGG(path))[1], ' -> ')
    INTO v_cycle_count, v_cycle_path
    FROM category_tree 
    WHERE is_cycle;

    IF v_cycle_count > 0 THEN
        RAISE EXCEPTION '000022: Cycle detected in platform category hierarchy! Cycle path: %', v_cycle_path;
    END IF;

    RAISE NOTICE '000022: Platform category hierarchy successfully updated and verified acyclic.';
END $$;
