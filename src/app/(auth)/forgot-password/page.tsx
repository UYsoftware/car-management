import { requestReset } from "../login/actions";

export default async function ForgotPassword({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const { sent } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Ustaw nowe hasło</h1>
      {sent ? (
        <p role="status" className="mt-4 rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent">
          Jeśli konto o tym adresie istnieje, wysłaliśmy na nie link do zmiany hasła.
        </p>
      ) : (
        <form action={requestReset} className="mt-6 space-y-4">
          <label className="block text-sm">Adres e-mail
            <input name="email" type="email" required autoComplete="email" className="input mt-1" />
          </label>
          <button className="btn w-full">Wyślij link</button>
        </form>
      )}
      <a href="/login" className="btn-quiet mt-4 self-start">Wróć do logowania</a>
    </main>
  );
}
