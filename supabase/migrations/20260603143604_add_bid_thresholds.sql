/*
  # Add Bid Thresholds Table

  ## Overview
  Creates a single-row configuration table for Total Bids scoring thresholds.
  These control the dollar amount breakpoints that map to scores 1-5 on the
  GC Performance Dashboard.

  ## New Tables
  - `bid_thresholds`
    - `id` (int, always 1 — single-row config table)
    - `tier_2_min` (numeric) — minimum dollars to score a 2 (default $1)
    - `tier_3_min` (numeric) — minimum dollars to score a 3 (default $1,000,000)
    - `tier_4_min` (numeric) — minimum dollars to score a 4 (default $5,000,000)
    - `tier_5_min` (numeric) — minimum dollars to score a 5 (default $10,000,000)
    - `updated_at` (timestamptz)

  ## Security
  - RLS enabled
  - Authenticated users can SELECT the thresholds
  - Authenticated users can INSERT/UPDATE the thresholds
  - Anon users can SELECT only (dashboard is public-facing)

  ## Notes
  1. Seeded with the current hardcoded values so existing scores are unchanged
  2. Only one row (id = 1) is ever used; updates UPSERT on id
*/

CREATE TABLE IF NOT EXISTS bid_thresholds (
  id integer PRIMARY KEY DEFAULT 1,
  tier_2_min numeric NOT NULL DEFAULT 1,
  tier_3_min numeric NOT NULL DEFAULT 1000000,
  tier_4_min numeric NOT NULL DEFAULT 5000000,
  tier_5_min numeric NOT NULL DEFAULT 10000000,
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT single_row CHECK (id = 1)
);

ALTER TABLE bid_thresholds ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read the thresholds — dashboard is not auth-gated
CREATE POLICY "Anyone can read bid thresholds"
  ON bid_thresholds FOR SELECT
  TO anon, authenticated
  USING (true);

-- Only authenticated users can insert
CREATE POLICY "Authenticated users can insert bid thresholds"
  ON bid_thresholds FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Only authenticated users can update
CREATE POLICY "Authenticated users can update bid thresholds"
  ON bid_thresholds FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Seed default thresholds
INSERT INTO bid_thresholds (id, tier_2_min, tier_3_min, tier_4_min, tier_5_min)
VALUES (1, 1, 1000000, 5000000, 10000000)
ON CONFLICT (id) DO NOTHING;
