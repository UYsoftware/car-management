import { createClient } from "@/lib/supabase/server";
import { DocumentForm } from "@/components/reminder-doc-forms";
import { DeleteButton } from "@/components/record-forms";
import { DOC_PL, MAINTENANCE_PL, datePl, daysUntil } from "@/lib/format";
import { addDocument, deleteDocument } from "../actions-extra";

export default async function Documents({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; t?: string }> }) {
  const [{ id }, { ok, t }] = await Promise.all([params, searchParams]);
  const sb = await createClient();
  const [docs, recs] = await Promise.all([
    sb.from("documents").select("id,type,title,file_path,mime_type,size_bytes,expires_at,maintenance_id").eq("vehicle_id", id).order("created_at", { ascending: false }).limit(200),
    sb.from("maintenance_records").select("id,type,performed_at").eq("vehicle_id", id).order("performed_at", { ascending: false }).limit(50),
  ]);
  if (docs.error) return <p role="alert" className="card p-6 text-sm">Nie udało się wczytać dokumentów: {docs.error.message}</p>;
  const rows = docs.data ?? [];
  const signed = rows.length ? (await sb.storage.from("documents").createSignedUrls(rows.map((d) => d.file_path), 600)).data ?? [] : [];
  const url = new Map(signed.map((s) => [s.path, s.signedUrl]));
  const mb = (n: number) => `${(n / 1048576).toFixed(1).replace(".", ",")} MB`;

  return (
    <div className="max-w-2xl space-y-8">
      {ok && <p role="status" className="rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent">{ok === "deleted" ? "Dokument usunięty." : "Dokument dodany."}</p>}
      <details className="card p-5" open={rows.length === 0}>
        <summary className="cursor-pointer font-semibold">Dodaj dokument</summary>
        <div className="mt-5"><DocumentForm key={t ?? "f"} action={addDocument.bind(null, id)}
          records={(recs.data ?? []).map((r) => ({ id: r.id, label: `${datePl(r.performed_at)} — ${MAINTENANCE_PL[r.type]}` }))} /></div>
      </details>

      <section aria-labelledby="l" className="space-y-3">
        <h2 id="l" className="font-semibold">Dokumenty</h2>
        {rows.length === 0 ? (
          <p className="card p-6 text-sm text-muted">Nie masz jeszcze dokumentów. Wgraj polisę, potwierdzenie przeglądu albo fakturę — przy dokumentach z datą ważności ostrzegę Cię przed końcem terminu.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {rows.map((d) => {
              const left = d.expires_at ? daysUntil(d.expires_at) : null;
              return (
                <li key={d.id} className="flex items-start justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.title}</p>
                    <p className="text-sm text-muted">{DOC_PL[d.type]} · {d.mime_type === "application/pdf" ? "PDF" : "Zdjęcie"} · {mb(d.size_bytes)}</p>
                    {d.expires_at && <p className={`text-sm ${left! < 0 ? "text-danger" : left! <= 30 ? "text-warn" : "text-muted"}`}>
                      {left! < 0 ? "Wygasł" : "Ważny do"} {datePl(d.expires_at)}{left! >= 0 && left! <= 30 ? ` (za ${left} dn.)` : ""}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {url.get(d.file_path) && <a href={url.get(d.file_path) ?? undefined} target="_blank" rel="noopener noreferrer" className="btn-quiet !py-1 text-xs">Otwórz</a>}
                    <DeleteButton action={deleteDocument.bind(null, id, d.id)} what="dokument" />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
