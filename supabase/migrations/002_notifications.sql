-- Etap 5: preferencje powiadomień
alter table public.profiles add column if not exists email_reminders boolean not null default true;

-- Codzienna wysyłka (po wdrożeniu funkcji send-reminders). Włącz rozszerzenia pg_cron i pg_net
-- w Dashboard -> Database -> Extensions, podmień PROJECT_REF i CRON_SECRET, uruchom raz:
--
-- select cron.schedule('send-reminders-daily', '0 6 * * *', $$
--   select net.http_post(
--     url := 'https://PROJECT_REF.supabase.co/functions/v1/send-reminders',
--     headers := jsonb_build_object('Authorization', 'Bearer CRON_SECRET', 'Content-Type', 'application/json'),
--     body := '{}'::jsonb);
-- $$);
