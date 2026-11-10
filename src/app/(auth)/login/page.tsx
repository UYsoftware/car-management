import { signIn, signUp } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ mode?: string; error?: string; info?: string }> }) {
  const { mode, error, info } = await searchParams;
  const register = mode === "register";
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Autogaraż</h1>
      <p className="mt-2 text-muted">{register ? "Załóż konto i dodaj pierwszy samochód." : "Zaloguj się, aby zobaczyć swój garaż."}</p>
      {error && <p role="alert" className="mt-6 rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{error}</p>}
      {info && <p role="status" className="mt-6 rounded-lg border border-accent/40 px-3 py-2 text-sm text-accent">{info}</p>}
      <form action={register ? signUp : signIn} className="mt-6 space-y-4">
        <label className="block text-sm">Adres e-mail
          <input name="email" type="email" required autoComplete="email" className="input mt-1" />
        </label>
        <label className="block text-sm">Hasło
          <input name="password" type="password" required minLength={register ? 8 : undefined}
            autoComplete={register ? "new-password" : "current-password"} className="input mt-1" />
        </label>
        <button className="btn w-full">{register ? "Załóż konto" : "Zaloguj się"}</button>
      </form>
      {!register && <a href="/forgot-password" className="btn-quiet mt-1 self-start">Nie pamiętasz hasła?</a>}
      <a href={register ? "/login" : "/login?mode=register"} className="btn-quiet mt-4 self-start">
        {register ? "Mam już konto" : "Nie mam konta"}
      </a>
    </main>
  );
}
