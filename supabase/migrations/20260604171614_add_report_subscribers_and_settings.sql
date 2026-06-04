/*
  # Add report_subscribers and report_settings tables

  ## New Tables

  ### report_subscribers
  Stores email addresses that receive the automated GC performance report.
  - `id` (uuid, primary key)
  - `email` (text, unique) — subscriber email address
  - `created_at` (timestamptz)

  ### report_settings
  Single-row configuration for automated report delivery.
  - `id` (integer, always 1) — enforces single-row via CHECK constraint
  - `frequency` (text) — one of: 'weekly', 'biweekly', 'monthly'
  - `last_sent_at` (timestamptz, nullable) — timestamp of the last successful send
  - `updated_at` (timestamptz)

  ## Security
  - RLS enabled on both tables
  - Public (anon) read/insert/update/delete on report_subscribers — matches the existing
    open-access pattern used throughout this app (no auth required)
  - Public (anon) read/update on report_settings (no insert; row is seeded at migration time)
*/

-- report_subscribers -------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_subscribers (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text        UNIQUE NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE report_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read subscribers"
  ON report_subscribers FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Public can add subscribers"
  ON report_subscribers FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Public can remove subscribers"
  ON report_subscribers FOR DELETE
  TO anon
  USING (true);

-- report_settings -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_settings (
  id           integer     PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  frequency    text        NOT NULL DEFAULT 'monthly'
                           CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  last_sent_at timestamptz,
  updated_at   timestamptz DEFAULT now()
);

ALTER TABLE report_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read report settings"
  ON report_settings FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Public can update report settings"
  ON report_settings FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (id = 1);

-- Seed the single settings row
INSERT INTO report_settings (id, frequency)
VALUES (1, 'monthly')
ON CONFLICT (id) DO NOTHING;
