-- =====================================================================
-- PREMIUM CAR MANAGEMENT PLATFORM — schemat bazy (Supabase / PostgreSQL 15+)
-- Uruchom w: Supabase Dashboard -> SQL Editor (lub: supabase db push).
-- Zasady:
--   * każda tabela ma RLS; użytkownik widzi tylko swoje dane (user_id = auth.uid())
--   * tabele podrzędne mają user_id + złożony FK (vehicle_id, user_id) -> vehicles,
--     więc nie da się podpiąć rekordu do cudzego pojazdu
--   * przebieg i koszty mają jedno źródło prawdy (mileage_logs, expenses),
--     synchronizowane triggerami z tankowań i serwisów
-- =====================================================================

-- ---------- ENUMY ----------
create type public.fuel_type as enum
  ('petrol','diesel','lpg','cng','hybrid','plug_in_hybrid','electric','other');
create type public.transmission_type as enum ('manual','automatic','semi_automatic','cvt','dct');
create type public.maintenance_type as enum
  ('oil_change','filters','timing_belt','brakes','tires','battery','suspension','inspection','other');
create type public.expense_category as enum
  ('fuel','maintenance','repairs','insurance','taxes_fees','tires','other');
create type public.reminder_kind as enum ('date','mileage','both');
create type public.reminder_status as enum ('active','done','snoozed','dismissed');
create type public.document_type as enum
  ('insurance','inspection','invoice','purchase_contract','registration','other');
create type public.mileage_source as enum ('manual','fuel','service');
create type public.expense_source as enum ('fuel','maintenance');
create type public.ai_role as enum ('user','assistant','system');
create type public.subscription_plan as enum ('free','premium');
create type public.subscription_status as enum
  ('active','trialing','past_due','canceled','incomplete');

-- ---------- FUNKCJE POMOCNICZE ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------- PROFILES ----------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text check (char_length(display_name) <= 100),
  locale        text not null default 'pl',
  currency      text not null default 'PLN' check (char_length(currency) = 3),
  distance_unit text not null default 'km' check (distance_unit in ('km','mi')),
  theme         text not null default 'system' check (theme in ('light','dark','system')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------- SUBSCRIPTIONS (zapis tylko z serwera / webhook Stripe) ----------
create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references auth.users(id) on delete cascade,
  plan                   public.subscription_plan not null default 'free',
  status                 public.subscription_status not null default 'active',
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create trigger trg_subscriptions_updated before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Nowy użytkownik -> profil + plan Free
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)));
  insert into public.subscriptions (user_id) values (new.id);
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Limit pojazdów zależny od planu (egzekwowany w bazie, nie tylko w UI)
create or replace function public.plan_vehicle_limit(uid uuid)
returns int language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select case when s.plan = 'premium' and s.status in ('active','trialing') then 50 else 1 end
       from public.subscriptions s where s.user_id = uid),
    1);
$$;

-- ---------- VEHICLES ----------
create table public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  make             text not null check (char_length(make) between 1 and 60),
  model            text not null check (char_length(model) between 1 and 80),
  year             int  check (year between 1900 and 2100),
  vin              text check (vin ~ '^[A-HJ-NPR-Z0-9]{11,17}$'),
  plate            text check (char_length(plate) <= 15),
  engine           text check (char_length(engine) <= 100),
  fuel_type        public.fuel_type,
  transmission     public.transmission_type,
  current_mileage  int not null default 0 check (current_mileage >= 0),
  purchase_date    date,
  purchase_price   numeric(12,2) check (purchase_price >= 0),
  photo_path       text,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id)
);
create unique index uq_vehicles_user_vin on public.vehicles (user_id, vin)
  where vin is not null and archived_at is null;
create index idx_vehicles_user on public.vehicles (user_id) where archived_at is null;
create trigger trg_vehicles_updated before update on public.vehicles
  for each row execute function public.set_updated_at();

create or replace function public.vehicles_before_insert()
returns trigger language plpgsql as $$
begin
  if (select count(*) from public.vehicles
        where user_id = new.user_id and archived_at is null)
     >= public.plan_vehicle_limit(new.user_id) then
    raise exception 'VEHICLE_LIMIT_REACHED' using errcode = 'P0001',
      hint = 'Limit pojazdów dla Twojego planu został osiągnięty.';
  end if;
  new.vin   := nullif(upper(trim(new.vin)), '');
  new.plate := nullif(upper(trim(new.plate)), '');
  return new;
end $$;
create trigger trg_vehicles_before_insert before insert on public.vehicles
  for each row execute function public.vehicles_before_insert();

