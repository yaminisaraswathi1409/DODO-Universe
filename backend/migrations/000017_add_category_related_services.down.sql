-- Migration 000017 Down: Remove related_services column from categories table
ALTER TABLE categories DROP COLUMN IF EXISTS related_services;
