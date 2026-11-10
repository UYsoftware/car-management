import { createClient } from "@/lib/supabase/server";
import { ReminderForm } from "@/components/reminder-doc-forms";
import { DeleteButton } from "@/components/record-forms";
import { km, datePl, daysUntil } from "@/lib/format";
import { addReminder, completeReminder, deleteReminder } from "../actions-extra";

const OK: Record<string, string> = { added: "Przypomnienie dodane.", deleted: "Przypomnienie usunięte.", completed: "Oznaczono jako wykonane.", renewed: "Wykonane — ustawiono kolejny termin.", missing: "Nie znaleziono przypomnienia." };

export default async function Reminders({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; t?: string }> }) {
  const [{ id }, { ok, t }] = await Promise.all([params, searchParams]);
  const sb = await createClient();
  const [act, dn] = await Promise.all([
    sb.from("v_reminder_forecast").select("id,title,kind,due_date,due_mileage,km_remaining,estimated_mileage_due_date,interval_months,interval_km").eq("vehicle_id", id),
    sb.from("reminders").select("id,title,last_done_at").eq("vehicle_id", id).eq("status", "done").order("last_done_at", { ascending: false }).limit(10),
  ]);
  if (act.error) return <p role="alert" className="card p-6 text-sm">Nie udało się wczytać przypomnień: {act.error.message}</p>;

  const eff = (r: { due_date: string | null; estimated_mileage_due_date: string | null }) => r.due_date ?? r.estimated_mileage_due_date;
  const rows = [...(act.data ?? [])].sort((a, b) => (eff(a) ?? "9999").localeCompare(eff(b) ?? "9999"));

  return (
    <div className="max-w-2xl space-y-8">
      {ok && OK[ok] && <p role="status" className="rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent">{OK[ok]}</p>}
      <details className="card p-5" open={rows.length === 0}>
        <summary className="cursor-pointer font-semibold">Dodaj przypomnienie</summary>
        <div className="mt-5"><ReminderForm key={t ?? "f"} action={addReminder.bind(null, id)} /></div>
      </details>

      <section aria-labelledby="a" className="space-y-3">
        <h2 id="a" className="font-semibold">Aktywne</h2>
        {rows.length === 0 ? (
          <p className="card p-6 text-sm text-muted">Brak aktywnych przypomnień. Dodaj np. wymianę oleju, przegląd albo koniec ubezpieczenia — dam znać na pulpicie i e-mailem.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {rows.map((r) => {
              const d = r.due_date ? daysUntil(r.due_date) : null;
              const over = (d !== null && d < 0) || (r.km_remaining !== null && r.km_remaining <= 0);
              const soon = (d !== null && d <= 30) || (r.km_remaining !== null && r.km_remaining <= 1000);
              return (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <span aria-hidden className={`h-2 w-2 rounded-full ${over ? "bg-danger" : soon ? "bg-warn" : "bg-accent"}`} />{r.title}
                      {over && <span className="text-xs font-normal text-danger">po terminie</span>}
                    </p>
                    {r.due_date && <p className="text-sm text-muted">{datePl(r.due_date)} ({d! < 0 ? `${-d!} dn. temu` : `za ${d} dn.`})</p>}
                    {r.due_mileage !== null && (
                      <p className="text-sm text-muted">{km(r.due_mileage)} ({r.km_remaining! <= 0 ? "przekroczono" : `zostało ${km(r.km_remaining!)}`}{r.estimated_mileage_due_date && !r.due_date ? `, szacunkowo ok. ${datePl(r.estimated_mileage_due_date)}` : ""})</p>
                    )}
                    {(r.interval_months || r.interval_km) && <p className="text-xs text-muted">Powtarza się co {[r.interval_months && `${r.interval_months} mies.`, r.interval_km && km(r.interval_km)].filter(Boolean).join(" / ")}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <form action={completeReminder.bind(null, id, r.id)}><button className="btn-quiet !py-1 text-xs">Wykonane</button></form>
                    <DeleteButton action={deleteReminder.bind(null, id, r.id)} what="przypomnienie" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <p className="text-xs text-muted">Termin „szacunkowo" wynika ze średniego dziennego przebiegu z ostatniego roku. Pojawia się, gdy masz wpisy przebiegu z co najmniej 14 dni.</p>
      </section>

      {(dn.data ?? []).length > 0 && (
        <section aria-labelledby="d" className="space-y-3"><h2 id="d" className="font-semibold">Wykonane</h2>
          <ul className="card divide-y divide-line">{dn.data!.map((r) => (
            <li key={r.id} className="flex justify-between gap-4 px-4 py-3 text-sm"><span>{r.title}</span><span className="text-muted">{r.last_done_at ? datePl(r.last_done_at) : ""}</span></li>
          ))}</ul></section>
      )}
    </div>
  );
}
