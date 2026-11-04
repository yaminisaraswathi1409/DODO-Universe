-- ============================================================================
-- MIGRATION 000028: PERSISTENT NOTIFICATIONS & DISPATCH QUEUE (DOWN)
-- Rollback for persistent notifications and dispatch queue indexing
-- ============================================================================

DO $$
BEGIN
    DROP INDEX IF EXISTS public.idx_notifications_dedupe_key;
    DROP INDEX IF EXISTS public.idx_notifications_dispatch_status;
    DROP INDEX IF EXISTS public.idx_notifications_user_unread;
    DROP INDEX IF EXISTS public.idx_notifications_created_at;
    DROP INDEX IF EXISTS public.idx_notifications_user_id;

    DROP TABLE IF EXISTS public.notifications CASCADE;

    DELETE FROM public._migration_schema_ownership WHERE migration_id = '000028';
END $$;

