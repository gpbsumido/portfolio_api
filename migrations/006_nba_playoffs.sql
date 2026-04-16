-- Migration: 006_nba_playoffs
-- Adds nba_playoff_brackets table for storing user playoff bracket picks

CREATE TABLE IF NOT EXISTS nba_playoff_brackets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_sub TEXT NOT NULL,
    season INT NOT NULL,
    picks JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_sub, season)
);

CREATE INDEX IF NOT EXISTS idx_nba_playoff_brackets_user_sub ON nba_playoff_brackets(user_sub);
