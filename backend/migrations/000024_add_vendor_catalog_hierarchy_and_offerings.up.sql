-- ============================================================================
-- MIGRATION 000024: VENDOR CATALOG HIERARCHY AND OFFERINGS (UP)
-- Phase 2: Dynamic Vendor Catalog, Unlimited Hierarchy, Grouping & Bookable Nodes,
-- Additional Services, Review History, and Integrity Constraints
-- ============================================================================

DO $$
BEGIN
    -- 1. Track schema ownership
    CREATE TABLE IF NOT EXISTS public._migration_schema_ownership (
        migration_id VARCHAR(50) NOT NULL,
        object_type VARCHAR(50) NOT NULL,
        object_schema VARCHAR(50) NOT NULL DEFAULT 'public',
        object_name VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (object_type, object_schema, object_name)
    );

    -- 2. Add columns to vendor_catalog_items
    ALTER TABLE public.vendor_catalog_items
        ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES public.vendor_catalog_items(id) ON DELETE CASCADE,
        ADD COLUMN IF NOT EXISTS node_type VARCHAR(50) NOT NULL DEFAULT 'BOOKABLE',
        ADD COLUMN IF NOT EXISTS level INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS path TEXT,
        ADD COLUMN IF NOT EXISTS display_order INT NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS price_type VARCHAR(50) NOT NULL DEFAULT 'FIXED',
        ADD COLUMN IF NOT EXISTS change_request_notes TEXT,
        ADD COLUMN IF NOT EXISTS review_history JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS included_services JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS optional_services JSONB NOT NULL DEFAULT '[]'::jsonb,
        ADD COLUMN IF NOT EXISTS fulfilment_info JSONB NOT NULL DEFAULT '{}'::jsonb;

    -- 3. Register ownership of columns
    INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
    VALUES 
        ('000024', 'COLUMN', 'public', 'vendor_catalog_items.parent_id'),
        ('000024', 'COLUMN', 'public', 'vendor_catalog_items.node_type'),
        ('000024', 'COLUMN', 'public', 'vendor_catalog_items.level'),
        ('000024', 'COLUMN', 'public', 'vendor_catalog_items.path'),
        ('000024', 'COLUMN', 'public', 'vendor_catalog_items.display_order'),
        ('000024', 'COLUMN', 'public', 'vendor_catalog_items.price_type'),
        ('000024', 'COLUMN', 'public', 'vendor_catalog_items.change_request_notes'),
        ('000024', 'COLUMN', 'public', 'vendor_catalog_items.review_history'),
        ('000024', 'COLUMN', 'public', 'vendor_catalog_items.included_services'),
        ('000024', 'COLUMN', 'public', 'vendor_catalog_items.optional_services'),
        ('000024', 'COLUMN', 'public', 'vendor_catalog_items.fulfilment_info')
    ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;

    -- 4. Backfill existing records with valid hierarchy paths
    UPDATE public.vendor_catalog_items
    SET path = id::text,
        level = 0,
        node_type = COALESCE(node_type, 'BOOKABLE'),
        price_type = COALESCE(price_type, 'FIXED'),
        display_order = COALESCE(display_order, 0)
    WHERE path IS NULL OR path = '';

    -- 5. Add check constraints safely
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_vci_node_type') THEN
        ALTER TABLE public.vendor_catalog_items
            ADD CONSTRAINT chk_vci_node_type CHECK (node_type IN ('GROUPING', 'BOOKABLE'));
        
        INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
        VALUES ('000024', 'CONSTRAINT', 'public', 'vendor_catalog_items.chk_vci_node_type')
        ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_vci_price_type') THEN
        ALTER TABLE public.vendor_catalog_items
            ADD CONSTRAINT chk_vci_price_type CHECK (price_type IN ('FIXED', 'QUOTATION'));
        
        INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
        VALUES ('000024', 'CONSTRAINT', 'public', 'vendor_catalog_items.chk_vci_price_type')
        ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;
    END IF;

    -- 6. Create performance and lookup indexes
    CREATE INDEX IF NOT EXISTS idx_vci_parent ON public.vendor_catalog_items(parent_id);
    CREATE INDEX IF NOT EXISTS idx_vci_vendor_parent ON public.vendor_catalog_items(vendor_user_id, parent_id);
    CREATE INDEX IF NOT EXISTS idx_vci_node_type ON public.vendor_catalog_items(node_type);
    CREATE INDEX IF NOT EXISTS idx_vci_path ON public.vendor_catalog_items(path);
    CREATE INDEX IF NOT EXISTS idx_vci_vendor_cat ON public.vendor_catalog_items(vendor_user_id, category_id);

    INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_schema, object_name)
    VALUES 
        ('000024', 'INDEX', 'public', 'idx_vci_parent'),
        ('000024', 'INDEX', 'public', 'idx_vci_vendor_parent'),
        ('000024', 'INDEX', 'public', 'idx_vci_node_type'),
        ('000024', 'INDEX', 'public', 'idx_vci_path'),
        ('000024', 'INDEX', 'public', 'idx_vci_vendor_cat')
    ON CONFLICT (object_type, object_schema, object_name) DO NOTHING;

