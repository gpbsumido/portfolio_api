-- Migration: 010_reposts
-- Creates reposts table for the Ketsup reposts feature

CREATE TABLE IF NOT EXISTS reposts (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_sub   TEXT        NOT NULL REFERENCES user_profiles(user_sub) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (post_id, user_sub)
);

CREATE INDEX IF NOT EXISTS idx_reposts_post ON reposts(post_id);
CREATE INDEX IF NOT EXISTS idx_reposts_user ON reposts(user_sub, created_at);
