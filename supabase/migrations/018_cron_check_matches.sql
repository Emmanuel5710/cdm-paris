-- 018 — Schedule check-matches every minute via pg_cron + pg_net
-- Runs during World Cup period only (11 Jun – 20 Jul 2026)

SELECT cron.schedule(
  'check-matches-every-minute',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url     := 'https://uifxhwpmpcmzubwurnwg.supabase.co/functions/v1/check-matches',
    headers := jsonb_build_object(
      'Content-Type',       'application/json',
      'Authorization',      'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpZnhod3BtcGNtenVid3VybndnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2NDA4NzUsImV4cCI6MjA5NjIxNjg3NX0.Jj5QArT8FZMCvuKbUCYFmLdb6Vt1AnF3_wDdNafhtT4',
      'x-internal-secret',  'cdm-paris-cron-secret-2026'
    ),
    body    := '{}'::jsonb
  );
  $cron$
);
