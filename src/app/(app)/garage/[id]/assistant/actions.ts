"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { askClaude, buildContext, flatten, monthlyUsage } from "@/lib/ai";
import type { FormState } from "@/lib/vehicles";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ERR: Record<string, string> = {
  NO_KEY: "Asystent nie jest jeszcze skonfigurowany (brak klucza ANTHROPIC_API_KEY na serwerze).",
  BUSY: "Asystent jest chwilowo przeciążony. Spróbuj za minutę.",
  TIMEOUT: "Odpowiedź trwała zbyt długo. Spróbuj ponownie, najlepiej krótszym pytaniem.",
};

export async function sendMessage(id: string, cid: string, _: FormState, fd: FormData): Promise<FormState> {
  if (!UUID.test(id) || (cid && !UUID.test(cid))) redirect("/garage");
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const text = String(fd.get("message") ?? "").trim();
  if (!text) return { error: "Napisz pytanie." };
  if (text.length > 2000) return { error: "Pytanie może mieć maksymalnie 2000 znaków." };

  const usage = await monthlyUsage(sb, user.id);
  if (usage.used >= usage.limit) return { error: `Wykorzystano limit ${usage.limit} wiadomości w tym miesiącu.` };

  let history: { role: "user" | "assistant"; content: string }[] = [];
  if (cid) {
    const { data: conv } = await sb.from("ai_conversations").select("id").eq("id", cid).eq("vehicle_id", id).maybeSingle();
    if (!conv) redirect(`/garage/${id}/assistant?new=1`);
    const { data } = await sb.from("ai_messages").select("role,content").eq("conversation_id", cid).in("role", ["user", "assistant"]).order("created_at", { ascending: false }).limit(12);
    history = (data ?? []).reverse() as typeof history;
    while (history.length && history[0].role !== "user") history.shift();
  }

  let answer;
  try {
    const context = await buildContext(sb, id);
    answer = await askClaude(context, [...history, { role: "user", content: text }]);
  } catch (e) {
    return { error: ERR[(e as Error).message] ?? "Nie udało się uzyskać odpowiedzi. Spróbuj ponownie." };
  }

  // Zapisujemy dopiero po udanej odpowiedzi — nieudane próby nie zużywają limitu.
  let convId = cid;
  if (!convId) {
    const { data, error } = await sb.from("ai_conversations").insert({ user_id: user.id, vehicle_id: id, title: text.slice(0, 60) }).select("id").single();
    if (error) return { error: "Nie udało się zapisać rozmowy." };
    convId = data.id;
  }
  const { error } = await sb.from("ai_messages").insert([
    { user_id: user.id, conversation_id: convId, role: "user", content: text },
    { user_id: user.id, conversation_id: convId, role: "assistant", content: flatten(answer), metadata: { answer } },
  ]);
  if (error) return { error: "Nie udało się zapisać odpowiedzi." };
  await sb.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", convId);
  revalidatePath(`/garage/${id}/assistant`);
  redirect(`/garage/${id}/assistant?c=${convId}`);
}

export async function deleteConversation(id: string, cid: string) {
  if (!UUID.test(id) || !UUID.test(cid)) redirect("/garage");
  const sb = await createClient();
  await sb.from("ai_conversations").delete().eq("id", cid).eq("vehicle_id", id);
  redirect(`/garage/${id}/assistant?new=1`);
}
