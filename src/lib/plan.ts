import type { SupabaseClient } from "@supabase/supabase-js";

export async function isPremium(sb: SupabaseClient, uid: string) {
  const { data } = await sb.from("subscriptions").select("plan,status").eq("user_id", uid).maybeSingle();
  return data?.plan === "premium" && ["active", "trialing"].includes(data.status);
}
