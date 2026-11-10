"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parse, reminderSchema, documentSchema } from "@/lib/records";
import { today, addMonths } from "@/lib/dates";
import type { FormState } from "@/lib/vehicles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BAD: FormState = { error: "Popraw zaznaczone pola." };
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic" };

async function ctx(...ids: string[]) {
  if (ids.some((i) => !UUID.test(i))) redirect("/garage");
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  return { sb, user };
}
function done(id: string, tab: string, msg: string): never {
  revalidatePath("/", "layout");
  redirect(`/garage/${id}/${tab}?ok=${msg}&t=${Date.now()}`);
}

// Typ pliku ustalamy po zawartości, nie po nazwie ani deklarowanym MIME.
async function sniff(file: File) {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const at = (o: number, t: string) => [...t].every((c, i) => b[o + i] === c.charCodeAt(0));
  if (at(0, "%PDF")) return "application/pdf";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && at(1, "PNG")) return "image/png";
  if (at(0, "RIFF") && at(8, "WEBP")) return "image/webp";
  if (at(4, "ftyp") && ["heic", "heix", "mif1", "heif"].some((t) => at(8, t))) return "image/heic";
  return null;
}

export async function addReminder(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const { sb, user } = await ctx(id);
  const p = parse(reminderSchema, fd);
  if (!p.ok) return { ...BAD, fields: p.fields };
  const d = p.data;
  const { data: v } = await sb.from("vehicles").select("current_mileage").eq("id", id).single();
  const wantsDate = d.kind !== "mileage", wantsKm = d.kind !== "date";
  const due_date = wantsDate ? d.due_date ?? (d.interval_months ? addMonths(today(), d.interval_months) : null) : null;
  const due_mileage = wantsKm ? d.due_mileage ?? (d.interval_km && v ? v.current_mileage + d.interval_km : null) : null;
  const fields: Record<string, string> = {};
  if (wantsDate && !due_date) fields.due_date = "Podaj termin albo odstęp w miesiącach";
  if (wantsKm && !due_mileage) fields.due_mileage = "Podaj przebieg albo odstęp w km";
  if (Object.keys(fields).length) return { ...BAD, fields };
  const { error } = await sb.from("reminders").insert({
    user_id: user.id, vehicle_id: id, title: d.title, kind: d.kind, due_date, due_mileage,
    interval_months: d.interval_months ?? null, interval_km: d.interval_km ?? null,
  });
  if (error) return { error: "Nie udało się zapisać przypomnienia." };
  done(id, "reminders", "added");
}

export async function completeReminder(id: string, rid: string) {
  const { sb } = await ctx(id, rid);
  const [{ data: r }, { data: v }] = await Promise.all([
    sb.from("reminders").select("kind,interval_months,interval_km").eq("id", rid).eq("vehicle_id", id).single(),
    sb.from("vehicles").select("current_mileage").eq("id", id).single(),
  ]);
  if (!r || !v) done(id, "reminders", "missing");
  const needDate = r.kind !== "mileage", needKm = r.kind !== "date";
  const recurring = (!needDate || !!r.interval_months) && (!needKm || !!r.interval_km);
  const patch: Record<string, unknown> = { last_done_at: today(), last_notified_at: null };
  if (recurring) {
    if (needDate) patch.due_date = addMonths(today(), r.interval_months!);
    if (needKm) patch.due_mileage = v.current_mileage + r.interval_km!;
  } else patch.status = "done";
  await sb.from("reminders").update(patch).eq("id", rid).eq("vehicle_id", id);
  done(id, "reminders", recurring ? "renewed" : "completed");
}

export async function deleteReminder(id: string, rid: string) {
  const { sb } = await ctx(id, rid);
  await sb.from("reminders").delete().eq("id", rid).eq("vehicle_id", id);
  done(id, "reminders", "deleted");
}

export async function addDocument(id: string, _: FormState, fd: FormData): Promise<FormState> {
  const { sb, user } = await ctx(id);
  const p = parse(documentSchema, fd);
  if (!p.ok) return { ...BAD, fields: p.fields };
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { ...BAD, fields: { file: "Wybierz plik" } };
  if (file.size > 10 * 1024 * 1024) return { ...BAD, fields: { file: "Plik może mieć maksymalnie 10 MB" } };
  const mime = await sniff(file);
  if (!mime) return { ...BAD, fields: { file: "Dozwolone formaty: PDF, JPG, PNG, WebP, HEIC" } };

  const path = `${user.id}/${id}/${crypto.randomUUID()}.${EXT[mime]}`;
  const up = await sb.storage.from("documents").upload(path, file, { contentType: mime });
  if (up.error) return { error: "Nie udało się wysłać pliku. Spróbuj ponownie." };
  const { error } = await sb.from("documents").insert({
    user_id: user.id, vehicle_id: id, type: p.data.type, title: p.data.title ?? file.name.slice(0, 150),
    expires_at: p.data.expires_at ?? null, maintenance_id: p.data.maintenance_id ?? null,
    file_path: path, mime_type: mime, size_bytes: file.size,
  });
  if (error) { await sb.storage.from("documents").remove([path]); return { error: "Nie udało się zapisać dokumentu." }; }
  done(id, "documents", "added");
}

export async function deleteDocument(id: string, did: string) {
  const { sb } = await ctx(id, did);
  const { data: d } = await sb.from("documents").select("file_path").eq("id", did).eq("vehicle_id", id).maybeSingle();
  if (d) {
    await sb.from("documents").delete().eq("id", did);
    await sb.storage.from("documents").remove([d.file_path]);
  }
  done(id, "documents", "deleted");
}
