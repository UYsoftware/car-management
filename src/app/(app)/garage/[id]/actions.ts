"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parse, maintenanceSchema, fuelSchema, expenseSchema } from "@/lib/records";
import type { FormState } from "@/lib/vehicles";
import { MAINTENANCE_PL } from "@/lib/format";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAD: FormState = { error: "Popraw zaznaczone pola." };

async function ctx(...ids: string[]) {
  if (ids.some((i) => !UUID.test(i))) redirect("/garage");
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  return { sb, user };
}
function dbErr(m: string): FormState {
  if (m.includes("MILEAGE_DECREASED")) return { error: "Przebieg jest niższy niż we wcześniejszym wpisie z wcześniejszą datą." };
  if (m.includes("MILEAGE_EXCEEDS_LATER")) return { error: "Przebieg jest wyższy niż w późniejszym wpisie. Sprawdź datę i przebieg." };
  return { error: "Nie udało się zapisać. Spróbuj ponownie." };
}
function done(id: string, tab: string, msg: string): never {
  revalidatePath("/", "layout");
  redirect(`/garage/${id}/${tab}?ok=${msg}&t=${Date.now()}`);
}

async function providerId(sb: SupabaseClient, uid: string, name?: string) {
  if (!name) return null;
  const esc = name.replace(/[\\%_]/g, (m) => "\\" + m);
  const { data: ex } = await sb.from("service_providers").select("id").ilike("name", esc).limit(1).maybeSingle();
  if (ex) return ex.id as string;
  const { data } = await sb.from("service_providers").insert({ user_id: uid, name }).select("id").single();
  return (data?.id as string) ?? null;
}

export async function addMaintenance(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const { sb, user } = await ctx(id);
  const p = parse(maintenanceSchema, fd);
  if (!p.ok) return { ...BAD, fields: p.fields };
  const { provider_name, ...rest } = p.data;
  const { error } = await sb.from("maintenance_records")
    .insert({ ...rest, user_id: user.id, vehicle_id: id, provider_id: await providerId(sb, user.id, provider_name) });
  if (error) return dbErr(error.message);
  if (fd.get("create_reminder") === "on" && (rest.next_service_date || rest.next_service_mileage)) {
    await sb.from("reminders").insert({
      user_id: user.id, vehicle_id: id, title: MAINTENANCE_PL[rest.type],
      kind: rest.next_service_date && rest.next_service_mileage ? "both" : rest.next_service_date ? "date" : "mileage",
      due_date: rest.next_service_date ?? null, due_mileage: rest.next_service_mileage ?? null,
    });
  }
  done(id, "service", "added");
}

export async function addFuel(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const { sb, user } = await ctx(id);
  const p = parse(fuelSchema, fd);
  if (!p.ok) return { ...BAD, fields: p.fields };
  const d = p.data;
  let price = d.price_per_liter, total = d.total_amount;
  if (price == null && total == null) return { ...BAD, fields: { price_per_liter: "Podaj cenę za litr lub kwotę łącznie" } };
  if (total == null) total = Math.round(d.liters * price! * 100) / 100;
  else if (price == null) price = Math.round((total / d.liters) * 1000) / 1000;
  else if (Math.abs(total - d.liters * price) > 0.5) return { ...BAD, fields: { total_amount: "Kwota nie zgadza się z litrami × ceną" } };
  const { error } = await sb.from("fuel_records")
    .insert({ ...d, price_per_liter: price, total_amount: total, user_id: user.id, vehicle_id: id });
  if (error) return dbErr(error.message);
  done(id, "fuel", "added");
}

export async function updateMaintenance(id: string, rid: string, _: FormState, fd: FormData): Promise<FormState> {
  const { sb, user } = await ctx(id, rid);
  const p = parse(maintenanceSchema, fd);
  if (!p.ok) return { ...BAD, fields: p.fields };
  const { provider_name, ...rest } = p.data;
  const nul = (x: unknown) => x ?? null; // puste pole = wyczyszczenie wartości
  const { data, error } = await sb.from("maintenance_records").update({
    type: rest.type, performed_at: rest.performed_at, mileage: rest.mileage, description: nul(rest.description), cost: nul(rest.cost),
    notes: nul(rest.notes), next_service_date: nul(rest.next_service_date), next_service_mileage: nul(rest.next_service_mileage),
    provider_id: await providerId(sb, user.id, provider_name),
  }).eq("id", rid).eq("vehicle_id", id).select("id");
  if (error) return dbErr(error.message);
  if (!data?.length) return { error: "Nie znaleziono wpisu." };
  done(id, "service", "saved");
}

export async function updateFuel(id: string, rid: string, _: FormState, fd: FormData): Promise<FormState> {
  const { sb } = await ctx(id, rid);
  const p = parse(fuelSchema, fd);
  if (!p.ok) return { ...BAD, fields: p.fields };
  const d = p.data;
  let price = d.price_per_liter, total = d.total_amount;
  if (price == null && total == null) return { ...BAD, fields: { price_per_liter: "Podaj cenę za litr lub kwotę łącznie" } };
  if (total == null) total = Math.round(d.liters * price! * 100) / 100;
  else if (price == null) price = Math.round((total / d.liters) * 1000) / 1000;
  else if (Math.abs(total - d.liters * price) > 0.5) return { ...BAD, fields: { total_amount: "Kwota nie zgadza się z litrami × ceną" } };
  const { data, error } = await sb.from("fuel_records").update({
    filled_at: d.filled_at, mileage: d.mileage, liters: d.liters, price_per_liter: price, total_amount: total,
    station: d.station ?? null, fuel_type: d.fuel_type ?? null, full_tank: d.full_tank,
  }).eq("id", rid).eq("vehicle_id", id).select("id");
  if (error) return dbErr(error.message);
  if (!data?.length) return { error: "Nie znaleziono wpisu." };
  done(id, "fuel", "saved");
}

export async function addExpense(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const { sb, user } = await ctx(id);
  const p = parse(expenseSchema, fd);
  if (!p.ok) return { ...BAD, fields: p.fields };
  const { error } = await sb.from("expenses").insert({ ...p.data, user_id: user.id, vehicle_id: id });
  if (error) return dbErr(error.message);
  done(id, "costs", "added");
}

export async function deleteMaintenance(id: string, rid: string) {
  const { sb } = await ctx(id, rid);
  await sb.from("maintenance_records").delete().eq("id", rid).eq("vehicle_id", id);
  done(id, "service", "deleted");
}
export async function deleteFuel(id: string, rid: string) {
  const { sb } = await ctx(id, rid);
  await sb.from("fuel_records").delete().eq("id", rid).eq("vehicle_id", id);
  done(id, "fuel", "deleted");
}
export async function deleteExpense(id: string, rid: string) {
  const { sb } = await ctx(id, rid);
  await sb.from("expenses").delete().eq("id", rid).eq("vehicle_id", id).is("source_type", null); // wpisy z tankowań/serwisów usuwa się razem z ich źródłem
  done(id, "costs", "deleted");
}
