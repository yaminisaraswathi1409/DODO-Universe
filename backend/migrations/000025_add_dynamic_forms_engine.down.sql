-- ============================================================================
-- MIGRATION 000025: REUSABLE DYNAMIC FORMS ENGINE (DOWN)
-- ============================================================================

DO $$
BEGIN
    DROP TABLE IF EXISTS public.form_submissions CASCADE;
    DROP TABLE IF EXISTS public.form_schemas CASCADE;

    DELETE FROM public._migration_schema_ownership WHERE migration_id = '000025';
END $$;