END $$;

-- 7. Trigger Function for Vendor Catalog Node Integrity & Path Auto-Calculation
CREATE OR REPLACE FUNCTION fn_vci_hierarchy_integrity()
RETURNS TRIGGER AS $$
DECLARE
    v_parent_vendor_id UUID;
    v_parent_category_id UUID;
    v_parent_level INT;
    v_parent_path TEXT;
BEGIN
    -- Ensure node ID is assigned
    IF NEW.id IS NULL THEN
        NEW.id := gen_random_uuid();
    END IF;

    IF NEW.parent_id IS NULL THEN
        NEW.level := 0;
        NEW.path := NEW.id::text;
    ELSE
        -- Prevent self-parenting
        IF NEW.parent_id = NEW.id THEN
            RAISE EXCEPTION 'Cyclic hierarchy error: A catalog node cannot be its own parent (id: %)', NEW.id;
        END IF;

        -- Fetch parent information
        SELECT vendor_user_id, category_id, level, path 
        INTO v_parent_vendor_id, v_parent_category_id, v_parent_level, v_parent_path
        FROM public.vendor_catalog_items
        WHERE id = NEW.parent_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Parent catalog node % not found', NEW.parent_id;
        END IF;

        -- Prevent cross-vendor hierarchy assignment
        IF v_parent_vendor_id <> NEW.vendor_user_id THEN
            RAISE EXCEPTION 'Cross-vendor hierarchy assignment violation: parent node belongs to vendor % but new node belongs to vendor %',
                v_parent_vendor_id, NEW.vendor_user_id;
        END IF;

        -- Inherit category from parent if not explicitly set
        IF NEW.category_id IS NULL THEN
            NEW.category_id := v_parent_category_id;
        ELSIF v_parent_category_id IS NOT NULL AND NEW.category_id <> v_parent_category_id THEN
            -- Allow child to specialize only if not in direct conflict
            -- (Child and parent share the platform category tree branch)
        END IF;

        -- Prevent cycle: parent path cannot contain node id
        IF position(NEW.id::text in v_parent_path) > 0 THEN
            RAISE EXCEPTION 'Cyclic hierarchy error: proposed parent % is already a descendant of % (path: %)',
                NEW.parent_id, NEW.id, v_parent_path;
        END IF;

        NEW.level := v_parent_level + 1;
        NEW.path := v_parent_path || '/' || NEW.id::text;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_vci_hierarchy_integrity ON public.vendor_catalog_items;
CREATE TRIGGER trg_vci_hierarchy_integrity
BEFORE INSERT OR UPDATE OF parent_id, vendor_user_id, category_id
ON public.vendor_catalog_items
FOR EACH ROW
EXECUTE FUNCTION fn_vci_hierarchy_integrity();

