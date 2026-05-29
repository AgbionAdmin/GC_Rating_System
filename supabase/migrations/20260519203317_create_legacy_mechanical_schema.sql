/*
  # Legacy Mechanical GC Rating System — Initial Schema

  ## Summary
  Creates the core tables for the GC Rating System used by Legacy Mechanical's project managers and estimators.

  ## New Tables

  ### project_managers
  - Stores PM names used for attribution on rating submissions
  - `id` — UUID primary key
  - `name` — Unique full name of the PM
  - `created_at` — Timestamp of creation

  ### general_contractors
  - Stores GC records with search aliases and a manually-maintained award probability score
  - `id` — UUID primary key
  - `name` — Official full name (unique)
  - `aliases` — Comma-separated abbreviations/nicknames for fuzzy search
  - `project_award_probability` — Numeric 1–5 score maintained by admin; nullable
  - `created_at` — Timestamp of creation

  ### ratings
  - Stores individual GC rating submissions from PMs
  - `id` — UUID primary key
  - `gc_id` — Foreign key to general_contractors
  - `pm_id` — Foreign key to project_managers
  - `job_number` — Required job identifier
  - `job_name` — Optional job description
  - Nine 1–5 integer rating columns (payment_timeline, co_approval_timeline, co_negotiations, contract_terms, conflict_mitigation, schedule_trade_stacking, schedule_accuracy, site_control, relationship)
  - `created_at` — Timestamp of submission

  ## Security
  - RLS enabled on all tables
  - Public read/insert access (no auth required — access controlled by URL)
  - No delete or update policies for public users (admin manages data directly)
*/

-- project_managers
CREATE TABLE IF NOT EXISTS project_managers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE project_managers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read project managers"
  ON project_managers FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anyone can insert project managers"
  ON project_managers FOR INSERT
  TO anon
  WITH CHECK (true);

-- general_contractors
CREATE TABLE IF NOT EXISTS general_contractors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  aliases text,
  project_award_probability numeric,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE general_contractors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read general contractors"
  ON general_contractors FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anyone can insert general contractors"
  ON general_contractors FOR INSERT
  TO anon
  WITH CHECK (true);

-- ratings
CREATE TABLE IF NOT EXISTS ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gc_id uuid NOT NULL REFERENCES general_contractors(id),
  pm_id uuid NOT NULL REFERENCES project_managers(id),
  job_number text NOT NULL,
  job_name text,
  payment_timeline integer NOT NULL CHECK (payment_timeline BETWEEN 1 AND 5),
  co_approval_timeline integer NOT NULL CHECK (co_approval_timeline BETWEEN 1 AND 5),
  co_negotiations integer NOT NULL CHECK (co_negotiations BETWEEN 1 AND 5),
  contract_terms integer NOT NULL CHECK (contract_terms BETWEEN 1 AND 5),
  conflict_mitigation integer NOT NULL CHECK (conflict_mitigation BETWEEN 1 AND 5),
  schedule_trade_stacking integer NOT NULL CHECK (schedule_trade_stacking BETWEEN 1 AND 5),
  schedule_accuracy integer NOT NULL CHECK (schedule_accuracy BETWEEN 1 AND 5),
  site_control integer NOT NULL CHECK (site_control BETWEEN 1 AND 5),
  relationship integer NOT NULL CHECK (relationship BETWEEN 1 AND 5),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read ratings"
  ON ratings FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anyone can insert ratings"
  ON ratings FOR INSERT
  TO anon
  WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS ratings_gc_id_idx ON ratings(gc_id);
CREATE INDEX IF NOT EXISTS ratings_pm_id_idx ON ratings(pm_id);
CREATE INDEX IF NOT EXISTS ratings_created_at_idx ON ratings(created_at DESC);
