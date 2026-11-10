import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { MaintenanceForm } from "@/components/record-forms";
import { today } from "@/lib/dates";
import { updateMaintenance } from "../../actions";

export default async function EditService({ params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(id) || !uuid.test(rid)) notFound();
  const sb = await createClient();
  const [rec, prov, veh] = await Promise.all([
    sb.from("maintenance_records").select("*").eq("id", rid).eq("vehicle_id", id).maybeSingle(),
    sb.from("service_providers").select("id,name").order("name"),
    sb.from("vehicles").select("current_mileage").eq("id", id).single(),
  ]);
  if (!rec.data) notFound();
  const name = (prov.data ?? []).find((p) => p.id === rec.data.provider_id)?.name ?? "";
  return (
    <div className="max-w-2xl space-y-6">
      <a href={`/garage/${id}/service`} className="btn-quiet -ml-3">Wróć do historii serwisu</a>
      <h2 className="text-xl font-semibold">Edytuj wpis serwisowy</h2>
      <MaintenanceForm action={updateMaintenance.bind(null, id, rid)} today={today()} mileage={veh.data?.current_mileage ?? 0}
        providers={(prov.data ?? []).map((p) => p.name)} record={{ ...rec.data, provider_name: name }} />
    </div>
  );
}
