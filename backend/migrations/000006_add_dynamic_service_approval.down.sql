-- Migration 000006 Down: Remove dynamic service approval columns
ALTER TABLE user_skills_assets
DROP COLUMN IF EXISTS category_id,
DROP COLUMN IF EXISTS documents,
DROP COLUMN IF EXISTS rejection_reason,
DROP COLUMN IF EXISTS status;

ALTER TABLE categories
DROP COLUMN IF EXISTS required_documents;
