-- Migration 000021 (Down): Restore cement-services category if rolled back
INSERT INTO categories (id, slug, name, description, icon, default_workflow, required_documents)
VALUES (
    '3f6aaa27-3a76-4b3a-9a67-bf67464095d2',
    'cement-services',
    'cement services',
    '',
    'Layers',
    'INSTANT',
    '[]'::jsonb
) ON CONFLICT (slug) DO NOTHING;
