/*
# Add Safety score column to ratings table

1. Changes
- Adds `safety` column to the `ratings` table.
- Nullable integer (1–5 CHECK constraint) so existing reports without a Safety score get NULL,
  which is excluded from averages rather than counted as zero.
- New reports submitted through the survey will always include a Safety value (enforced by the UI).

2. Security
- No RLS or policy changes — the existing SELECT/INSERT policies on `ratings` cover the new column automatically.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ratings' AND column_name = 'safety'
  ) THEN
    ALTER TABLE ratings ADD COLUMN safety integer CHECK (safety IS NULL OR safety BETWEEN 1 AND 5);
  END IF;
END $$;