-- ============================================================================
-- MIGRATION 000026: CHECKOUT, PAYMENT & INVENTORY RESERVATIONS (DOWN)
-- ============================================================================

DROP TABLE IF EXISTS public.payment_transactions CASCADE;
DROP TABLE IF EXISTS public.inventory_reservations CASCADE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'vendor_catalog_items' AND column_name = 'reserved_quantity'
    ) THEN
        ALTER TABLE public.vendor_catalog_items DROP COLUMN reserved_quantity;
    END IF;
END $$;

DELETE FROM public._migration_schema_ownership WHERE migration_id = '000026';

