-- ============================================================================
-- MIGRATION 000029: PHASE 7 NOTIFICATIONS, GOVERNANCE & OPERATIONS (DOWN)
-- Rollback for Phase 7 operations and governance schema
-- ============================================================================

DO $$
BEGIN
    -- 1. Drop Admin Audit Logs
    DROP RULE IF EXISTS admin_audit_logs_no_delete ON public.admin_audit_logs;
    DROP RULE IF EXISTS admin_audit_logs_no_update ON public.admin_audit_logs;
    DROP INDEX IF EXISTS public.idx_admin_audit_logs_created_at;
    DROP INDEX IF EXISTS public.idx_admin_audit_logs_entity;
    DROP INDEX IF EXISTS public.idx_admin_audit_logs_actor;
    DROP TABLE IF EXISTS public.admin_audit_logs CASCADE;

    -- 2. Drop Incidents Telemetry Columns and Indexes
    DROP INDEX IF EXISTS public.idx_incidents_handler;
    DROP INDEX IF EXISTS public.idx_incidents_status;
    ALTER TABLE public.incidents_telemetry DROP COLUMN IF EXISTS internal_notes;
    ALTER TABLE public.incidents_telemetry DROP COLUMN IF EXISTS resolved_at;
    ALTER TABLE public.incidents_telemetry DROP COLUMN IF EXISTS resolution_notes;
    ALTER TABLE public.incidents_telemetry DROP COLUMN IF EXISTS handler_id;

    -- 3. Drop Users Suspension Columns and Indexes
    DROP INDEX IF EXISTS public.idx_users_is_suspended;
    ALTER TABLE public.users DROP COLUMN IF EXISTS suspended_by;
    ALTER TABLE public.users DROP COLUMN IF EXISTS suspended_at;
    ALTER TABLE public.users DROP COLUMN IF EXISTS suspension_reason;
    ALTER TABLE public.users DROP COLUMN IF EXISTS is_suspended;

    -- 4. Drop Notifications Locking Columns and Indexes
    DROP INDEX IF EXISTS public.idx_notifications_locked;
    ALTER TABLE public.notifications DROP COLUMN IF EXISTS locked_at;
    ALTER TABLE public.notifications DROP COLUMN IF EXISTS locked_by;

    -- 5. Drop User Notification Preferences
    DROP INDEX IF EXISTS public.idx_user_notif_prefs_user;
    DROP TABLE IF EXISTS public.user_notification_preferences CASCADE;

    -- 6. Cleanup Migration Schema Ownership
    DELETE FROM public._migration_schema_ownership WHERE migration_id = '000029';

END $$;