-- Przebiegu nie wolno zmieniać bezpośrednio — tylko przez mileage_logs
create or replace function public.vehicles_guard_mileage()
returns trigger language plpgsql as $$
begin
  if new.current_mileage is distinct from old.current_mileage and pg_trigger_depth() < 2 then
    raise exception 'Przebieg zmieniaj przez wpis w mileage_logs, nie bezpośrednio w vehicles.';
  end if;
  new.vin   := nullif(upper(trim(new.vin)), '');
  new.plate := nullif(upper(trim(new.plate)), '');
  return new;
end $$;
create trigger trg_vehicles_guard before update on public.vehicles
  for each row execute function public.vehicles_guard_mileage();

-- ---------- SERVICE PROVIDERS ----------
create table public.service_providers (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(name) between 1 and 120),
  type       text check (char_length(type) <= 60),
  address    text check (char_length(address) <= 250),
  phone      text check (char_length(phone) <= 30),
  notes      text check (char_length(notes) <= 2000),
  rating     smallint check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index idx_providers_user on public.service_providers (user_id);
create trigger trg_providers_updated before update on public.service_providers
  for each row execute function public.set_updated_at();

-- ---------- MILEAGE LOGS (jedno źródło prawdy dla przebiegu) ----------
create table public.mileage_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  vehicle_id  uuid not null,
  mileage     int  not null check (mileage >= 0),
  recorded_at date not null default current_date,
  source      public.mileage_source not null default 'manual',
  source_id   uuid,
  created_at  timestamptz not null default now(),
  foreign key (vehicle_id, user_id) references public.vehicles (id, user_id) on delete cascade
);
create index idx_mileage_vehicle_date on public.mileage_logs (vehicle_id, recorded_at desc);
create index idx_mileage_user on public.mileage_logs (user_id);
create unique index uq_mileage_source on public.mileage_logs (source, source_id)
  where source_id is not null;

-- Przebieg nie może maleć w czasie
create or replace function public.mileage_validate()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.mileage_logs m
              where m.vehicle_id = new.vehicle_id and m.id <> new.id
                and m.recorded_at < new.recorded_at and m.mileage > new.mileage) then
    raise exception 'MILEAGE_DECREASED'
      using hint = 'Przebieg jest niższy niż we wcześniejszym wpisie.';
  end if;
  if exists (select 1 from public.mileage_logs m
              where m.vehicle_id = new.vehicle_id and m.id <> new.id
                and m.recorded_at > new.recorded_at and m.mileage < new.mileage) then
    raise exception 'MILEAGE_EXCEEDS_LATER'
      using hint = 'Przebieg jest wyższy niż w późniejszym wpisie.';
  end if;
  return new;
end $$;
create trigger trg_mileage_validate before insert or update on public.mileage_logs
  for each row execute function public.mileage_validate();

-- vehicles.current_mileage = max z logów
create or replace function public.mileage_refresh_vehicle()
returns trigger language plpgsql as $$
declare vid uuid := coalesce(new.vehicle_id, old.vehicle_id);
begin
  update public.vehicles v
     set current_mileage = coalesce(
       (select max(m.mileage) from public.mileage_logs m where m.vehicle_id = vid), 0)
   where v.id = vid;
  return null;
end $$;
create trigger trg_mileage_refresh after insert or update or delete on public.mileage_logs
  for each row execute function public.mileage_refresh_vehicle();

-- Pierwszy wpis przebiegu przy dodaniu pojazdu
create or replace function public.vehicles_initial_mileage()
returns trigger language plpgsql as $$
begin
  insert into public.mileage_logs (user_id, vehicle_id, mileage, recorded_at, source)
  values (new.user_id, new.id, new.current_mileage, current_date, 'manual');
  return null;
end $$;
create trigger trg_vehicles_initial_mileage after insert on public.vehicles
  for each row execute function public.vehicles_initial_mileage();

-- ---------- MAINTENANCE RECORDS ----------
create table public.maintenance_records (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users(id) on delete cascade,
  vehicle_id           uuid not null,
  type                 public.maintenance_type not null,
  performed_at         date not null,
  mileage              int  not null check (mileage >= 0),
  description          text check (char_length(description) <= 2000),
  cost                 numeric(12,2) check (cost >= 0),
  provider_id          uuid,
  notes                text check (char_length(notes) <= 4000),
  next_service_date    date,
  next_service_mileage int check (next_service_mileage >= 0),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, user_id),
  foreign key (vehicle_id, user_id) references public.vehicles (id, user_id) on delete cascade,
  foreign key (provider_id, user_id) references public.service_providers (id, user_id)
    on delete set null (provider_id)
);
create index idx_maint_vehicle_date on public.maintenance_records (vehicle_id, performed_at desc);
create index idx_maint_user on public.maintenance_records (user_id);
create trigger trg_maint_updated before update on public.maintenance_records
  for each row execute function public.set_updated_at();

