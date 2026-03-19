-- Migration: 003_posts
-- Creates posts and post_media tables for Ketsup social app

CREATE TABLE IF NOT EXISTS posts (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_sub    TEXT        NOT NULL REFERENCES user_profiles(user_sub) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('photo', 'text')),
  caption     TEXT,
  content     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS post_media (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id       UUID        NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  s3_key        TEXT        NOT NULL,
  url           TEXT        NOT NULL,
  width         INT,
  height        INT,
  position      SMALLINT    NOT NULL DEFAULT 0,
  blur_data_url TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_posts_user_sub_created_at ON posts(user_sub, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media(post_id);

CREATE TRIGGER posts_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
