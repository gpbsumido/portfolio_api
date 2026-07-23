-- Migration: 011_notifications_seen
-- Tracks when a user last viewed their notifications, for the unread badge.
-- Notifications themselves are derived (pull-based) from likes/replies/reposts/
-- follows, so there is no notifications table.

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS notifications_seen_at TIMESTAMPTZ;
