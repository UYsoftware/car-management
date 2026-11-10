"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { parseVehicle, type FormState } from "@/lib/vehicles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const today = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date());

async function ctx(id?: string) {
  if (id && !UUID.test(id)) redirect("/garage");
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  return { sb, user };
}

function dbError(e: { code?: string; message: string }) {
  if (e.message.includes("VEHICLE_LIMIT_REACHED")) return "Osiągnięto limit pojazdów w planie Free (1). Zarchiwizuj pojazd albo przejdź na Premium.";
  if (e.code === "23505") return "Masz już pojazd z tym numerem VIN.";
  return "Nie udało się zapisać. Spróbuj ponownie.";
}

async function uploadPhoto(sb: SupabaseClient, uid: string, vid: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) return {} as { path?: string; error?: string };
  const ext = EXT[file.type];
  if (!ext) return { error: "Zdjęcie musi być w formacie JPG, PNG lub WebP." };
  if (file.size > 5 * 1024 * 1024) return { error: "Zdjęcie może mieć maksymalnie 5 MB." };
  const path = `${uid}/${vid}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from("vehicle-photos").upload(path, file, { contentType: file.type });
  return error ? { error: "Nie udało się wysłać zdjęcia." } : { path };
}

export async function createVehicle(_: FormState, fd: FormData): Promise<FormState> {
  const { sb, user } = await ctx();
  const p = parseVehicle(fd);
  if (!p.ok) return { error: "Popraw zaznaczone pola.", fields: p.fields };
  const { data, error } = await sb.from("vehicles")
    .insert({ ...p.data, current_mileage: p.data.current_mileage ?? 0, user_id: user.id }).select("id").single();
  if (error) return { error: dbError(error) };
  const ph = await uploadPhoto(sb, user.id, data.id, fd.get("photo"));
  if (ph.path) await sb.from("vehicles").update({ photo_path: ph.path }).eq("id", data.id);
  revalidatePath("/", "layout");
  redirect(`/garage/${data.id}${ph.error ? "?warn=photo" : ""}`);
}

export async function updateVehicle(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const { sb, user } = await ctx(id);
  const p = parseVehicle(fd);
  if (!p.ok) return { error: "Popraw zaznaczone pola.", fields: p.fields };
  const { current_mileage: _m, ...fields } = p.data; // przebieg zmienia się tylko przez mileage_logs
  const { data: old } = await sb.from("vehicles").select("photo_path").eq("id", id).single();
  const ph = await uploadPhoto(sb, user.id, id, fd.get("photo"));
  const { error } = await sb.from("vehicles").update({ ...fields, ...(ph.path ? { photo_path: ph.path } : {}) }).eq("id", id);
  if (error) return { error: dbError(error) };
  if (ph.path && old?.photo_path) await sb.storage.from("vehicle-photos").remove([old.photo_path]);
  revalidatePath("/", "layout");
  redirect(`/garage/${id}?${ph.error ? "warn=photo" : "ok=saved"}`);
}

export async function addMileage(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const { sb, user } = await ctx(id);
  const mileage = Number(fd.get("mileage"));
  if (!Number.isInteger(mileage) || mileage < 0) return { error: "Podaj przebieg jako liczbę całkowitą." };
  const { error } = await sb.from("mileage_logs").insert({ user_id: user.id, vehicle_id: id, mileage, recorded_at: today(), source: "manual" });
  if (error) {
    return { error: error.message.includes("MILEAGE_DECREASED") ? "Przebieg nie może być niższy niż w poprzednich wpisach." : "Nie udało się zapisać przebiegu." };
  }
  revalidatePath("/", "layout");
  redirect(`/garage/${id}?ok=mileage`);
}

export async function archiveVehicle(id: string) {
  const { sb } = await ctx(id);
  await sb.from("vehicles").update({ archived_at: new Date().toISOString() }).eq("id", id);
  revalidatePath("/", "layout");
  redirect("/garage");
}
