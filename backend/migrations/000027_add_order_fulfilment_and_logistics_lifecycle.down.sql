-- ============================================================================
-- MIGRATION 000027: ORDER FULFILMENT & LOGISTICS LIFECYCLE (DOWN)
-- Rollback for Phase 6 fulfilment & logistics schema enhancements
-- ============================================================================

DO $$
BEGIN
    -- Drop indexes created in migration 000027
    DROP INDEX IF EXISTS public.idx_way_manifests_vendor CASCADE;
    DROP INDEX IF EXISTS public.idx_way_manifests_transport_provider CASCADE;
    DROP INDEX IF EXISTS public.idx_way_manifests_status CASCADE;
    DROP INDEX IF EXISTS public.idx_vehicle_driver_pairings_opp CASCADE;
    DROP INDEX IF EXISTS public.idx_vehicle_driver_pairings_manifest CASCADE;
    DROP INDEX IF EXISTS public.idx_vehicle_driver_pairings_status CASCADE;

    -- Remove columns from vehicle_driver_pairings
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vehicle_driver_pairings' AND column_name = 'opportunity_id'
    ) THEN
        ALTER TABLE public.vehicle_driver_pairings DROP COLUMN opportunity_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vehicle_driver_pairings' AND column_name = 'manifest_id'
    ) THEN
        ALTER TABLE public.vehicle_driver_pairings DROP COLUMN manifest_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vehicle_driver_pairings' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE public.vehicle_driver_pairings DROP COLUMN metadata;
    END IF;

    -- Remove columns from way_manifests
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'vendor_id'
    ) THEN
        ALTER TABLE public.way_manifests DROP COLUMN vendor_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'transport_provider_id'
    ) THEN
        ALTER TABLE public.way_manifests DROP COLUMN transport_provider_id;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'pickup_address'
    ) THEN
        ALTER TABLE public.way_manifests DROP COLUMN pickup_address;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'delivery_address'
    ) THEN
        ALTER TABLE public.way_manifests DROP COLUMN delivery_address;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'cargo_description'
    ) THEN
        ALTER TABLE public.way_manifests DROP COLUMN cargo_description;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'cargo_quantity'
    ) THEN
        ALTER TABLE public.way_manifests DROP COLUMN cargo_quantity;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'cargo_unit'
    ) THEN
        ALTER TABLE public.way_manifests DROP COLUMN cargo_unit;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'expected_pickup_at'
    ) THEN
        ALTER TABLE public.way_manifests DROP COLUMN expected_pickup_at;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'expected_delivery_at'
    ) THEN
        ALTER TABLE public.way_manifests DROP COLUMN expected_delivery_at;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'pol_data'
    ) THEN
        ALTER TABLE public.way_manifests DROP COLUMN pol_data;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'pod_data'
    ) THEN
        ALTER TABLE public.way_manifests DROP COLUMN pod_data;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'way_manifests' AND column_name = 'metadata'
    ) THEN
        ALTER TABLE public.way_manifests DROP COLUMN metadata;
    END IF;

    -- Remove schema ownership tracking for migration 000027
    DELETE FROM public._migration_schema_ownership WHERE migration_id = '000027';

END $$;

