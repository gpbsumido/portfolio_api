-- Migration: 005_public_accounts
-- Adds is_public flag to user_profiles for public/private account visibility

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;
