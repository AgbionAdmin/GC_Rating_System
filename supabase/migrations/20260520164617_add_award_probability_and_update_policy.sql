/*
  # Add award_probability column and update policy

  1. Changes
    - `general_contractors`: adds `award_probability` (float, 0–1, nullable)
      This is the raw probability value entered by users; the display score is
      computed as award_probability * 5 in the application layer.
    - Adds UPDATE policy on `general_contractors` so any anon user can update
      the award_probability field (consistent with existing open-access model).

  2. Notes
    - The existing `project_award_probability` column (1–5 scale) is left intact
      so no existing data or queries break. New scoring uses `award_probability`.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'general_contractors' AND column_name = 'award_probability'
  ) THEN
    ALTER TABLE general_contractors ADD COLUMN award_probability float;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'general_contractors' AND policyname = 'Anyone can update general contractors'
  ) THEN
    CREATE POLICY "Anyone can update general contractors"
      ON general_contractors FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
