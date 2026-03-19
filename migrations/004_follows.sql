-- Migration: 004_follows
-- Creates follows table for Ketsup social app

CREATE TABLE IF NOT EXISTS follows (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_sub  TEXT        NOT NULL REFERENCES user_profiles(user_sub) ON DELETE CASCADE,
  following_sub TEXT        NOT NULL REFERENCES user_profiles(user_sub) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (follower_sub, following_sub)
);

CREATE INDEX IF NOT EXISTS idx_follows_following_sub_status ON follows(following_sub, status);
CREATE INDEX IF NOT EXISTS idx_follows_follower_sub_status  ON follows(follower_sub, status);

CREATE TRIGGER follows_updated_at
  BEFORE UPDATE ON follows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
