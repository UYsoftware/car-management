"use server";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const MSG: Record<string, string> = {
  "Invalid login credentials": "Nieprawidłowy e-mail lub hasło.",
  "User already registered": "Konto z tym adresem e-mail już istnieje.",
};
const fail = (mode: string, e: string) => redirect(`/login?mode=${mode}&error=${encodeURIComponent(MSG[e] ?? "Coś poszło nie tak. Spróbuj ponownie.")}`);

function read(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim();
  const password = String(fd.get("password") ?? "");
  return { email, password };
}

export async function signIn(fd: FormData) {
  const { email, password } = read(fd);
  if (!email || !password) return fail("login", "");
  const { error } = await (await createClient()).auth.signInWithPassword({ email, password });
  if (error) return fail("login", error.message);
  redirect("/");
}

export async function signUp(fd: FormData) {
  const { email, password } = read(fd);
  if (!email.includes("@")) return redirect("/login?mode=register&error=" + encodeURIComponent("Podaj poprawny adres e-mail."));
  if (password.length < 8) return redirect("/login?mode=register&error=" + encodeURIComponent("Hasło musi mieć co najmniej 8 znaków."));
  const { data, error } = await (await createClient()).auth.signUp({ email, password });
  if (error) return fail("register", error.message);
  if (!data.session) redirect("/login?info=" + encodeURIComponent("Sprawdź skrzynkę e-mail i potwierdź konto, potem się zaloguj."));
  redirect("/");
}

export async function signOut() {
  await (await createClient()).auth.signOut();
  redirect("/login");
}

export async function requestReset(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim();
  if (email.includes("@")) {
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    await (await createClient()).auth.resetPasswordForEmail(email, { redirectTo: `${site}/auth/callback?next=/reset-password` });
  }
  redirect("/forgot-password?sent=1"); // zawsze to samo — nie ujawniamy, czy konto istnieje
}

export async function updatePassword(fd: FormData) {
  const base = fd.get("from") === "settings" ? "/settings" : "/reset-password";
  const err = (m: string) => redirect(`${base}?error=${encodeURIComponent(m)}`);
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) return err("Hasło musi mieć co najmniej 8 znaków.");
  if (password !== String(fd.get("confirm") ?? "")) return err("Hasła nie są takie same.");
  const { error } = await (await createClient()).auth.updateUser({ password });
  if (error) return err("Nie udało się zmienić hasła. Spróbuj ponownie lub poproś o nowy link.");
  redirect(base === "/settings" ? "/settings?ok=password" : "/");
}