-- ---------- FUEL RECORDS ----------
create table public.fuel_records (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  vehicle_id      uuid not null,
  filled_at       date not null,
  mileage         int  not null check (mileage >= 0),
  liters          numeric(8,2) not null check (liters > 0),
  price_per_liter numeric(8,3) not null check (price_per_liter > 0),
  total_amount    numeric(10,2) not null check (total_amount > 0),
  station         text check (char_length(station) <= 120),
  fuel_type       public.fuel_type,
  full_tank       boolean not null default true,
  notes           text check (char_length(notes) <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (vehicle_id, user_id) references public.vehicles (id, user_id) on delete cascade,
  check (abs(total_amount - liters * price_per_liter) <= 0.5)
);
create index idx_fuel_vehicle_date on public.fuel_records (vehicle_id, filled_at desc);
create index idx_fuel_user on public.fuel_records (user_id);
create trigger trg_fuel_updated before update on public.fuel_records
  for each row execute function public.set_updated_at();

-- ---------- EXPENSES (jedno źródło prawdy dla kosztów) ----------
create table public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  vehicle_id  uuid not null,
  category    public.expense_category not null,
  amount      numeric(12,2) not null check (amount >= 0),
  spent_at    date not null,
  description text check (char_length(description) <= 500),
  source_type public.expense_source,
  source_id   uuid,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (vehicle_id, user_id) references public.vehicles (id, user_id) on delete cascade,
  check ((source_type is null) = (source_id is null))
);
create index idx_expenses_vehicle_date on public.expenses (vehicle_id, spent_at desc);
create index idx_expenses_user on public.expenses (user_id);
create unique index uq_expenses_source on public.expenses (source_type, source_id)
  where source_id is not null;
create trigger trg_expenses_updated before update on public.expenses
  for each row execute function public.set_updated_at();

-- Tankowanie -> wpis przebiegu + koszt
create or replace function public.sync_fuel_record()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    delete from public.expenses     where source_type = 'fuel' and source_id = old.id;
    delete from public.mileage_logs where source = 'fuel'      and source_id = old.id;
    return old;
  end if;

  insert into public.expenses (user_id, vehicle_id, category, amount, spent_at, description, source_type, source_id)
  values (new.user_id, new.vehicle_id, 'fuel', new.total_amount, new.filled_at,
          coalesce(new.station, 'Tankowanie'), 'fuel', new.id)
  on conflict (source_type, source_id) where source_id is not null
  do update set vehicle_id = excluded.vehicle_id, amount = excluded.amount,
                spent_at = excluded.spent_at, description = excluded.description;

  insert into public.mileage_logs (user_id, vehicle_id, mileage, recorded_at, source, source_id)
  values (new.user_id, new.vehicle_id, new.mileage, new.filled_at, 'fuel', new.id)
  on conflict (source, source_id) where source_id is not null
  do update set vehicle_id = excluded.vehicle_id, mileage = excluded.mileage,
                recorded_at = excluded.recorded_at;
  return new;
end $$;
create trigger trg_fuel_sync after insert or update or delete on public.fuel_records
  for each row execute function public.sync_fuel_record();

-- Serwis -> wpis przebiegu + koszt (jeśli podano koszt > 0)
create or replace function public.maintenance_expense_category(t public.maintenance_type)
returns public.expense_category language sql immutable as $$
  select case t
    when 'brakes'      then 'repairs'::public.expense_category
    when 'suspension'  then 'repairs'
    when 'tires'       then 'tires'
    when 'inspection'  then 'taxes_fees'
    else 'maintenance' end;
$$;

create or replace function public.sync_maintenance_record()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    delete from public.expenses     where source_type = 'maintenance' and source_id = old.id;
    delete from public.mileage_logs where source = 'service'          and source_id = old.id;
    return old;
  end if;

  if coalesce(new.cost, 0) > 0 then
    insert into public.expenses (user_id, vehicle_id, category, amount, spent_at, description, source_type, source_id)
    values (new.user_id, new.vehicle_id, public.maintenance_expense_category(new.type),
            new.cost, new.performed_at, new.description, 'maintenance', new.id)
    on conflict (source_type, source_id) where source_id is not null
    do update set vehicle_id = excluded.vehicle_id, category = excluded.category,
                  amount = excluded.amount, spent_at = excluded.spent_at,
                  description = excluded.description;
  else
    delete from public.expenses where source_type = 'maintenance' and source_id = new.id;
  end if;

  insert into public.mileage_logs (user_id, vehicle_id, mileage, recorded_at, source, source_id)
  values (new.user_id, new.vehicle_id, new.mileage, new.performed_at, 'service', new.id)
  on conflict (source, source_id) where source_id is not null
  do update set vehicle_id = excluded.vehicle_id, mileage = excluded.mileage,
                recorded_at = excluded.recorded_at;
  return new;
