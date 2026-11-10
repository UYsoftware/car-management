import { updatePassword } from "@/app/(auth)/login/actions";

export function PasswordForm({ from }: { from: "settings" | "reset" }) {
  return (
    <form action={updatePassword} className="space-y-4">
      <input type="hidden" name="from" value={from} />
      <label className="block text-sm">Nowe hasło
        <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input mt-1" />
      </label>
      <label className="block text-sm">Powtórz hasło
        <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input mt-1" />
      </label>
      <button className="btn">Zapisz hasło</button>
    </form>
  );
}
