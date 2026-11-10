import { createClient } from "@/lib/supabase/server";
import { PasswordForm } from "@/components/password-form";
import { updateProfile, updateNotifications } from "./actions";

const OK: Record<string, string> = { notifications: "Ustawienia powiadomień zapisane.", profile: "Profil zapisany.", password: "Hasło zmienione." };

export default async function Settings({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const [{ data: profile }, { data: sub }] = await Promise.all([
    sb.from("profiles").select("display_name,email_reminders").eq("id", user!.id).maybeSingle(),
    sb.from("subscriptions").select("plan,status").maybeSingle(),
  ]);
  return (
    <div className="max-w-xl space-y-10">
      <h1 className="text-2xl font-semibold tracking-tight">Ustawienia</h1>
      {ok && OK[ok] && <p role="status" className="rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent">{OK[ok]}</p>}
      {error && <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{error}</p>}

      <section aria-labelledby="p" className="space-y-4">
        <h2 id="p" className="font-semibold">Profil</h2>
        <form action={updateProfile} className="space-y-4">
          <label className="block text-sm">Adres e-mail
            <input value={user!.email ?? ""} readOnly className="input mt-1 text-muted" />
          </label>
          <label className="block text-sm">Nazwa wyświetlana
            <input name="display_name" maxLength={100} defaultValue={profile?.display_name ?? ""} className="input mt-1" />
          </label>
          <button className="btn">Zapisz profil</button>
        </form>
      </section>

      <section aria-labelledby="n" className="space-y-4">
        <h2 id="n" className="font-semibold">Powiadomienia</h2>
        <form action={updateNotifications} className="space-y-4">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="email_reminders" defaultChecked={profile?.email_reminders ?? true} className="h-4 w-4" /> Wysyłaj e-maile o zbliżających się terminach i wygasających dokumentach</label>
          <button className="btn">Zapisz</button>
        </form>
      </section>

      <section aria-labelledby="pw" className="space-y-4">
        <h2 id="pw" className="font-semibold">Zmiana hasła</h2>
        <PasswordForm from="settings" />
      </section>

      <section aria-labelledby="plan" className="card p-5">
        <h2 id="plan" className="font-semibold">Plan</h2>
        <p className="mt-1 text-sm text-muted">Twój plan: {sub?.plan === "premium" ? "Premium" : "Free (1 pojazd)"}. Zmiana planu i płatności pojawią się w osobnym etapie.</p>
      </section>
    </div>
  );
}