end $$;
create trigger trg_maint_sync after insert or update or delete on public.maintenance_records
  for each row execute function public.sync_maintenance_record();

-- ---------- REMINDERS ----------
create table public.reminders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  vehicle_id      uuid not null,
  title           text not null check (char_length(title) between 1 and 150),
  kind            public.reminder_kind not null,
  due_date        date,
  due_mileage     int check (due_mileage >= 0),
  interval_months int check (interval_months > 0),
  interval_km     int check (interval_km > 0),
  notify_days_before int not null default 14 check (notify_days_before >= 0),
  notify_km_before   int not null default 1000 check (notify_km_before >= 0),
  status          public.reminder_status not null default 'active',
  last_done_at    date,
  last_notified_at timestamptz,
  notes           text check (char_length(notes) <= 1000),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (vehicle_id, user_id) references public.vehicles (id, user_id) on delete cascade,
  check (
    (kind = 'date'    and due_date is not null) or
    (kind = 'mileage' and due_mileage is not null) or
    (kind = 'both'    and due_date is not null and due_mileage is not null)
  )
);
create index idx_reminders_vehicle on public.reminders (vehicle_id, status);
create index idx_reminders_user on public.reminders (user_id);
create index idx_reminders_due_date on public.reminders (due_date) where status = 'active';
create trigger trg_reminders_updated before update on public.reminders
  for each row execute function public.set_updated_at();

-- ---------- DOCUMENTS ----------
create table public.documents (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  vehicle_id     uuid not null,
  maintenance_id uuid,
  type           public.document_type not null,
  title          text not null check (char_length(title) between 1 and 150),
  file_path      text not null unique,   -- konwencja: {user_id}/{vehicle_id}/{uuid}.{ext}
  mime_type      text not null check (mime_type in
                   ('application/pdf','image/jpeg','image/png','image/webp','image/heic')),
  size_bytes     bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  expires_at     date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  foreign key (vehicle_id, user_id) references public.vehicles (id, user_id) on delete cascade,
  foreign key (maintenance_id, user_id) references public.maintenance_records (id, user_id)
    on delete set null (maintenance_id),
  check (file_path like user_id::text || '/%')
);
create index idx_documents_vehicle on public.documents (vehicle_id, type);
create index idx_documents_user on public.documents (user_id);
create index idx_documents_expires on public.documents (expires_at) where expires_at is not null;
create trigger trg_documents_updated before update on public.documents
  for each row execute function public.set_updated_at();

-- ---------- AI ----------
create table public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  vehicle_id uuid,
  title      text check (char_length(title) <= 150),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (vehicle_id, user_id) references public.vehicles (id, user_id) on delete cascade
);
create index idx_ai_conv_user on public.ai_conversations (user_id, updated_at desc);
create trigger trg_ai_conv_updated before update on public.ai_conversations
  for each row execute function public.set_updated_at();

create table public.ai_messages (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid not null,
  role            public.ai_role not null,
  content         text not null check (char_length(content) <= 20000),
  -- np. {"claims":[{"text":"...","level":"verified|estimate|assumption"}],"model":"..."}
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  foreign key (conversation_id, user_id) references public.ai_conversations (id, user_id) on delete cascade
);
create index idx_ai_msg_conv on public.ai_messages (conversation_id, created_at);
create index idx_ai_msg_user_time on public.ai_messages (user_id, created_at desc);

