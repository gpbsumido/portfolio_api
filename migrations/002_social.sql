-- Migration: 002_social
-- Creates user_profiles table for social features

CREATE TABLE IF NOT EXISTS user_profiles (
  user_sub      TEXT PRIMARY KEY REFERENCES users(sub) ON DELETE CASCADE,
  username      TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  bio           TEXT CHECK (char_length(bio) <= 160),
  avatar_url    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT username_format CHECK (username ~ '^[a-z0-9_]{3,30}$')
);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
