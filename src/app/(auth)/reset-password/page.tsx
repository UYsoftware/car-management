import { PasswordForm } from "@/components/password-form";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nowe hasło</h1>
      {error && <p role="alert" className="mt-4 rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="mt-6"><PasswordForm from="reset" /></div>
    </main>
  );
}
