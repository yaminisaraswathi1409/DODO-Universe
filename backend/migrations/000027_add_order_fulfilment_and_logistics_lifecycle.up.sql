-- ============================================================================
-- MIGRATION 000027: ORDER FULFILMENT & LOGISTICS LIFECYCLE (UP)
-- Phase 6: Extended Way Manifests, Vehicle-Driver Pairings, and Delivery Verification
-- ============================================================================

DO $$
BEGIN
    -- 1. Extend way_manifests table with vendor, provider, addresses, cargo and structured PoL/PoD fields
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'vendor_id'
    ) THEN
        ALTER TABLE public.way_manifests ADD COLUMN vendor_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'transport_provider_id'
    ) THEN
        ALTER TABLE public.way_manifests ADD COLUMN transport_provider_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'pickup_address'
    ) THEN
        ALTER TABLE public.way_manifests ADD COLUMN pickup_address TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'delivery_address'
    ) THEN
        ALTER TABLE public.way_manifests ADD COLUMN delivery_address TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'cargo_description'
    ) THEN
        ALTER TABLE public.way_manifests ADD COLUMN cargo_description TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'cargo_quantity'
    ) THEN
        ALTER TABLE public.way_manifests ADD COLUMN cargo_quantity NUMERIC(12, 2) DEFAULT 0;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'cargo_unit'
    ) THEN
        ALTER TABLE public.way_manifests ADD COLUMN cargo_unit VARCHAR(50);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'expected_pickup_at'
    ) THEN
        ALTER TABLE public.way_manifests ADD COLUMN expected_pickup_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'expected_delivery_at'
    ) THEN
        ALTER TABLE public.way_manifests ADD COLUMN expected_delivery_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'pol_data'
    ) THEN
        ALTER TABLE public.way_manifests ADD COLUMN pol_data JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'pod_data'
    ) THEN
        ALTER TABLE public.way_manifests ADD COLUMN pod_data JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE public.way_manifests ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;

    -- 2. Extend vehicle_driver_pairings table with opportunity and manifest linkage
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vehicle_driver_pairings' AND column_name = 'opportunity_id'
    ) THEN
        ALTER TABLE public.vehicle_driver_pairings ADD COLUMN opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vehicle_driver_pairings' AND column_name = 'manifest_id'
    ) THEN
        ALTER TABLE public.vehicle_driver_pairings ADD COLUMN manifest_id UUID REFERENCES public.way_manifests(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vehicle_driver_pairings' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE public.vehicle_driver_pairings ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;
    END IF;

    -- 3. Create indexes for rapid lookup of active manifests and assignments
    CREATE INDEX IF NOT EXISTS idx_way_manifests_vendor ON public.way_manifests(vendor_id);
    CREATE INDEX IF NOT EXISTS idx_way_manifests_transport_provider ON public.way_manifests(transport_provider_id);
    CREATE INDEX IF NOT EXISTS idx_way_manifests_status ON public.way_manifests(status);
    CREATE INDEX IF NOT EXISTS idx_vehicle_driver_pairings_opp ON public.vehicle_driver_pairings(opportunity_id);
    CREATE INDEX IF NOT EXISTS idx_vehicle_driver_pairings_manifest ON public.vehicle_driver_pairings(manifest_id);
    CREATE INDEX IF NOT EXISTS idx_vehicle_driver_pairings_status ON public.vehicle_driver_pairings(status);

    -- 4. Record schema ownership
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
        ('000027', 'COLUMN', 'public', 'way_manifests.vendor_id'),
        ('000027', 'COLUMN', 'public', 'way_manifests.transport_provider_id'),
        ('000027', 'COLUMN', 'public', 'way_manifests.pickup_address'),
        ('000027', 'COLUMN', 'public', 'way_manifests.delivery_address'),
        ('000027', 'COLUMN', 'public', 'way_manifests.cargo_description'),
        ('000027', 'COLUMN', 'public', 'way_manifests.cargo_quantity'),
        ('000027', 'COLUMN', 'public', 'way_manifests.cargo_unit'),
        ('000027', 'COLUMN', 'public', 'way_manifests.expected_pickup_at'),
        ('000027', 'COLUMN', 'public', 'way_manifests.expected_delivery_at'),
        ('000027', 'COLUMN', 'public', 'way_manifests.pol_data'),
        ('000027', 'COLUMN', 'public', 'way_manifests.pod_data'),
        ('000027', 'COLUMN', 'public', 'way_manifests.metadata'),
        ('000027', 'COLUMN', 'public', 'vehicle_driver_pairings.opportunity_id'),
        ('000027', 'COLUMN', 'public', 'vehicle_driver_pairings.manifest_id'),
        ('000027', 'COLUMN', 'public', 'vehicle_driver_pairings.metadata'),
        ('000027', 'INDEX', 'public', 'idx_way_manifests_vendor'),
        ('000027', 'INDEX', 'public', 'idx_way_manifests_transport_provider'),
        ('000027', 'INDEX', 'public', 'idx_way_manifests_status'),
        ('000027', 'INDEX', 'public', 'idx_vehicle_driver_pairings_opp'),
        ('000027', 'INDEX', 'public', 'idx_vehicle_driver_pairings_manifest'),
        ('000027', 'INDEX', 'public', 'idx_vehicle_driver_pairings_status')
    ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;

END $$;

