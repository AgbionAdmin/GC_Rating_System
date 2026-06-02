/*
  # Add raw bid data columns for CSV upload

  ## Changes to general_contractors
  - `total_bids_submitted_raw` (numeric, nullable) — raw dollar value of Total Bids Submitted from CSV;
    used to compute the 1–5 Total Bids score in the frontend
  - `hit_rate_dollar` already exists and will store Total Win / Total Bids Submitted (0–1 ratio)
  - `award_probability` already exists and will store #Bids Won / #Bids (0–1 ratio)
  - `total_bids` already exists and will store the computed 1–5 score from total_bids_submitted_raw

  ## Notes
  - Only total_bids_submitted_raw is new; all other columns already exist
  - Nullable with no default — empty until CSV is uploaded
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'general_contractors' AND column_name = 'total_bids_submitted_raw'
  ) THEN
    ALTER TABLE general_contractors ADD COLUMN total_bids_submitted_raw numeric NULL;
  END IF;
END $$;
