import { createClient } from "@/lib/supabase/server";
import { MaintenanceForm, DeleteButton } from "@/components/record-forms";
import { MAINTENANCE_PL, pln, km, datePl } from "@/lib/format";
import { addMaintenance, deleteMaintenance } from "../actions";

const OK: Record<string, string> = { added: "Wpis dodany.", deleted: "Wpis usunięty.", saved: "Zmiany zapisane." };
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());

export default async function Service({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ type?: string; ok?: string; t?: string }> }) {
  const [{ id }, { type, ok, t }] = await Promise.all([params, searchParams]);
  const sb = await createClient();
  let q = sb.from("maintenance_records").select("id,type,performed_at,mileage,description,cost,notes,provider_id,next_service_date,next_service_mileage")
    .eq("vehicle_id", id).order("performed_at", { ascending: false }).order("mileage", { ascending: false }).limit(100);
  if (type && MAINTENANCE_PL[type]) q = q.eq("type", type);
  const [rec, prov, veh] = await Promise.all([
    q, sb.from("service_providers").select("id,name").order("name"),
    sb.from("vehicles").select("current_mileage").eq("id", id).single(),
  ]);
  if (rec.error) return <p role="alert" className="card p-6 text-sm">Nie udało się wczytać historii: {rec.error.message}</p>;
  const names = new Map((prov.data ?? []).map((p) => [p.id, p.name]));
  const rows = rec.data ?? [];
  const docs = rows.length ? (await sb.from("documents").select("id,title,file_path,maintenance_id").in("maintenance_id", rows.map((r) => r.id))).data ?? [] : [];
  const signed = docs.length ? (await sb.storage.from("documents").createSignedUrls(docs.map((d) => d.file_path), 600)).data ?? [] : [];
  const url = new Map(signed.map((x) => [x.path, x.signedUrl]));

  return (
    <div className="max-w-2xl space-y-8">
      {ok && OK[ok] && <p role="status" className="rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent">{OK[ok]}</p>}
      <details className="card p-5" open={rows.length === 0 && !type}>
        <summary className="cursor-pointer font-semibold">Dodaj wpis serwisowy</summary>
        <div className="mt-5"><MaintenanceForm key={t ?? "f"} action={addMaintenance.bind(null, id)} today={today()} mileage={veh.data?.current_mileage ?? 0} providers={(prov.data ?? []).map((p) => p.name)} /></div>
      </details>

      <section aria-labelledby="hist" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="hist" className="font-semibold">Historia</h2>
          <form className="flex items-center gap-2" method="get">
            <label className="sr-only" htmlFor="type">Rodzaj</label>
            <select id="type" name="type" defaultValue={type ?? ""} className="input !w-auto !py-1.5">
              <option value="">Wszystkie rodzaje</option>
              {Object.entries(MAINTENANCE_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="btn-quiet">Filtruj</button>
          </form>
        </div>
        {rows.length === 0 ? (
          <p className="card p-6 text-sm text-muted">{type ? "Brak wpisów tego rodzaju." : "Nie ma jeszcze wpisów. Dodaj pierwszy serwis, a od razu zobaczysz go w kosztach i przebiegu."}</p>
        ) : (
          <ul className="card divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{MAINTENANCE_PL[r.type]}{r.description ? ` — ${r.description}` : ""}</p>
                  <p className="text-sm text-muted">{datePl(r.performed_at)} · {km(r.mileage)}{r.provider_id && names.get(r.provider_id) ? ` · ${names.get(r.provider_id)}` : ""}</p>
                  {(r.next_service_date || r.next_service_mileage) && (
                    <p className="text-sm text-muted">Następny: {[r.next_service_date && datePl(r.next_service_date), r.next_service_mileage && km(r.next_service_mileage)].filter(Boolean).join(" lub ")}</p>
                  )}
                  {r.notes && <p className="mt-1 text-sm text-muted">{r.notes}</p>}
                  {docs.filter((d) => d.maintenance_id === r.id).map((d) => url.get(d.file_path) && (
                    <a key={d.id} href={url.get(d.file_path) ?? undefined} target="_blank" rel="noopener noreferrer" className="mr-3 mt-1 inline-block text-sm text-accent underline">Załącznik: {d.title}</a>
                  ))}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-sm tabular-nums">{r.cost ? pln(Number(r.cost)) : ""}</span>
                  <a href={`/garage/${id}/service/${r.id}`} className="btn-quiet !px-2 !py-1 text-xs">Edytuj</a>
                  <DeleteButton action={deleteMaintenance.bind(null, id, r.id)} what="wpis serwisowy" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
