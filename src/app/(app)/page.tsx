import { createClient } from "@/lib/supabase/server";
import { Odometer } from "@/components/odometer";
import { pln, km, datePl, daysUntil, MAINTENANCE_PL } from "@/lib/format";

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function Dashboard() {
  const sb = await createClient();
  const now = new Date();
  const monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const in60 = iso(new Date(Date.now() + 60 * 864e5));

  const [veh, rem, docs, exp, svc, fuel] = await Promise.all([
    sb.from("vehicles").select("id,make,model,year,plate,current_mileage").is("archived_at", null).order("created_at"),
    sb.from("v_reminder_forecast").select("id,vehicle_id,title,due_date,km_remaining,estimated_mileage_due_date").limit(50),
    sb.from("documents").select("id,vehicle_id,title,expires_at").lte("expires_at", in60).order("expires_at").limit(10),
    sb.from("expenses").select("amount").gte("spent_at", monthStart),
    sb.from("maintenance_records").select("id,vehicle_id,type,performed_at,mileage,cost").order("performed_at", { ascending: false }).limit(5),
    sb.from("v_fuel_efficiency").select("l_per_100km"),
  ]);

  const failed = [veh, rem, docs, exp, svc, fuel].find((r) => r.error);
  if (failed?.error) {
    return (
      <div role="alert" className="card p-6">
        <h1 className="font-semibold">Nie udało się wczytać pulpitu</h1>
        <p className="mt-1 text-sm text-muted">Sprawdź, czy schemat bazy został uruchomiony i czy klucze w .env.local są poprawne. Szczegóły: {failed.error.message}</p>
      </div>
    );
  }

  const vehicles = veh.data ?? [];
  const name = new Map(vehicles.map((v) => [v.id, `${v.make} ${v.model}`]));
  const monthTotal = (exp.data ?? []).reduce((s, r) => s + Number(r.amount), 0);
  const eff = (fuel.data ?? []).map((r) => Number(r.l_per_100km));
  const avgEff = eff.length ? eff.reduce((a, b) => a + b, 0) / eff.length : null;

  type Alert = { key: string; text: string; sub: string; urgent: boolean };
  const alerts: Alert[] = [];
  for (const r of rem.data ?? []) {
    const when = r.due_date ?? r.estimated_mileage_due_date;
    const left = when ? daysUntil(when) : null;
    const nearKm = r.km_remaining !== null && r.km_remaining <= 1000;
    if ((left !== null && left <= 30) || nearKm) {
      const parts = [
        when ? (left! < 0 ? `termin minął ${-left!} dn. temu` : `za ${left} dn. (${datePl(when)})`) : "",
        r.km_remaining !== null ? (r.km_remaining <= 0 ? "próg przebiegu przekroczony" : `zostało ${km(r.km_remaining)}`) : "",
      ].filter(Boolean);
      alerts.push({ key: `r${r.id}`, text: r.title, sub: `${name.get(r.vehicle_id) ?? ""} — ${parts.join(", ")}`, urgent: (left ?? 1) < 0 || (r.km_remaining ?? 1) <= 0 });
    }
  }
  for (const d of docs.data ?? []) {
    const left = daysUntil(d.expires_at!);
    alerts.push({ key: `d${d.id}`, text: d.title, sub: `${name.get(d.vehicle_id) ?? ""} — ${left < 0 ? "dokument wygasł" : `wygasa za ${left} dn.`} (${datePl(d.expires_at!)})`, urgent: left < 0 });
  }
  alerts.sort((a, b) => Number(b.urgent) - Number(a.urgent));

  return (
    <div className="space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight">Pulpit</h1>

      {vehicles.length === 0 ? (
        <section className="card p-8 text-center">
          <h2 className="text-lg font-semibold">Twój garaż jest pusty</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">Gdy dodasz pierwszy samochód, zobaczysz tu jego przebieg, przypomnienia i koszty.</p>
          <a href="/garage/new" className="btn mt-5">Dodaj pierwszy pojazd</a>
        </section>
      ) : (
        <>
          {alerts.length > 0 && (
            <section aria-labelledby="alerts">
              <h2 id="alerts" className="mb-3 text-sm font-medium text-muted">Wymaga uwagi</h2>
              <ul className="card divide-y divide-line">
                {alerts.map((a) => (
                  <li key={a.key} className="flex items-start gap-3 px-4 py-3">
                    <span aria-hidden className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.urgent ? "bg-danger" : "bg-warn"}`} />
                    <div><p className="text-sm font-medium">{a.text}</p><p className="text-sm text-muted">{a.sub}</p></div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="garage">
            <h2 id="garage" className="mb-3 text-sm font-medium text-muted">Garaż</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {vehicles.map((v) => (
                <li key={v.id} className="card p-5"><a href={`/garage/${v.id}`} className="block">
                  <p className="font-semibold">{v.make} {v.model}</p>
                  <p className="text-sm text-muted">{[v.year, v.plate].filter(Boolean).join(" · ") || "Brak dodatkowych danych"}</p>
                  <div className="mt-4"><Odometer value={v.current_mileage} /></div>
                </a></li>
              ))}
            </ul>
          </section>

          <section aria-label="Podsumowanie" className="grid gap-4 sm:grid-cols-3">
            <Stat label="Wydatki w tym miesiącu" value={pln(monthTotal)} />
            <Stat label="Średnie spalanie" value={avgEff ? `${avgEff.toFixed(1).replace(".", ",")} l/100 km` : "—"} hint={avgEff ? undefined : "Potrzebne dwa tankowania do pełnego baku."} />
            <Stat label="Aktywne pojazdy" value={String(vehicles.length)} />
          </section>

          <section aria-labelledby="recent">
            <h2 id="recent" className="mb-3 text-sm font-medium text-muted">Ostatni serwis</h2>
            {(svc.data ?? []).length === 0 ? (
              <p className="card p-5 text-sm text-muted">Nie ma jeszcze wpisów serwisowych.</p>
            ) : (
              <ul className="card divide-y divide-line">
                {svc.data!.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-3">
                    <div><p className="text-sm font-medium">{MAINTENANCE_PL[s.type] ?? s.type}</p>
                      <p className="text-sm text-muted">{name.get(s.vehicle_id)} · {datePl(s.performed_at)} · {km(s.mileage)}</p></div>
                    <p className="text-sm tabular-nums">{s.cost ? pln(Number(s.cost)) : ""}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
