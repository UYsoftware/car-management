import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FuelForm } from "@/components/record-forms";
import { today } from "@/lib/dates";
import { updateFuel } from "../../actions";

export default async function EditFuel({ params }: { params: Promise<{ id: string; rid: string }> }) {
  const { id, rid } = await params;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (!uuid.test(id) || !uuid.test(rid)) notFound();
  const sb = await createClient();
  const { data } = await sb.from("fuel_records").select("*").eq("id", rid).eq("vehicle_id", id).maybeSingle();
  if (!data) notFound();
  return (
    <div className="max-w-2xl space-y-6">
      <a href={`/garage/${id}/fuel`} className="btn-quiet -ml-3">Wróć do paliwa</a>
      <h2 className="text-xl font-semibold">Edytuj tankowanie</h2>
      <FuelForm action={updateFuel.bind(null, id, rid)} today={today()} mileage={data.mileage} record={data} />
    </div>
  );
}
