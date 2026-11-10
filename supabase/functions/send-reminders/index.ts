// Supabase Edge Function (Deno): dzienny e-mail z przypomnieniami i wygasającymi dokumentami.
// Sekrety: CRON_SECRET, RESEND_API_KEY, RESEND_FROM (SUPABASE_URL i SERVICE_ROLE_KEY są wstrzykiwane automatycznie).
import { createClient } from "jsr:@supabase/supabase-js@2";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const day = 864e5;
const left = (iso: string) => Math.ceil((new Date(iso + "T00:00:00Z").getTime() - Date.now()) / day);

Deno.serve(async (req) => {
  if (req.headers.get("Authorization") !== `Bearer ${Deno.env.get("CRON_SECRET")}`) return new Response("unauthorized", { status: 401 });

  const [rems, vehs, docs, optOut] = await Promise.all([
    sb.from("reminders").select("id,user_id,vehicle_id,title,due_date,due_mileage,notify_days_before,notify_km_before,last_notified_at").eq("status", "active"),
    sb.from("vehicles").select("id,make,model,current_mileage").is("archived_at", null),
    sb.from("documents").select("user_id,vehicle_id,title,expires_at").not("expires_at", "is", null).gte("expires_at", new Date().toISOString().slice(0, 10)).lte("expires_at", new Date(Date.now() + 31 * day).toISOString().slice(0, 10)),
    sb.from("profiles").select("id").eq("email_reminders", false),
  ]);
  const skip = new Set((optOut.data ?? []).map((p) => p.id));
  const veh = new Map((vehs.data ?? []).map((v) => [v.id, v]));
  const lines = new Map<string, string[]>(); const touched: string[] = [];
  const push = (u: string, t: string) => lines.set(u, [...(lines.get(u) ?? []), t]);

  for (const r of rems.data ?? []) {
    const v = veh.get(r.vehicle_id); if (!v || skip.has(r.user_id)) continue;
    if (r.last_notified_at && Date.now() - new Date(r.last_notified_at).getTime() < 7 * day) continue;
    const d = r.due_date ? left(r.due_date) : null;
    const k = r.due_mileage != null ? r.due_mileage - v.current_mileage : null;
    if (!((d !== null && d <= r.notify_days_before) || (k !== null && k <= r.notify_km_before))) continue;
    const parts = [d !== null ? (d < 0 ? `termin minął ${-d} dn. temu` : `za ${d} dn.`) : "", k !== null ? (k <= 0 ? "przekroczony próg przebiegu" : `zostało ${k} km`) : ""].filter(Boolean);
    push(r.user_id, `${esc(r.title)} — ${esc(v.make + " " + v.model)}: ${parts.join(", ")}`); touched.push(r.id);
  }
  for (const d of docs.data ?? []) {
    const v = veh.get(d.vehicle_id); const n = left(d.expires_at);
    if (!v || skip.has(d.user_id) || ![30, 14, 7, 1, 0].includes(n)) continue; // bez stanu: tylko w progach
    push(d.user_id, `Dokument „${esc(d.title)}” (${esc(v.make + " " + v.model)}) wygasa ${n === 0 ? "dziś" : `za ${n} dn.`}`);
  }

  let sent = 0;
  for (const [uid, items] of lines) {
    const { data } = await sb.auth.admin.getUserById(uid);
    const to = data.user?.email; if (!to) continue;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: Deno.env.get("RESEND_FROM"), to, subject: `Autogaraż: ${items.length} ${items.length === 1 ? "sprawa wymaga" : "spraw wymaga"} uwagi`,
        html: `<p>Co wymaga Twojej uwagi:</p><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` }),
    });
    if (res.ok) sent++; else console.error("resend", res.status, await res.text());
  }
  if (touched.length && sent) await sb.from("reminders").update({ last_notified_at: new Date().toISOString() }).in("id", touched);
  return Response.json({ users: lines.size, sent });
});
