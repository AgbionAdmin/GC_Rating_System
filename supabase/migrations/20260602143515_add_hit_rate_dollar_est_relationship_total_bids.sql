/*
  # Add new GC dashboard columns

  ## New Columns on general_contractors
  - `hit_rate_dollar` (numeric, nullable) — Hit Rate ($) placeholder, populated via future CSV upload
  - `est_relationship` (numeric, nullable) — Estimator Relationship 1–5 score, populated via future CSV upload
  - `total_bids` (numeric, nullable) — Total Bids 1–5 score, populated via future CSV upload

  ## Notes
  - All columns are nullable with no default; rows show empty state until data is uploaded
  - No RLS changes needed — existing policies on general_contractors cover these columns
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'general_contractors' AND column_name = 'hit_rate_dollar'
  ) THEN
    ALTER TABLE general_contractors ADD COLUMN hit_rate_dollar numeric NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'general_contractors' AND column_name = 'est_relationship'
  ) THEN
    ALTER TABLE general_contractors ADD COLUMN est_relationship numeric NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'general_contractors' AND column_name = 'total_bids'
  ) THEN
    ALTER TABLE general_contractors ADD COLUMN total_bids numeric NULL;
  END IF;
END $$;
