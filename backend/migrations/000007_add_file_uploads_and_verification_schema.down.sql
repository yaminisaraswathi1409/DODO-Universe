-- Migration 000007 down script
-- Reset required_documents to default empty JSON array
UPDATE categories SET required_documents = '[]'::jsonb;
