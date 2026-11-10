import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { VehicleTabs } from "@/components/vehicle-tabs";

export default async function VehicleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: v } = await (await createClient()).from("vehicles").select("make,model").eq("id", id).is("archived_at", null).maybeSingle();
  if (!v) notFound();
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <a href="/garage" className="btn-quiet -ml-3">Wróć do garażu</a>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{v.make} {v.model}</h1>
        </div>
        <a href={`/garage/${id}/report`} className="btn-quiet border border-line">Pobierz raport PDF</a>
      </div>
      <VehicleTabs id={id} />
      {children}
    </div>
  );
}
