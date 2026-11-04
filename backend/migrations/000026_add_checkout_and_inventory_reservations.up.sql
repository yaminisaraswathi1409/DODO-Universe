-- ============================================================================
-- MIGRATION 000026: CHECKOUT, PAYMENT & INVENTORY RESERVATIONS (UP)
-- Phase 5: Safe inventory reservation, server-authoritative checkout, payment tracking
-- ============================================================================

DO $$
BEGIN
    -- 1. Ensure reserved_quantity column exists on vendor_catalog_items
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vendor_catalog_items' AND column_name = 'reserved_quantity'
    ) THEN
        ALTER TABLE public.vendor_catalog_items ADD COLUMN reserved_quantity INT NOT NULL DEFAULT 0;
    END IF;

    -- 2. Inventory Reservations Table
    CREATE TABLE IF NOT EXISTS public.inventory_reservations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        catalog_item_id UUID NOT NULL REFERENCES public.vendor_catalog_items(id) ON DELETE CASCADE,
        opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        quantity INT NOT NULL CHECK (quantity > 0),
        status VARCHAR(50) NOT NULL DEFAULT 'RESERVED',
        idempotency_key VARCHAR(255) UNIQUE,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_reservation_status CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED', 'EXPIRED'))
    );

    -- 3. Indexes for fast inventory lookup and concurrency management
    CREATE INDEX IF NOT EXISTS idx_res_catalog_status ON public.inventory_reservations(catalog_item_id, status);
    CREATE INDEX IF NOT EXISTS idx_res_expires ON public.inventory_reservations(expires_at, status);
    CREATE INDEX IF NOT EXISTS idx_res_opp ON public.inventory_reservations(opportunity_id);

    -- 4. Payment Transactions Table
    CREATE TABLE IF NOT EXISTS public.payment_transactions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        amount NUMERIC(12, 2) NOT NULL CHECK (amount >= 0),
        currency VARCHAR(10) NOT NULL DEFAULT 'INR',
        payment_method VARCHAR(50) NOT NULL DEFAULT 'GATEWAY_SIMULATED',
        payment_reference VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
        callback_signature VARCHAR(255),
        callback_payload JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_payment_status CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED', 'REFUNDED'))
    );

    CREATE INDEX IF NOT EXISTS idx_pay_opp ON public.payment_transactions(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_pay_ref ON public.payment_transactions(payment_reference);
    CREATE INDEX IF NOT EXISTS idx_pay_status ON public.payment_transactions(status);

    -- 5. Track schema ownership
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
        ('000026', 'TABLE', 'public', 'inventory_reservations'),
        ('000026', 'TABLE', 'public', 'payment_transactions'),
        ('000026', 'COLUMN', 'public', 'vendor_catalog_items.reserved_quantity'),
        ('000026', 'INDEX', 'public', 'idx_res_catalog_status'),
        ('000026', 'INDEX', 'public', 'idx_res_expires'),
        ('000026', 'INDEX', 'public', 'idx_res_opp'),
        ('000026', 'INDEX', 'public', 'idx_pay_opp'),
        ('000026', 'INDEX', 'public', 'idx_pay_ref'),
        ('000026', 'INDEX', 'public', 'idx_pay_status')
    ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;

END $$;

