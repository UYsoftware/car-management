import { createClient } from "@/lib/supabase/server";
import { MonthlyBars } from "@/components/charts";
import { pln, km, dec, EXPENSE_PL, EXPENSE_COLOR } from "@/lib/format";

const RANGES = [["year", "Ten rok"], ["12m", "Ostatnie 12 miesięcy"], ["all", "Cały okres"]] as const;
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default async function Analytics({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: r } = await searchParams;
  const range = RANGES.some(([k]) => k === r) ? r! : "year";
  const now = new Date();
  const from = range === "year" ? `${now.getFullYear()}-01-01` : range === "12m" ? iso(new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())) : null;

  const sb = await createClient();
  const [an, mon] = await Promise.all([
    sb.rpc("vehicle_analytics", { p_from: from }),
    sb.from("v_monthly_expenses").select("vehicle_id,month,category,total"),
  ]);
  const err = an.error ?? mon.error;
  if (err) return <p role="alert" className="card p-6 text-sm">Nie udało się wczytać analityki. Upewnij się, że uruchomiono migrację 003. Szczegóły: {err.message}</p>;

  type VRow = { vehicle_id: string; make: string; model: string; plate: string | null; current_mileage: number; purchase_price: number | null;
    total_expenses: number; fuel_expenses: number; km_driven: number; cost_per_km: number | null; avg_l_per_100km: number | null; fuel_cost_per_100km: number | null };
  const vs: VRow[] = an.data ?? [];
  if (vs.length === 0) return (
    <div className="space-y-6"><h1 className="text-2xl font-semibold tracking-tight">Analityka</h1>
      <p className="card p-8 text-center text-sm text-muted">Dodaj pojazd i kilka wpisów, a zobaczysz tu koszty, spalanie i porównanie aut. <a href="/garage/new" className="text-accent underline">Dodaj pojazd</a></p></div>
  );

  const name = (v: { make: string; model: string; plate: string | null }) => `${v.make} ${v.model}${v.plate ? ` (${v.plate})` : ""}`;
  const rows = mon.data ?? [];
  const inRange = rows.filter((x) => !from || x.month >= from.slice(0, 7) + "-01");
  const cats = new Set<string>();
  const stacked = vs.map((v) => {
    const row: Record<string, number | string> = { label: `${v.make} ${v.model}` };
    inRange.filter((x) => x.vehicle_id === v.vehicle_id).forEach((x) => { cats.add(x.category); row[x.category] = Number(row[x.category] ?? 0) + Number(x.total); });
    return row;
  });
  const years = [...new Set(rows.map((x) => x.month.slice(0, 4)))].sort().reverse();
  const yearTotal = (vid: string, y: string) => rows.filter((x) => x.vehicle_id === vid && x.month.startsWith(y)).reduce((s, x) => s + Number(x.total), 0);

  const metrics: [string, (v: VRow) => string][] = [
    ["Aktualny przebieg", (v) => km(v.current_mileage)],
    ["Przejechano w okresie", (v) => (v.km_driven > 0 ? km(v.km_driven) : "—")],
    ["Wydatki w okresie", (v) => pln(Number(v.total_expenses))],
    ["w tym paliwo", (v) => pln(Number(v.fuel_expenses))],
    ["Koszt na kilometr", (v) => (v.cost_per_km ? pln(Number(v.cost_per_km)) : "—")],
    ["Średnie spalanie", (v) => (v.avg_l_per_100km ? `${dec(Number(v.avg_l_per_100km))} l/100 km` : "—")],
    ["Koszt paliwa na 100 km", (v) => (v.fuel_cost_per_100km ? pln(Number(v.fuel_cost_per_100km)) : "—")],
    ...(range === "all" ? [["Całkowity koszt posiadania", (v: VRow) => (v.purchase_price != null ? pln(Number(v.purchase_price) + Number(v.total_expenses)) : "—")] as [string, (v: VRow) => string]] : []),
  ];

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Analityka</h1>
      <nav aria-label="Okres" className="flex flex-wrap gap-2 text-sm">
        {RANGES.map(([k, l]) => (
          <a key={k} href={`/analytics?range=${k}`} aria-current={k === range ? "page" : undefined}
            className={`rounded-lg border px-3 py-1.5 ${k === range ? "border-accent text-accent" : "border-line text-muted hover:text-ink"}`}>{l}</a>
        ))}
      </nav>

      <section aria-labelledby="cmp" className="space-y-3">
        <h2 id="cmp" className="font-semibold">{vs.length > 1 ? "Porównanie pojazdów" : "Statystyki pojazdu"}</h2>
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead><tr className="border-b border-line text-left text-muted">
              <th scope="col" className="px-4 py-3 font-normal"><span className="sr-only">Wskaźnik</span></th>
              {vs.map((v) => <th key={v.vehicle_id} scope="col" className="px-4 py-3 text-right font-medium text-ink">{name(v)}</th>)}
            </tr></thead>
            <tbody>{metrics.map(([label, f]) => (
              <tr key={label} className="border-b border-line last:border-0">
                <th scope="row" className="px-4 py-3 text-left font-normal text-muted">{label}</th>
                {vs.map((v) => <td key={v.vehicle_id} className="px-4 py-3 text-right tabular-nums">{f(v)}</td>)}
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="text-xs text-muted">Koszt na kilometr liczony jest na kilometrach z wpisów przebiegu w wybranym okresie. Spalanie pochodzi z tankowań „do pełna”.</p>
      </section>

      {cats.size > 0 && (
        <section className="card space-y-3 p-5"><h2 className="font-semibold">Struktura wydatków</h2>
          <MonthlyBars label="Wykres wydatków według pojazdów i kategorii" data={stacked}
            series={[...cats].map((k) => ({ key: k, label: EXPENSE_PL[k], color: EXPENSE_COLOR[k] }))} /></section>
      )}

      {years.length > 0 && (
        <section aria-labelledby="yr" className="space-y-3">
          <h2 id="yr" className="font-semibold">Wydatki rocznie</h2>
          <div className="card overflow-x-auto"><table className="w-full min-w-[32rem] text-sm">
            <thead><tr className="border-b border-line text-left text-muted"><th scope="col" className="px-4 py-3 font-normal">Rok</th>
              {vs.map((v) => <th key={v.vehicle_id} scope="col" className="px-4 py-3 text-right font-medium text-ink">{name(v)}</th>)}
              {vs.length > 1 && <th scope="col" className="px-4 py-3 text-right font-medium text-ink">Razem</th>}</tr></thead>
            <tbody>{years.map((y) => (
              <tr key={y} className="border-b border-line last:border-0"><th scope="row" className="px-4 py-3 text-left font-normal text-muted">{y}</th>
                {vs.map((v) => <td key={v.vehicle_id} className="px-4 py-3 text-right tabular-nums">{pln(yearTotal(v.vehicle_id, y))}</td>)}
                {vs.length > 1 && <td className="px-4 py-3 text-right font-medium tabular-nums">{pln(vs.reduce((s, v) => s + yearTotal(v.vehicle_id, y), 0))}</td>}</tr>
            ))}</tbody></table></div>
        </section>
      )}
    </div>
  );
}
