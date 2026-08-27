-- Migration: 012_draft_adjustments
-- Sourced fantasy valuation adjustments for the Draft Lab extension: injuries,
-- ripple beneficiaries (RB2 up when RB1 is out), and depth-chart/coaching
-- context. A daily research job posts new pending rows; approval happens in the
-- extension and only ever flips status — it never edits the researched fact.

CREATE TABLE IF NOT EXISTS draft_adjustments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name    TEXT        NOT NULL,
  team           TEXT,
  position       TEXT,
  category       TEXT        NOT NULL DEFAULT 'injury',   -- injury | ripple | camp | context
  note           TEXT        NOT NULL,
  source_url     TEXT,
  delta_pct      NUMERIC     NOT NULL,                    -- e.g. -90, +15
  beneficiary_of TEXT,                                    -- the injured player a ripple flows from
  confidence     TEXT        NOT NULL DEFAULT 'med',      -- high | med | low
  status         TEXT        NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  batch_date     DATE        NOT NULL,                    -- the daily run that produced it
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One row per player+category per daily batch, so re-running a day upserts
-- instead of piling up duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS uq_draft_adjustments_dedup
  ON draft_adjustments (player_name, category, batch_date);

-- The extension reads the current picture by status.
CREATE INDEX IF NOT EXISTS idx_draft_adjustments_status
  ON draft_adjustments (status, batch_date DESC);
