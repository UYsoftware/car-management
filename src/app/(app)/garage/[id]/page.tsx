import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Odometer } from "@/components/odometer";
import { VehicleForm, MileageForm } from "@/components/vehicle-forms";
import { updateVehicle, addMileage, archiveVehicle } from "../actions";

const OK: Record<string, string> = { saved: "Zapisano zmiany.", mileage: "Przebieg zaktualizowany." };

export default async function VehiclePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ok?: string; warn?: string }> }) {
  const [{ id }, { ok, warn }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sb = await createClient();
  const { data: v } = await sb.from("vehicles").select("*").eq("id", id).is("archived_at", null).maybeSingle();
  if (!v) notFound();

  let photo: string | undefined;
  if (v.photo_path) photo = (await sb.storage.from("vehicle-photos").createSignedUrl(v.photo_path, 3600)).data?.signedUrl;

  return (
    <div className="max-w-2xl space-y-10">
      {ok && OK[ok] && <p role="status" className="rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent">{OK[ok]}</p>}
      {warn === "photo" && <p role="alert" className="rounded-lg border border-warn/40 px-3 py-2 text-sm text-warn">Pojazd zapisano, ale zdjęcia nie udało się dodać. Użyj JPG, PNG lub WebP do 5 MB.</p>}
      {photo && <img src={photo} alt={`${v.make} ${v.model}`} className="aspect-[16/9] w-full rounded-card object-cover" />}

      <section aria-labelledby="mil" className="card space-y-4 p-5">
        <h2 id="mil" className="font-semibold">Przebieg</h2>
        <Odometer value={v.current_mileage} />
        <MileageForm action={addMileage.bind(null, id)} current={v.current_mileage} />
      </section>

      <section aria-labelledby="data" className="space-y-4">
        <h2 id="data" className="font-semibold">Dane pojazdu</h2>
        <VehicleForm action={updateVehicle.bind(null, id)} vehicle={v} submitLabel="Zapisz zmiany" />
      </section>

      <details className="card p-5">
        <summary className="cursor-pointer text-sm font-medium">Archiwizuj pojazd</summary>
        <p className="mt-3 text-sm text-muted">Pojazd zniknie z garażu i nie będzie liczony do limitu planu. Cała jego historia zostaje w bazie.</p>
        <form action={archiveVehicle.bind(null, id)} className="mt-4"><button className="btn !bg-danger">Archiwizuj</button></form>
      </details>
    </div>
  );
}
