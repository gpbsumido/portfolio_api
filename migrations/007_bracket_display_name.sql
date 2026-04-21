-- Migration: 007_bracket_display_name
-- Stores the user's Auth0 display name on the bracket row so logged-in users
-- without a user_profiles entry don't appear as "Anonymous" in the leaderboard.

ALTER TABLE nba_playoff_brackets
  ADD COLUMN IF NOT EXISTS display_name TEXT;
