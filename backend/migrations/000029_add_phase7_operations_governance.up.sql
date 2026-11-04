-- ============================================================================
-- MIGRATION 000029: PHASE 7 NOTIFICATIONS, GOVERNANCE & OPERATIONS (UP)
-- Adds user notification preferences, atomic dispatch queue locking,
-- vendor suspension governance, incident escalation fields, and admin audit logging.
-- ============================================================================

DO $$
BEGIN
    -- 1. Create User Notification Preferences Table
    CREATE TABLE IF NOT EXISTS public.user_notification_preferences (
        user_id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
        in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        disabled_categories TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_user_notif_prefs_user ON public.user_notification_preferences (user_id);

    -- 2. Add Worker Claiming & Locking Columns to Persistent Notifications
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS locked_by VARCHAR(100);
    ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_notifications_locked ON public.notifications (locked_by, locked_at);

    -- 3. Add Vendor Suspension & Governance Columns to Users Table
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS suspension_reason TEXT;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS suspended_by UUID REFERENCES public.users(id);

    CREATE INDEX IF NOT EXISTS idx_users_is_suspended ON public.users (is_suspended) WHERE is_suspended = TRUE;

    -- 4. Extend Incidents Telemetry for Operations Escalation & Management
    ALTER TABLE public.incidents_telemetry ADD COLUMN IF NOT EXISTS handler_id UUID REFERENCES public.users(id);
    ALTER TABLE public.incidents_telemetry ADD COLUMN IF NOT EXISTS resolution_notes TEXT;
    ALTER TABLE public.incidents_telemetry ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
    ALTER TABLE public.incidents_telemetry ADD COLUMN IF NOT EXISTS internal_notes JSONB NOT NULL DEFAULT '[]'::jsonb;

    CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents_telemetry (status);
    CREATE INDEX IF NOT EXISTS idx_incidents_handler ON public.incidents_telemetry (handler_id);

    -- 5. Create Admin Operations Audit Logs Table
    CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
        actor_role VARCHAR(50) NOT NULL,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id UUID,
        previous_state JSONB DEFAULT NULL,
        new_state JSONB DEFAULT NULL,
        reason TEXT,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON public.admin_audit_logs (actor_id);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_entity ON public.admin_audit_logs (entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON public.admin_audit_logs (created_at DESC);

    -- 6. Enforce Database-level Immutability on Admin Audit Logs
    CREATE OR REPLACE RULE admin_audit_logs_no_update AS 
        ON UPDATE TO public.admin_audit_logs DO INSTEAD NOTHING;
    CREATE OR REPLACE RULE admin_audit_logs_no_delete AS 
        ON DELETE TO public.admin_audit_logs DO INSTEAD NOTHING;

    -- 7. Record Schema Ownership
    CREATE TABLE IF NOT EXISTS public._migration_schema_ownership (
        migration_id VARCHAR(50) NOT NULL,
        object_type VARCHAR(50) NOT NULL,
        object_schema VARCHAR(50) NOT NULL DEFAULT 'public',
        object_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (object_type, object_schema, object_name)
    );

    INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
    VALUES
        ('000029', 'TABLE', 'public', 'user_notification_preferences'),
        ('000029', 'INDEX', 'public', 'idx_user_notif_prefs_user'),
        ('000029', 'COLUMN', 'public', 'notifications.locked_by'),
        ('000029', 'COLUMN', 'public', 'notifications.locked_at'),
        ('000029', 'INDEX', 'public', 'idx_notifications_locked'),
        ('000029', 'COLUMN', 'public', 'users.is_suspended'),
        ('000029', 'COLUMN', 'public', 'users.suspension_reason'),
        ('000029', 'COLUMN', 'public', 'users.suspended_at'),
        ('000029', 'COLUMN', 'public', 'users.suspended_by'),
        ('000029', 'INDEX', 'public', 'idx_users_is_suspended'),
        ('000029', 'COLUMN', 'public', 'incidents_telemetry.handler_id'),
        ('000029', 'COLUMN', 'public', 'incidents_telemetry.resolution_notes'),
        ('000029', 'COLUMN', 'public', 'incidents_telemetry.resolved_at'),
        ('000029', 'COLUMN', 'public', 'incidents_telemetry.internal_notes'),
        ('000029', 'INDEX', 'public', 'idx_incidents_status'),
        ('000029', 'INDEX', 'public', 'idx_incidents_handler'),
        ('000029', 'TABLE', 'public', 'admin_audit_logs'),
        ('000029', 'RULE', 'public', 'admin_audit_logs_no_update'),
        ('000029', 'RULE', 'public', 'admin_audit_logs_no_delete'),
        ('000029', 'INDEX', 'public', 'idx_admin_audit_logs_actor'),
        ('000029', 'INDEX', 'public', 'idx_admin_audit_logs_entity'),
        ('000029', 'INDEX', 'public', 'idx_admin_audit_logs_created_at')
    ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;

END $$;

