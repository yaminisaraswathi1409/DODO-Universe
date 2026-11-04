-- ============================================================================
-- MIGRATION 000024: VENDOR CATALOG HIERARCHY AND OFFERINGS (DOWN)
-- Revert Phase 2 dynamic vendor catalog extensions safely
-- ============================================================================

DROP TRIGGER IF EXISTS trg_vci_hierarchy_integrity ON public.vendor_catalog_items;
DROP FUNCTION IF EXISTS fn_vci_hierarchy_integrity();

DROP INDEX IF EXISTS public.idx_vci_vendor_cat;
DROP INDEX IF EXISTS public.idx_vci_path;
DROP INDEX IF EXISTS public.idx_vci_node_type;
DROP INDEX IF EXISTS public.idx_vci_vendor_parent;
DROP INDEX IF EXISTS public.idx_vci_parent;

ALTER TABLE public.vendor_catalog_items
    DROP CONSTRAINT IF EXISTS chk_vci_price_type,
    DROP CONSTRAINT IF EXISTS chk_vci_node_type,
    DROP COLUMN IF EXISTS fulfilment_info,
    DROP COLUMN IF EXISTS optional_services,
    DROP COLUMN IF EXISTS included_services,
    DROP COLUMN IF EXISTS review_history,
    DROP COLUMN IF EXISTS change_request_notes,
    DROP COLUMN IF EXISTS price_type,
    DROP COLUMN IF EXISTS display_order,
    DROP COLUMN IF EXISTS path,
    DROP COLUMN IF EXISTS level,
    DROP COLUMN IF EXISTS node_type,
    DROP COLUMN IF EXISTS parent_id;

DELETE FROM public._migration_schema_ownership WHERE migration_id = '000024';

