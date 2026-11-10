import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const db = new PGlite();
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { cond ? pass++ : fail++; console.log(`${cond ? "PASS" : "FAIL"}  ${name}${cond ? "" : "  -> " + extra}`); };
const q = async (sql, p) => (await db.query(sql, p)).rows;
const as = async (uid, f) => { await db.exec(`reset role; select set_config('request.jwt.claim.sub','${uid}',false); set role authenticated;`); try { return await f(); } finally { await db.exec("reset role"); } };
const err = async (f) => { try { await f(); return ""; } catch (e) { return String(e.message); } };

// ---- atrapa warstwy Supabase ----
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:greatest(cardinality(string_to_array(name,'/'))-1,0)] $$;
grant usage on schema public, storage to anon, authenticated, service_role;
grant all on storage.objects to authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`);
for (const f of ["001_schema.sql", "002_notifications.sql", "003_analytics.sql"]) {
  const e = await err(() => db.exec(readFileSync(new URL("../../supabase/migrations/" + f, import.meta.url), "utf8")));
  ok(`migracja ${f} wykonuje się bez błędów`, !e, e);
}

const A = randomUUID(), B = randomUUID();
await db.exec(`insert into auth.users(id,email) values ('${A}','a@test.pl'),('${B}','b@test.pl')`);
ok("nowy użytkownik dostaje profil i plan Free", (await q(`select count(*)::int c from profiles`))[0].c === 2 && (await q(`select count(*)::int c from subscriptions where plan='free'`))[0].c === 2);

// ---- pojazdy ----
const vid = (await as(A, () => q(`insert into vehicles(user_id,make,model,current_mileage,vin,plate) values ($1,'Skoda','Octavia',101600,'tmbjg7ne5g0123456','po 12345') returning id`, [A])))[0].id;
const v = (await as(A, () => q(`select * from vehicles where id=$1`, [vid])))[0];
ok("VIN i numer rej. normalizowane do wielkich liter", v.vin === "TMBJG7NE5G0123456" && v.plate === "PO 12345", JSON.stringify(v));
ok("dodanie pojazdu tworzy pierwszy wpis przebiegu", (await as(A, () => q(`select count(*)::int c from mileage_logs where vehicle_id=$1`, [vid])))[0].c === 1);
let e = await err(() => as(A, () => q(`insert into vehicles(user_id,make,model) values ($1,'Fiat','Panda')`, [A])));
ok("plan Free: drugi pojazd odrzucony (VEHICLE_LIMIT_REACHED)", e.includes("VEHICLE_LIMIT_REACHED"), e);
e = await err(() => as(A, () => q(`update vehicles set current_mileage=5 where id=$1`, [vid])));
ok("bezpośrednia zmiana przebiegu w vehicles zablokowana", e.includes("mileage_logs"), e);

// ---- izolacja użytkowników ----
const bVid = (await as(B, () => q(`insert into vehicles(user_id,make,model,current_mileage) values ($1,'Audi','A4',50000) returning id`, [B])))[0].id;
ok("B nie widzi pojazdów A", (await as(B, () => q(`select count(*)::int c from vehicles`)))[0].c === 1);
ok("B nie zmodyfikuje pojazdu A (0 wierszy)", (await as(B, () => q(`update vehicles set make='X' where id=$1 returning id`, [vid]))).length === 0);
ok("B nie usunie pojazdu A (0 wierszy)", (await as(B, () => q(`delete from vehicles where id=$1 returning id`, [vid]))).length === 0);
e = await err(() => as(B, () => q(`insert into maintenance_records(user_id,vehicle_id,type,performed_at,mileage) values ($1,$2,'other','2026-09-01',1)`, [B, vid])));
ok("B nie dopisze serwisu do pojazdu A (złożony FK)", /foreign key|violates/i.test(e), e);
e = await err(() => as(B, () => q(`insert into fuel_records(user_id,vehicle_id,filled_at,mileage,liters,price_per_liter,total_amount) values ($1,$2,'2026-09-01',1,1,1,1)`, [A, bVid])));
ok("B nie wstawi wiersza z cudzym user_id (RLS)", /row-level security/i.test(e), e);
ok("B nie czyta mileage_logs A", (await as(B, () => q(`select count(*)::int c from mileage_logs where vehicle_id=$1`, [vid])))[0].c === 0);
ok("B nie zmieni profilu A", (await as(B, () => q(`update profiles set display_name='x' where id=$1 returning id`, [A]))).length === 0);
e = await err(async () => { await db.exec("reset role; set role anon"); try { await q(`select * from vehicles`); } finally { await db.exec("reset role"); } });
ok("anon nie ma dostępu do tabel", /permission denied/i.test(e), e);

// ---- subskrypcje: tylko serwer ----
e = await err(() => as(A, () => q(`update subscriptions set plan='premium' where user_id=$1`, [A])));
ok("użytkownik nie podniesie sobie planu do Premium", /permission denied/i.test(e), e);
e = await err(() => as(A, () => q(`insert into subscriptions(user_id,plan) values ($1,'premium')`, [B])));
ok("użytkownik nie utworzy subskrypcji", /permission denied/i.test(e), e);

// ---- tankowania, serwis, koszty ----
const fills = [["2026-09-01", 99100, 40, 240, true], ["2026-09-08", 99600, 35, 210, true], ["2026-09-15", 100100, 30, 180, true], ["2026-09-20", 100300, 10, 60, false], ["2026-09-25", 100600, 25, 150, true]];
for (const [d, m, l, t, f] of fills)
  await as(A, () => q(`insert into fuel_records(user_id,vehicle_id,filled_at,mileage,liters,price_per_liter,total_amount,full_tank) values ($1,$2,$3,$4,$5,6,$6,$7)`, [A, vid, d, m, l, t, f]));
ok("tankowania tworzą wpisy w kosztach (840 zł)", Number((await as(A, () => q(`select sum(amount) s from expenses where category='fuel'`)))[0].s) === 840);
const eff = await as(A, () => q(`select l_per_100km from v_fuel_efficiency order by end_date`));
ok("spalanie: pełny→pełny z tankowaniem częściowym = 7,00 / 6,00 / 7,00", eff.map((r) => Number(r.l_per_100km)).join() === "7,6,7", JSON.stringify(eff));
ok("przebieg pojazdu = max z logów (nie spada przy wpisach wstecz)", (await as(A, () => q(`select current_mileage m from vehicles where id=$1`, [vid])))[0].m === 101600);
e = await err(() => as(A, () => q(`insert into fuel_records(user_id,vehicle_id,filled_at,mileage,liters,price_per_liter,total_amount) values ($1,$2,'2026-09-30',100000,10,6,60)`, [A, vid])));
ok("przebieg niższy niż we wcześniejszym wpisie odrzucony (MILEAGE_DECREASED)", e.includes("MILEAGE_DECREASED"), e);
e = await err(() => as(A, () => q(`insert into fuel_records(user_id,vehicle_id,filled_at,mileage,liters,price_per_liter,total_amount) values ($1,$2,'2026-09-10',9999999,10,6,60)`, [A, vid])));
ok("przebieg wyższy niż w późniejszym wpisie odrzucony (MILEAGE_EXCEEDS_LATER)", e.includes("MILEAGE_EXCEEDS_LATER"), e);
e = await err(() => as(A, () => q(`insert into fuel_records(user_id,vehicle_id,filled_at,mileage,liters,price_per_liter,total_amount) values ($1,$2,'2026-10-01',101700,10,6,99)`, [A, vid])));
ok("kwota niezgodna z litrami × cena odrzucona (CHECK)", /check/i.test(e), e);

const oil = (await as(A, () => q(`insert into maintenance_records(user_id,vehicle_id,type,performed_at,mileage,cost) values ($1,$2,'oil_change','2026-09-12',99800,650.50) returning id`, [A, vid])))[0].id;
const brk = (await as(A, () => q(`insert into maintenance_records(user_id,vehicle_id,type,performed_at,mileage,cost) values ($1,$2,'brakes','2026-09-22',100400,1200) returning id`, [A, vid])))[0].id;
const cats = await as(A, () => q(`select source_id, category from expenses where source_type='maintenance'`));
ok("serwis → koszt: olej=maintenance, hamulce=repairs", cats.find((r) => r.source_id === oil)?.category === "maintenance" && cats.find((r) => r.source_id === brk)?.category === "repairs", JSON.stringify(cats));
await as(A, () => q(`update maintenance_records set cost=700 where id=$1`, [oil]));
ok("edycja kosztu serwisu aktualizuje wydatek", Number((await as(A, () => q(`select amount a from expenses where source_id=$1`, [oil])))[0].a) === 700);
await as(A, () => q(`update maintenance_records set cost=700.50 where id=$1`, [oil]));
await as(A, () => q(`update maintenance_records set cost=null where id=$1`, [brk]));
ok("koszt = brak usuwa wydatek ze źródła", (await as(A, () => q(`select count(*)::int c from expenses where source_id=$1`, [brk])))[0].c === 0);
await as(A, () => q(`update maintenance_records set cost=1200 where id=$1`, [brk]));
const tmp = (await as(A, () => q(`insert into maintenance_records(user_id,vehicle_id,type,performed_at,mileage,cost) values ($1,$2,'other','2026-09-26',100700,50) returning id`, [A, vid])))[0].id;
await as(A, () => q(`delete from maintenance_records where id=$1`, [tmp]));
ok("usunięcie serwisu usuwa jego koszt i wpis przebiegu", (await as(A, () => q(`select (select count(*) from expenses where source_id=$1)+(select count(*) from mileage_logs where source_id=$1) c`, [tmp])))[0].c == 0);

const prov = (await as(A, () => q(`insert into service_providers(user_id,name) values ($1,'Warsztat A') returning id`, [A])))[0].id;
e = await err(() => as(B, () => q(`insert into maintenance_records(user_id,vehicle_id,type,performed_at,mileage,provider_id) values ($1,$2,'other','2026-09-01',1,$3)`, [B, bVid, prov])));
ok("B nie użyje warsztatu A w swoim wpisie (złożony FK)", /foreign key|violates/i.test(e), e);

// ---- przypomnienia ----
e = await err(() => as(A, () => q(`insert into reminders(user_id,vehicle_id,title,kind,due_date) values ($1,$2,'x','both','2027-01-01')`, [A, vid])));
ok("przypomnienie 'both' bez przebiegu odrzucone (CHECK)", /check/i.test(e), e);
await as(A, () => q(`insert into reminders(user_id,vehicle_id,title,kind,due_mileage) values ($1,$2,'Olej','mileage',103000)`, [A, vid]));
const fc = (await as(A, () => q(`select km_remaining, estimated_mileage_due_date e, avg_km_per_day from v_reminder_forecast`)))[0];
ok("prognoza: zostało 1400 km i jest szacowana data", fc.km_remaining === 1400 && fc.e !== null, JSON.stringify(fc));

// ---- dokumenty i storage ----
e = await err(() => as(A, () => q(`insert into documents(user_id,vehicle_id,type,title,file_path,mime_type,size_bytes) values ($1,$2,'invoice','f',$3,'application/pdf',100)`, [A, vid, `${B}/${vid}/x.pdf`])));
ok("dokument ze ścieżką cudzego użytkownika odrzucony (CHECK)", /check/i.test(e), e);
e = await err(() => as(A, () => q(`insert into documents(user_id,vehicle_id,type,title,file_path,mime_type,size_bytes) values ($1,$2,'invoice','f',$3,'text/html',100)`, [A, vid, `${A}/${vid}/x.html`])));
ok("dokument o niedozwolonym MIME odrzucony (CHECK)", /check/i.test(e), e);
await as(A, () => q(`insert into documents(user_id,vehicle_id,type,title,file_path,mime_type,size_bytes,expires_at) values ($1,$2,'insurance','OC',$3,'application/pdf',100,'2027-03-01')`, [A, vid, `${A}/${vid}/ok.pdf`]));
ok("poprawny dokument zapisany", (await as(A, () => q(`select count(*)::int c from documents`)))[0].c === 1);
await as(A, () => q(`insert into storage.objects(bucket_id,name) values ('documents',$1)`, [`${A}/${vid}/ok.pdf`]));
e = await err(() => as(A, () => q(`insert into storage.objects(bucket_id,name) values ('documents',$1)`, [`${B}/${bVid}/evil.pdf`])));
ok("storage: zapis do folderu innego użytkownika zablokowany", /row-level security/i.test(e), e);
ok("storage: B nie widzi plików A", (await as(B, () => q(`select count(*)::int c from storage.objects`)))[0].c === 0);

// ---- analityka ----
const an = (await as(A, () => q(`select * from vehicle_analytics(null)`)))[0];
ok("analityka (cały okres): wydatki 2740,50, 2500 km, 1,096 zł/km", Number(an.total_expenses) === 2740.5 && an.km_driven === 2500 && Number(an.cost_per_km) === 1.096, JSON.stringify(an));
ok("analityka: spalanie 6,67 l/100 km, paliwo 40 zł/100 km", Number(an.avg_l_per_100km) === 6.67 && Number(an.fuel_cost_per_100km) === 40, JSON.stringify(an));
const an2 = (await as(A, () => q(`select * from vehicle_analytics('2026-09-20')`)))[0];
ok("analityka (od 20.09): wydatki 1410, 1500 km, 7,00 l/100 km", Number(an2.total_expenses) === 1410 && an2.km_driven === 1500 && Number(an2.avg_l_per_100km) === 7, JSON.stringify(an2));
ok("analityka: B widzi tylko swój pojazd", (await as(B, () => q(`select * from vehicle_analytics(null)`))).length === 1);

// ---- edycja tankowania ----
const fid = (await as(A, () => q(`select id from fuel_records where mileage=100600`)))[0].id;
await as(A, () => q(`update fuel_records set liters=20, total_amount=120 where id=$1`, [fid]));
ok("edycja tankowania aktualizuje koszt", Number((await as(A, () => q(`select amount a from expenses where source_id=$1`, [fid])))[0].a) === 120);
e = await err(() => as(A, () => q(`update fuel_records set mileage=99000 where id=$1`, [fid])));
ok("edycja tankowania nie obejdzie reguły niemalejącego przebiegu", e.includes("MILEAGE_DECREASED"), e);

// ---- archiwizacja i premium ----
await as(A, () => q(`update vehicles set archived_at=now() where id=$1`, [vid]));
const v2 = (await as(A, () => q(`insert into vehicles(user_id,make,model) values ($1,'Fiat','Panda') returning id`, [A])))[0].id;
ok("archiwizacja zwalnia miejsce w limicie Free", !!v2);
await db.exec(`update subscriptions set plan='premium', status='active' where user_id='${A}'`);
ok("plan Premium: kolejny pojazd dozwolony", !(await err(() => as(A, () => q(`insert into vehicles(user_id,make,model) values ($1,'Seat','Leon')`, [A])))));
await as(A, () => q(`update vehicles set archived_at=null where id=$1`, [vid]));

// ---- kaskada ----
e = await err(() => as(A, () => q(`delete from vehicles where id=$1`, [vid])));
ok("usunięcie pojazdu z całą historią działa bez błędów (kaskada + triggery)", !e, e);
const left = (await q(`select (select count(*) from fuel_records where vehicle_id='${vid}')+(select count(*) from maintenance_records where vehicle_id='${vid}')+(select count(*) from expenses where vehicle_id='${vid}')+(select count(*) from mileage_logs where vehicle_id='${vid}')+(select count(*) from reminders where vehicle_id='${vid}')+(select count(*) from documents where vehicle_id='${vid}') c`))[0].c;
ok("po usunięciu nie zostają osierocone wiersze", Number(left) === 0, String(left));

console.log(`\n${pass} PASS, ${fail} FAIL`);
