export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Nie znaleziono strony</h1>
      <p className="mt-2 text-muted">Ta strona nie istnieje albo nie masz do niej dostępu.</p>
      <a href="/" className="btn mt-6 self-start">Wróć na pulpit</a>
    </main>
  );
}