-- ---------- WIDOKI ANALITYCZNE (security_invoker => działa RLS) ----------
-- Spalanie metodą "pełny bak do pełnego baku"
create view public.v_fuel_efficiency with (security_invoker = true) as
with seg as (
  select f.*,
         coalesce(count(*) filter (where f.full_tank) over (
           partition by f.vehicle_id order by f.mileage, f.filled_at, f.id
           rows between unbounded preceding and 1 preceding), 0) as grp
    from public.fuel_records f
), agg as (
  select user_id, vehicle_id, grp,
         max(mileage)   filter (where full_tank) as end_mileage,
         max(filled_at) filter (where full_tank) as end_date,
         sum(liters)       as liters,
         sum(total_amount) as cost
    from seg group by user_id, vehicle_id, grp
  having bool_or(full_tank)
), pairs as (
  select *, lag(end_mileage) over (partition by vehicle_id order by grp) as start_mileage
    from agg
)
select user_id, vehicle_id, start_mileage, end_mileage, end_date,
       end_mileage - start_mileage                                    as distance_km,
       liters, cost,
       round(liters / (end_mileage - start_mileage) * 100, 2)          as l_per_100km,
       round(cost   / (end_mileage - start_mileage) * 100, 2)          as cost_per_100km,
       round(cost   / (end_mileage - start_mileage), 3)                as cost_per_km
  from pairs
 where start_mileage is not null and end_mileage > start_mileage;

create view public.v_monthly_expenses with (security_invoker = true) as
select user_id, vehicle_id, date_trunc('month', spent_at)::date as month,
       category, sum(amount) as total, count(*) as entries
  from public.expenses
 group by user_id, vehicle_id, date_trunc('month', spent_at), category;

-- Średni dzienny przebieg z ostatnich 365 dni (do prognozy terminów przypomnień)
create view public.v_vehicle_daily_km with (security_invoker = true) as
select v.id as vehicle_id, v.user_id,
       case when span.days >= 14 and span.km > 0
            then round(span.km::numeric / span.days, 2) end as avg_km_per_day
  from public.vehicles v
  left join lateral (
    select max(m.mileage) - min(m.mileage)           as km,
           max(m.recorded_at) - min(m.recorded_at)    as days
      from public.mileage_logs m
     where m.vehicle_id = v.id and m.recorded_at >= current_date - 365
  ) span on true;

-- Przypomnienia z szacowaną datą (dla progów kilometrowych)
create view public.v_reminder_forecast with (security_invoker = true) as
select r.*, v.current_mileage, d.avg_km_per_day,
       case when r.due_mileage is not null and d.avg_km_per_day > 0
            then current_date + ceil(greatest(r.due_mileage - v.current_mileage, 0) / d.avg_km_per_day)::int
       end as estimated_mileage_due_date,
       case when r.due_mileage is not null
            then r.due_mileage - v.current_mileage end as km_remaining
  from public.reminders r
  join public.vehicles v on v.id = r.vehicle_id
  left join public.v_vehicle_daily_km d on d.vehicle_id = r.vehicle_id
 where r.status = 'active';

-- ---------- ROW LEVEL SECURITY ----------
alter table public.profiles            enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.vehicles            enable row level security;
alter table public.service_providers   enable row level security;
alter table public.mileage_logs        enable row level security;
alter table public.maintenance_records enable row level security;
alter table public.fuel_records        enable row level security;
alter table public.expenses            enable row level security;
alter table public.reminders           enable row level security;
alter table public.documents           enable row level security;
alter table public.ai_conversations    enable row level security;
alter table public.ai_messages         enable row level security;

create policy "own profile" on public.profiles
  for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- subskrypcje: klient tylko czyta; zapis robi serwer (service role / webhook)
create policy "read own subscription" on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on public.subscriptions from authenticated, anon;

do $$
declare t text;
begin
  foreach t in array array[
    'vehicles','service_providers','mileage_logs','maintenance_records',
    'fuel_records','expenses','reminders','documents','ai_conversations','ai_messages'
  ] loop
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- anon nie ma dostępu do niczego
revoke all on all tables in schema public from anon;

-- ---------- STORAGE (prywatne buckety, ścieżka: {user_id}/...) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('documents', 'documents', false, 10485760,
     array['application/pdf','image/jpeg','image/png','image/webp','image/heic']),
  ('vehicle-photos', 'vehicle-photos', false, 5242880,
     array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create policy "storage: own files select" on storage.objects for select to authenticated
  using (bucket_id in ('documents','vehicle-photos')
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: own files insert" on storage.objects for insert to authenticated
  with check (bucket_id in ('documents','vehicle-photos')
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: own files update" on storage.objects for update to authenticated
  using (bucket_id in ('documents','vehicle-photos')
         and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "storage: own files delete" on storage.objects for delete to authenticated
  using (bucket_id in ('documents','vehicle-photos')
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =====================================================================
-- KONIEC. Test izolacji (po utworzeniu dwóch kont): zalogowany użytkownik A
-- nie może SELECT/INSERT/UPDATE/DELETE na wierszach użytkownika B w żadnej tabeli.
-- =====================================================================
