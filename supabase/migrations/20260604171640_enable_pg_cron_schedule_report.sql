/*
  # Enable pg_cron and pg_net; schedule daily report check

  ## What this does
  Enables two Supabase extensions:
  - `pg_cron` — allows scheduling recurring SQL jobs inside Postgres
  - `pg_net` — allows Postgres to make outbound HTTP requests (used to invoke the Edge Function)

  ## Scheduled job
  Creates a cron job named `send-gc-report-daily` that fires every day at 08:00 UTC.
  It calls the `send-gc-report` Edge Function via HTTP POST.
  The Edge Function itself checks `report_settings.frequency` and `last_sent_at` to
  decide whether to actually send — so running this daily is safe; emails only go out
  on the configured cadence.

  ## Notes
  - The anon key embedded here is the public client key (already exposed in the frontend).
    The Edge Function validates it but the actual data access uses the service role key
    stored as a server-side secret.
  - The cron schedule can be changed here if needed, but changing frequency in the UI
    is the intended way to control delivery cadence.
*/

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net  WITH SCHEMA extensions;

-- Schedule the daily report check (08:00 UTC every day)
-- Wraps in a DO block so re-running the migration is safe
DO $$
BEGIN
  -- Remove any existing version of this job to allow idempotent re-runs
  PERFORM cron.unschedule('send-gc-report-daily');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job didn't exist yet, ignore
END $$;

SELECT cron.schedule(
  'send-gc-report-daily',
  '0 8 * * *',
  $$
    SELECT net.http_post(
      url     := 'https://iakalheygbiiuwwtbesf.supabase.co/functions/v1/send-gc-report',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlha2FsaGV5Z2JpaXV3d3RiZXNmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyMjAwOTgsImV4cCI6MjA5NDc5NjA5OH0.USzLIqLnSodjulSIulMrkYIcZTzLQeNSSAQyYbWV3YY"}'::jsonb,
      body    := '{}'::jsonb
    );
  $$
);
