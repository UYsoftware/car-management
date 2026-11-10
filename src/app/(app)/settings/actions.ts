"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateProfile(fd: FormData) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const name = String(fd.get("display_name") ?? "").trim();
  if (name.length > 100) redirect("/settings?error=" + encodeURIComponent("Nazwa może mieć maksymalnie 100 znaków."));
  const { error } = await sb.from("profiles").update({ display_name: name || null }).eq("id", user.id);
  if (error) redirect("/settings?error=" + encodeURIComponent("Nie udało się zapisać profilu."));
  revalidatePath("/", "layout");
  redirect("/settings?ok=profile");
}

export async function updateNotifications(fd: FormData) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { error } = await sb.from("profiles").update({ email_reminders: fd.get("email_reminders") === "on" }).eq("id", user.id);
  redirect(error ? "/settings?error=" + encodeURIComponent("Nie udało się zapisać ustawień powiadomień.") : "/settings?ok=notifications");
}
