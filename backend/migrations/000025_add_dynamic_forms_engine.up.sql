-- ============================================================================
-- MIGRATION 000025: REUSABLE DYNAMIC FORMS ENGINE (UP)
-- Phase 3: Form Schemas, Versioning, Submissions, Conditional Rules, and Validations
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

    -- 2. Form Schemas table
    -- Stores configurable form schemas across all purposes with versioning
    CREATE TABLE IF NOT EXISTS public.form_schemas (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        purpose VARCHAR(64) NOT NULL, -- MAIN_SERVICE_APPLICATION, VENDOR_CATEGORY_APPLICATION, VENDOR_CATALOG_OFFERING, CUSTOMER_OPPORTUNITY, CUSTOMER_SERVICE_REQUEST, DOCUMENT_VERIFICATION
        category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
        main_service_slug VARCHAR(100),
        version INT NOT NULL DEFAULT 1,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sections JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of FormSection
        fields JSONB NOT NULL DEFAULT '[]'::jsonb,   -- Array of FormFieldSpec
        rules JSONB NOT NULL DEFAULT '[]'::jsonb,    -- Array of FormConditionalRule
        created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_form_schema_purpose CHECK (
            purpose IN (
                'MAIN_SERVICE_APPLICATION',
                'VENDOR_CATEGORY_APPLICATION',
                'VENDOR_CATALOG_OFFERING',
                'CUSTOMER_OPPORTUNITY',
                'CUSTOMER_SERVICE_REQUEST',
                'DOCUMENT_VERIFICATION'
            )
        )
    );

    -- 3. Form Submissions table
    -- Stores immutable user/vendor submissions tied to a specific schema version snapshot
    CREATE TABLE IF NOT EXISTS public.form_submissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        schema_id UUID NOT NULL REFERENCES public.form_schemas(id) ON DELETE CASCADE,
        schema_version INT NOT NULL,
        schema_snapshot JSONB NOT NULL, -- Immutable copy of schema at time of submission
        user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
        entity_id UUID,                 -- Associated entity ID (opportunity_id, vendor_asset_id, catalog_item_id, category_approval_id)
        entity_type VARCHAR(64),        -- OPPORTUNITY, USER_ASSET, CATALOG_ITEM, CATEGORY_APPROVAL
        status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED', -- DRAFT, SUBMITTED, APPROVED, CHANGES_REQUESTED, REJECTED
        answers JSONB NOT NULL DEFAULT '{}'::jsonb,      -- Field key-value pairs
        review_notes TEXT,
        reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
        reviewed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT chk_form_submission_status CHECK (
            status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED')
        )
    );

    -- 4. Indexes for fast lookup
    CREATE INDEX IF NOT EXISTS idx_form_schemas_purpose ON public.form_schemas(purpose, is_active);
    CREATE INDEX IF NOT EXISTS idx_form_schemas_category ON public.form_schemas(category_id, purpose, is_active);
    CREATE INDEX IF NOT EXISTS idx_form_schemas_service ON public.form_schemas(main_service_slug, purpose, is_active);
    CREATE INDEX IF NOT EXISTS idx_form_submissions_user ON public.form_submissions(user_id);
    CREATE INDEX IF NOT EXISTS idx_form_submissions_entity ON public.form_submissions(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_form_submissions_schema ON public.form_submissions(schema_id, schema_version);

    -- 5. Record schema ownership for migration tracking
    INSERT INTO public._migration_schema_ownership (migration_id, object_type, object_name)
    VALUES
        ('000025', 'TABLE', 'form_schemas'),
        ('000025', 'TABLE', 'form_submissions'),
        ('000025', 'INDEX', 'idx_form_schemas_purpose'),
        ('000025', 'INDEX', 'idx_form_schemas_category'),
        ('000025', 'INDEX', 'idx_form_schemas_service'),
        ('000025', 'INDEX', 'idx_form_submissions_user'),
        ('000025', 'INDEX', 'idx_form_submissions_entity'),
        ('000025', 'INDEX', 'idx_form_submissions_schema')
    ON CONFLICT DO NOTHING;

END $$;

