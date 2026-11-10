import { createClient } from "@/lib/supabase/server";
import { FuelForm, DeleteButton } from "@/components/record-forms";
import { TrendChart, MonthlyBars } from "@/components/charts";
import { FUEL_PL } from "@/lib/vehicles";
import { pln, km, datePl, monthLabel, dec, EXPENSE_COLOR } from "@/lib/format";
import { addFuel, deleteFuel } from "../actions";

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());

export default async function Fuel({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; t?: string }> }) {
  const [{ id }, { ok, t }] = await Promise.all([params, searchParams]);
  const sb = await createClient();
  const since = new Date(); since.setMonth(since.getMonth() - 11); since.setDate(1);
  const [rec, eff, mon, veh] = await Promise.all([
    sb.from("fuel_records").select("id,filled_at,mileage,liters,price_per_liter,total_amount,station,fuel_type,full_tank")
      .eq("vehicle_id", id).order("filled_at", { ascending: false }).order("mileage", { ascending: false }).limit(100),
    sb.from("v_fuel_efficiency").select("end_date,distance_km,liters,cost,l_per_100km").eq("vehicle_id", id).order("end_date"),
    sb.from("v_monthly_expenses").select("month,total").eq("vehicle_id", id).eq("category", "fuel").gte("month", since.toISOString().slice(0, 10)).order("month"),
    sb.from("vehicles").select("current_mileage").eq("id", id).single(),
  ]);
  const err = [rec, eff, mon].find((r) => r.error)?.error;
  if (err) return <p role="alert" className="card p-6 text-sm">Nie udało się wczytać paliwa: {err.message}</p>;

  const e = eff.data ?? [];
  const dist = e.reduce((s, r) => s + Number(r.distance_km), 0);
  const lit = e.reduce((s, r) => s + Number(r.liters), 0);
  const cost = e.reduce((s, r) => s + Number(r.cost), 0);
  const rows = rec.data ?? [];

  return (
    <div className="max-w-3xl space-y-8">
      {ok && <p role="status" className="rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent">{ok === "deleted" ? "Tankowanie usunięte." : ok === "saved" ? "Zmiany zapisane." : "Tankowanie dodane."}</p>}

      <section aria-label="Statystyki paliwa" className="grid gap-4 sm:grid-cols-3">
        {dist > 0 ? <>
          <Stat label="Średnie spalanie" value={`${dec((lit / dist) * 100)} l/100 km`} />
          <Stat label="Koszt na 100 km" value={pln((cost / dist) * 100)} />
          <Stat label="Koszt na kilometr" value={pln(cost / dist)} />
        </> : (
          <p className="card p-5 text-sm text-muted sm:col-span-3">Spalanie liczymy między pełnymi tankowaniami. Dodaj co najmniej dwa tankowania „do pełna", a pojawią się tu średnie i wykres.</p>
        )}
      </section>

      {e.length > 1 && (
        <section className="card space-y-2 p-5"><h2 className="font-semibold">Spalanie w czasie</h2>
          <TrendChart label="Wykres spalania w litrach na 100 kilometrów" unit="l/100 km"
            data={e.map((r) => ({ label: datePl(r.end_date), value: Number(r.l_per_100km) }))} /></section>
      )}
      {(mon.data ?? []).length > 0 && (
        <section className="card space-y-2 p-5"><h2 className="font-semibold">Koszt paliwa — ostatnie 12 miesięcy</h2>
          <MonthlyBars label="Wykres miesięcznych kosztów paliwa" series={[{ key: "fuel", label: "Paliwo", color: EXPENSE_COLOR.fuel }]}
            data={mon.data!.map((m) => ({ label: monthLabel(m.month), fuel: Number(m.total) }))} /></section>
      )}

      <details className="card p-5" open={rows.length === 0}>
        <summary className="cursor-pointer font-semibold">Dodaj tankowanie</summary>
        <div className="mt-5"><FuelForm key={t ?? "f"} action={addFuel.bind(null, id)} today={today()} mileage={veh.data?.current_mileage ?? 0} /></div>
      </details>

      {rows.length > 0 && (
        <section aria-labelledby="h" className="space-y-3"><h2 id="h" className="font-semibold">Historia tankowań</h2>
          <ul className="card divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div><p className="text-sm font-medium">{dec(Number(r.liters), 2)} l · {pln(Number(r.total_amount))}</p>
                  <p className="text-sm text-muted">{datePl(r.filled_at)} · {km(r.mileage)} · {dec(Number(r.price_per_liter), 2)} zł/l{r.station ? ` · ${r.station}` : ""}{r.fuel_type ? ` · ${FUEL_PL[r.fuel_type as keyof typeof FUEL_PL]}` : ""}{r.full_tank ? "" : " · nie do pełna"}</p></div>
                <div className="flex shrink-0 items-center gap-1"><a href={`/garage/${id}/fuel/${r.id}`} className="btn-quiet !px-2 !py-1 text-xs">Edytuj</a><DeleteButton action={deleteFuel.bind(null, id, r.id)} what="tankowanie" /></div>
              </li>
            ))}
          </ul></section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="card p-5"><p className="text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p></div>;
}
