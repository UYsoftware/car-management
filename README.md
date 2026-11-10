# Autogaraż — Etap 2

1. Supabase: nowy projekt -> SQL Editor -> wklej `supabase/migrations/001_schema.sql`.
2. Authentication -> Providers -> Email (na czas testów możesz wyłączyć "Confirm email").
3. `cp .env.example .env.local` i uzupełnij URL oraz anon key (Project Settings -> API).
4. `npm install && npm run dev` -> http://localhost:3000

Zakres tego etapu: design system (tokeny jasny/ciemny z systemu), logowanie i rejestracja,
ochrona tras, układ z nawigacją (sidebar / dolny pasek), pulpit czytający prawdziwe dane z bazy.

## Etap 5 — przypomnienia i dokumenty
1. Uruchom `supabase/migrations/002_notifications.sql` (kolumna preferencji powiadomień).
2. E-maile (opcjonalnie): konto na resend.com + zweryfikowana domena, potem:
   `supabase functions deploy send-reminders --no-verify-jwt`
   `supabase secrets set CRON_SECRET=<losowy-ciąg> RESEND_API_KEY=<klucz> RESEND_FROM="Autogaraż <powiadomienia@twojadomena.pl>"`
   i zaplanuj wywołanie wg komentarza w pliku 002 (pg_cron + pg_net). `--no-verify-jwt` jest bezpieczne, bo funkcja wymaga CRON_SECRET.

## Etap 6 — asystent AI (Claude)
1. Klucz z console.anthropic.com -> `ANTHROPIC_API_KEY` w `.env.local` (i w zmiennych hostingu). Nigdy z prefiksem NEXT_PUBLIC_.
2. Model domyślny: `claude-sonnet-5-5`; zmienisz przez `ANTHROPIC_MODEL`.
3. Limity: Free 10 wiadomości/mies., Premium 300 (stałe w `src/lib/ai.ts`). Na Vercelu długie odpowiedzi wymagają planu z `maxDuration` do 60 s.

## Etap 7 — raporty PDF i analityka
1. Uruchom `supabase/migrations/003_analytics.sql`.
2. `npm install` (nowa zależność: @react-pdf/renderer). Raport: przycisk „Pobierz raport PDF" przy pojeździe. Czcionka z polskimi znakami jest w `assets/fonts/`.
3. Plan Free: raport podglądowy (do 5 wpisów na sekcję, bez dokumentów); Premium: pełny.

## Etap 8 — jakość
- `npm run test:db` uruchamia testy schematu i RLS (PGlite). Lista kontrolna wdrożenia: `DEPLOY.md`.
- Middleware leży w `src/middleware.ts` (odświeża sesję i chroni trasy).
