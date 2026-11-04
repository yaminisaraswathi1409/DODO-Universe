-- ============================================================================
-- MIGRATION 000022: PLATFORM CATEGORY HIERARCHY (DOWN)
-- Dynamic Foreign-Key Inspection, Exact Restoration, Clean Ownership Removal
-- ============================================================================

DO $$
DECLARE
    v_missing_in_backup INTEGER;
    v_grouping_ids UUID[];
    v_fk_record RECORD;
    v_dep_count INTEGER;
    v_obj_record RECORD;
BEGIN
    -- ------------------------------------------------------------------------
    -- 1. VERIFY BACKUP INTEGRITY BEFORE RESTORATION
    -- ------------------------------------------------------------------------
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = '_migration_000022_category_backup') THEN
        RAISE EXCEPTION '000022 DOWN: Snapshot table _migration_000022_category_backup is missing. Rollback aborted.';
    END IF;

    -- Verify all 21 categories are present in the backup
    SELECT COUNT(*) INTO v_missing_in_backup
    FROM (VALUES 
        ('c7dd5d0d-f3d8-4746-8731-0ab92e3dc225'::uuid), ('b98a0f2b-fbb5-4c3a-ae03-98338f5d9422'::uuid),
        ('bd83cd6a-d746-4b31-9050-1575bc48e39d'::uuid), ('9f1e9805-6c85-49f7-b759-bfa63eb82147'::uuid),
        ('35d6d550-593a-4d60-bb10-957b39679538'::uuid), ('47bd2e2d-5c7d-4216-9ec0-3d392c9cd6ed'::uuid),
        ('159f6e93-f096-4c51-8ae8-8f4e95b55b95'::uuid), ('37098e77-3236-4eaa-86ce-c8142bfdee37'::uuid),
        ('2660ad1f-6b5a-46a9-8fff-e1d123522f2c'::uuid), ('befe1dec-6fa8-46c1-bf45-194bc9d88dfb'::uuid),
        ('c2abd5dd-51e6-4def-b89a-a309b1067dfa'::uuid), ('d205266f-1a13-47b4-9033-2b4f65b3b9be'::uuid),
        ('3d32aeae-1ae4-4580-8f79-84d50fb02235'::uuid), ('7f470cf2-4045-4595-bcec-59ea93263693'::uuid),
        ('40f1120d-0255-4160-8186-3d8946fa62f3'::uuid), ('27bbe15c-08d1-47f9-8ac3-ab05c2566e1c'::uuid),
        ('167f4300-7752-4eed-ae1d-96ca53741e07'::uuid), ('14f1944a-9956-475c-a976-a8d4aca00c1a'::uuid),
        ('3c02b631-0e69-4b85-aa94-ecf415c25ac7'::uuid), ('af525b30-1ac0-455f-8362-bf3192d4b858'::uuid),
        ('ecbfe66a-80dc-4b09-9bc7-dad48c6384c5'::uuid)
    ) AS v(target_id)
    LEFT JOIN public._migration_000022_category_backup b ON b.id = v.target_id
    WHERE b.id IS NULL;

    IF v_missing_in_backup > 0 THEN
        RAISE EXCEPTION '000022 DOWN: Snapshot table is corrupted (% categories missing). Rollback aborted.', v_missing_in_backup;
    END IF;

    -- ------------------------------------------------------------------------
    -- 2. DYNAMIC FOREIGN-KEY AUDIT: REFUSE DELETION IF ANY EXTERNAL ROW DEPENDS ON GROUPINGS
    -- ------------------------------------------------------------------------
    SELECT ARRAY_AGG(object_name::uuid) INTO v_grouping_ids
    FROM public._migration_schema_ownership 
    WHERE migration_id = '000022' AND object_type = 'CATEGORY_GROUPING';

    IF v_grouping_ids IS NOT NULL AND array_length(v_grouping_ids, 1) > 0 THEN
        FOR v_fk_record IN
            SELECT 
                nsp.nspname AS referencing_schema,
                rel.relname AS referencing_table,
                att.attname AS referencing_column,
                con.conname AS constraint_name
            FROM pg_constraint con
            JOIN pg_class rel ON con.conrelid = rel.oid
            JOIN pg_namespace nsp ON rel.relnamespace = nsp.oid
            JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
            WHERE con.confrelid = 'public.categories'::regclass
              AND con.contype = 'f'
              AND rel.relname <> '_migration_000022_category_backup'
        LOOP
            IF v_fk_record.referencing_table = 'categories' AND v_fk_record.referencing_column = 'parent_id' THEN
                -- Self-referencing: verify no categories OUTSIDE the 17 child categories reference groupings
                SELECT COUNT(*) INTO v_dep_count
                FROM public.categories
                WHERE parent_id = ANY(v_grouping_ids)
                  AND id NOT IN (
                    'bd83cd6a-d746-4b31-9050-1575bc48e39d', '9f1e9805-6c85-49f7-b759-bfa63eb82147',
                    '27bbe15c-08d1-47f9-8ac3-ab05c2566e1c', '3d32aeae-1ae4-4580-8f79-84d50fb02235',
                    '35d6d550-593a-4d60-bb10-957b39679538', 'af525b30-1ac0-455f-8362-bf3192d4b858',
                    '2660ad1f-6b5a-46a9-8fff-e1d123522f2c', 'b98a0f2b-fbb5-4c3a-ae03-98338f5d9422',
                    'c7dd5d0d-f3d8-4746-8731-0ab92e3dc225', 'd205266f-1a13-47b4-9033-2b4f65b3b9be',
                    'befe1dec-6fa8-46c1-bf45-194bc9d88dfb', '40f1120d-0255-4160-8186-3d8946fa62f3',
                    '159f6e93-f096-4c51-8ae8-8f4e95b55b95', '167f4300-7752-4eed-ae1d-96ca53741e07',
                    'c2abd5dd-51e6-4def-b89a-a309b1067dfa', '37098e77-3236-4eaa-86ce-c8142bfdee37',
                    '7f470cf2-4045-4595-bcec-59ea93263693'
                  );
            ELSE
                EXECUTE format(
                    'SELECT COUNT(*) FROM %I.%I WHERE %I = ANY($1)',
                    v_fk_record.referencing_schema,
                    v_fk_record.referencing_table,
                    v_fk_record.referencing_column
                ) INTO v_dep_count USING v_grouping_ids;
            END IF;

            IF v_dep_count > 0 THEN
                RAISE EXCEPTION '000022 DOWN: Unsafe rollback! Table %.% has % rows referencing migration groupings via %.',
                    v_fk_record.referencing_schema, v_fk_record.referencing_table, v_dep_count, v_fk_record.constraint_name;
            END IF;
        END LOOP;
    END IF;

    -- ------------------------------------------------------------------------
    -- 3. DETACH CHILD CATEGORIES & RESTORE ORIGINAL ATTRIBUTES
    -- ------------------------------------------------------------------------
    UPDATE public.categories c
    SET 
        parent_id = NULL,
        level = 1,
        path = '',
        name = b.name,
        slug = b.slug,
        description = b.description,
        icon = b.icon,
        is_active = b.is_active,
        updated_at = b.updated_at
    FROM public._migration_000022_category_backup b
    WHERE c.id = b.id;

    -- ------------------------------------------------------------------------
    -- 4. DELETE THE 8 GROUPINGS OWNED BY 000022
    -- ------------------------------------------------------------------------
    DELETE FROM public.categories 
    WHERE id = ANY(v_grouping_ids);

    DELETE FROM public._migration_schema_ownership 
    WHERE migration_id = '000022' AND object_type = 'CATEGORY_GROUPING';

    -- ------------------------------------------------------------------------
    -- 5. DROP INDEXES CREATED BY 000022
    -- ------------------------------------------------------------------------
    FOR v_obj_record IN 
        SELECT object_name 
        FROM public._migration_schema_ownership 
        WHERE migration_id = '000022' AND object_type = 'INDEX'
    LOOP
        EXECUTE format('DROP INDEX IF EXISTS public.%I;', v_obj_record.object_name);
        DELETE FROM public._migration_schema_ownership 
        WHERE migration_id = '000022' AND object_type = 'INDEX' AND object_name = v_obj_record.object_name;
    END LOOP;

    -- ------------------------------------------------------------------------
    -- 6. DROP COLUMNS CREATED BY 000022
    -- ------------------------------------------------------------------------
    FOR v_obj_record IN 
        SELECT split_part(object_name, '.', 2) AS col_name 
        FROM public._migration_schema_ownership 
        WHERE migration_id = '000022' AND object_type = 'COLUMN'
    LOOP
        EXECUTE format('ALTER TABLE public.categories DROP COLUMN IF EXISTS %I;', v_obj_record.col_name);
        DELETE FROM public._migration_schema_ownership 
        WHERE migration_id = '000022' AND object_type = 'COLUMN' AND object_name = 'categories.' || v_obj_record.col_name;
    END LOOP;

    RAISE NOTICE '000022 DOWN: Rollback completed cleanly. _migration_000022_category_backup retained for audit.';
END $$;
