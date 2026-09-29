-- Migration 000015 Down: Remove resource_requirements column from categories

ALTER TABLE categories DROP COLUMN IF EXISTS resource_requirements;
