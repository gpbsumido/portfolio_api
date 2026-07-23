-- Migration: 009_post_replies
-- Creates post_replies table for the Ketsup replies/threads feature

CREATE TABLE IF NOT EXISTS post_replies (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_sub   TEXT        NOT NULL REFERENCES user_profiles(user_sub) ON DELETE CASCADE,
  content    TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_post_replies_post ON post_replies(post_id, created_at);
