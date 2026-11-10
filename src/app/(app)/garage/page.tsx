import { createClient } from "@/lib/supabase/server";
import { Odometer } from "@/components/odometer";

export default async function Garage() {
  const sb = await createClient();
  const { data: vehicles, error } = await sb.from("vehicles")
    .select("id,make,model,year,plate,current_mileage,photo_path").is("archived_at", null).order("created_at");
  if (error) return <p role="alert" className="card p-6 text-sm">Nie udało się wczytać garażu: {error.message}</p>;

  const paths = (vehicles ?? []).map((v) => v.photo_path).filter(Boolean) as string[];
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data } = await sb.storage.from("vehicle-photos").createSignedUrls(paths, 3600);
    data?.forEach((d) => d.path && d.signedUrl && urls.set(d.path, d.signedUrl));
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Garaż</h1>
        <a href="/garage/new" className="btn">Dodaj pojazd</a>
      </div>
      {(vehicles ?? []).length === 0 ? (
        <p className="card p-8 text-center text-sm text-muted">Nie masz jeszcze żadnego pojazdu. Dodaj pierwszy, aby zacząć prowadzić jego historię.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {vehicles!.map((v) => (
            <li key={v.id} className="card overflow-hidden">
              <a href={`/garage/${v.id}`} className="block">
                <div className="aspect-[16/9] bg-line">
                  {v.photo_path && urls.get(v.photo_path) && <img src={urls.get(v.photo_path)} alt={`${v.make} ${v.model}`} className="h-full w-full object-cover" />}
                </div>
                <div className="p-5">
                  <p className="font-semibold">{v.make} {v.model}</p>
                  <p className="text-sm text-muted">{[v.year, v.plate].filter(Boolean).join(" · ") || "Brak dodatkowych danych"}</p>
                  <div className="mt-4"><Odometer value={v.current_mileage} /></div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
