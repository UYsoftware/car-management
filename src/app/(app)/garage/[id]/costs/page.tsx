import { createClient } from "@/lib/supabase/server";
import { ExpenseForm, DeleteButton } from "@/components/record-forms";
import { MonthlyBars } from "@/components/charts";
import { pln, km, datePl, monthLabel, EXPENSE_PL, EXPENSE_COLOR } from "@/lib/format";
import { addExpense, deleteExpense } from "../actions";

const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());

export default async function Costs({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ cat?: string; ok?: string; t?: string }> }) {
  const [{ id }, { cat, ok, t }] = await Promise.all([params, searchParams]);
  const sb = await createClient();
  let q = sb.from("expenses").select("id,category,amount,spent_at,description,source_type").eq("vehicle_id", id)
    .order("spent_at", { ascending: false }).order("created_at", { ascending: false }).limit(100);
  if (cat && EXPENSE_PL[cat]) q = q.eq("category", cat);
  const [list, mon, veh, first] = await Promise.all([
    q, sb.from("v_monthly_expenses").select("month,category,total").eq("vehicle_id", id).order("month"),
    sb.from("vehicles").select("current_mileage,purchase_price").eq("id", id).single(),
    sb.from("mileage_logs").select("mileage").eq("vehicle_id", id).order("mileage").limit(1).maybeSingle(),
  ]);
  const err = [list, mon].find((r) => r.error)?.error;
  if (err) return <p role="alert" className="card p-6 text-sm">Nie udało się wczytać kosztów: {err.message}</p>;

  const all = mon.data ?? [];
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const total = all.reduce((s, r) => s + Number(r.total), 0);
  const thisYear = all.filter((r) => r.month >= yearStart).reduce((s, r) => s + Number(r.total), 0);
  const byCat = new Map<string, number>();
  all.forEach((r) => byCat.set(r.category, (byCat.get(r.category) ?? 0) + Number(r.total)));
  const driven = (veh.data?.current_mileage ?? 0) - (first.data?.mileage ?? 0);
  const price = veh.data?.purchase_price != null ? Number(veh.data.purchase_price) : null;

  const since = new Date(); since.setMonth(since.getMonth() - 11); since.setDate(1);
  const cutoff = since.toISOString().slice(0, 10);
  const months = new Map<string, Record<string, number | string>>();
  all.filter((r) => r.month >= cutoff).forEach((r) => {
    const row = months.get(r.month) ?? { label: monthLabel(r.month) };
    row[r.category] = Number(r.total); months.set(r.month, row);
  });
  const used = [...byCat.keys()];

  return (
    <div className="max-w-3xl space-y-8">
      {ok && <p role="status" className="rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent">{ok === "deleted" ? "Wydatek usunięty." : "Wydatek dodany."}</p>}

      <section aria-label="Podsumowanie kosztów" className="grid gap-4 sm:grid-cols-3">
        <Stat label="Wydatki łącznie" value={pln(total)} />
        <Stat label={`Wydatki w ${new Date().getFullYear()}`} value={pln(thisYear)} />
        <Stat label="Koszt na kilometr" value={driven > 0 && total > 0 ? pln(total / driven) : "—"}
          hint={driven > 0 ? `Liczone na ${km(driven)} od pierwszego wpisu przebiegu` : "Potrzebne co najmniej dwa różne wpisy przebiegu."} />
        {price !== null && <Stat label="Całkowity koszt posiadania" value={pln(price + total)} hint={`Zakup ${pln(price)} + wydatki`} />}
      </section>

      {all.length > 0 && (
        <section className="card space-y-3 p-5">
          <h2 className="font-semibold">Miesięczne wydatki — ostatnie 12 miesięcy</h2>
          <MonthlyBars label="Wykres miesięcznych wydatków według kategorii" data={[...months.values()]}
            series={used.map((k) => ({ key: k, label: EXPENSE_PL[k], color: EXPENSE_COLOR[k] }))} />
          <ul className="flex flex-wrap gap-x-5 gap-y-1 pt-1 text-sm">
            {[...byCat].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
              <li key={k} className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: EXPENSE_COLOR[k] }} />{EXPENSE_PL[k]}: <span className="tabular-nums">{pln(v)}</span></li>
            ))}
          </ul>
        </section>
      )}

      <details className="card p-5" open={all.length === 0}>
        <summary className="cursor-pointer font-semibold">Dodaj wydatek</summary>
        <div className="mt-5"><ExpenseForm key={t ?? "f"} action={addExpense.bind(null, id)} today={today()} /></div>
      </details>

      <section aria-labelledby="h" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="h" className="font-semibold">Historia wydatków</h2>
          <form method="get" className="flex items-center gap-2">
            <label className="sr-only" htmlFor="cat">Kategoria</label>
            <select id="cat" name="cat" defaultValue={cat ?? ""} className="input !w-auto !py-1.5">
              <option value="">Wszystkie kategorie</option>
              {Object.entries(EXPENSE_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="btn-quiet">Filtruj</button>
          </form>
        </div>
        {(list.data ?? []).length === 0 ? (
          <p className="card p-6 text-sm text-muted">{cat ? "Brak wydatków w tej kategorii." : "Nie ma jeszcze wydatków. Tankowania i serwisy pojawią się tu same, ubezpieczenie i opłaty dodasz ręcznie."}</p>
        ) : (
          <ul className="card divide-y divide-line">
            {list.data!.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div><p className="text-sm font-medium">{EXPENSE_PL[r.category]}{r.description ? ` — ${r.description}` : ""}</p>
                  <p className="text-sm text-muted">{datePl(r.spent_at)}{r.source_type ? ` · z ${r.source_type === "fuel" ? "tankowania" : "serwisu"}` : ""}</p></div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm tabular-nums">{pln(Number(r.amount))}</span>
                  {!r.source_type && <DeleteButton action={deleteExpense.bind(null, id, r.id)} what="wydatek" />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="card p-5"><p className="text-sm text-muted">{label}</p><p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>{hint && <p className="mt-1 text-xs text-muted">{hint}</p>}</div>;
}
