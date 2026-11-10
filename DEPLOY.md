# Lista kontrolna przed wdrożeniem

## Baza i Supabase
1. Uruchom migracje po kolei: `001_schema.sql`, `002_notifications.sql`, `003_analytics.sql`.
2. Sprawdź RLS — to zapytanie ma zwrócić 0 wierszy:
   `select tablename from pg_tables where schemaname='public' and not rowsecurity;`
3. Authentication → URL Configuration: Site URL oraz Redirect URLs (`https://TWOJA-DOMENA/auth/callback`, lokalnie `http://localhost:3000/auth/callback`).
4. Authentication: włącz potwierdzanie e-mail, podnieś minimalną długość hasła, włącz ochronę przed wyciekłymi hasłami (jeśli plan to oferuje).
5. Ustaw własny SMTP (domyślny serwer Supabase ma bardzo niskie limity wysyłki).
6. Storage: buckety `documents` i `vehicle-photos` muszą być prywatne (tworzy je migracja 001).
7. Włącz kopie zapasowe (PITR w płatnych planach).

## Zmienne środowiskowe hostingu
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`, `ANTHROPIC_API_KEY` (opcjonalnie `ANTHROPIC_MODEL`).
Klucza `service_role` aplikacja Next nie używa i nie powinien się w niej znaleźć. Dostaje go tylko Edge Function (automatycznie od Supabase).

## Testy
- `npm install && npm run test:db` — 46 testów schematu i RLS na lokalnym PostgreSQL (PGlite), bez Supabase.
- Test ręczny na dwóch kontach: załóż A i B, A dodaje pojazd z wpisami, B próbuje otworzyć `/garage/<id-pojazdu-A>` (ma dostać 404) oraz `/garage/<id>/report` (404).
- Przejdź na telefonie: logowanie, dodanie pojazdu ze zdjęciem, tankowanie, dokument, raport PDF, asystent AI.

## Czego jeszcze NIE ma (decyzje przed startem komercyjnym)
- **Płatności:** plany Free/Premium są tylko w bazie; nie ma Stripe ani zakupu planu.
- **RODO:** brak usuwania konta i eksportu danych przez użytkownika, brak polityki prywatności i regulaminu. Dane pojazdu są wysyłane do Anthropic w ramach asystenta AI — trzeba to opisać w polityce prywatności.
- **Monitoring błędów** (np. Sentry) i alerty.
- **Ograniczenie zapytań** do AI na minutę (jest limit miesięczny).
- **Ścisły CSP** (są pozostałe nagłówki bezpieczeństwa).
- Edycja ręcznych wydatków, przywracanie zarchiwizowanych pojazdów, odpowiedzi AI strumieniowane.
- Audyt dostępności z czytnikiem ekranu i testy na prawdziwych urządzeniach.
