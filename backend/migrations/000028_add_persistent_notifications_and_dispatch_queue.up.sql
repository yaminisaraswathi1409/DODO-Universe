-- ============================================================================
-- MIGRATION 000028: PERSISTENT NOTIFICATIONS & DISPATCH QUEUE (UP)
-- Extends the existing UOP notification architecture with persistent table,
-- durable indexing, deduplication support, and queue processing.
-- ============================================================================

DO $$
BEGIN
    -- 1. Create persistent notifications table if not exists
    CREATE TABLE IF NOT EXISTS public.notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        type VARCHAR(50) DEFAULT 'INFO',
        metadata JSONB DEFAULT '{}'::jsonb,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- 2. Indexes for user feed, dispatch status, deduplication, and queue processing
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications (user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON public.notifications (user_id, is_read) WHERE is_read = FALSE;
    CREATE INDEX IF NOT EXISTS idx_notifications_dispatch_status ON public.notifications ((metadata->>'status'));
    CREATE INDEX IF NOT EXISTS idx_notifications_dedupe_key ON public.notifications ((metadata->>'dedupe_key'));

    -- 3. Record schema ownership
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
        ('000028', 'TABLE', 'public', 'notifications'),
        ('000028', 'INDEX', 'public', 'idx_notifications_user_id'),
        ('000028', 'INDEX', 'public', 'idx_notifications_created_at'),
        ('000028', 'INDEX', 'public', 'idx_notifications_user_unread'),
        ('000028', 'INDEX', 'public', 'idx_notifications_dispatch_status'),
        ('000028', 'INDEX', 'public', 'idx_notifications_dedupe_key')
    ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;

END $$;

