"use client";
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="card max-w-lg space-y-3 p-6">
      <h1 className="font-semibold">Coś poszło nie tak</h1>
      <p className="text-sm text-muted">Nie udało się wczytać tej strony. Twoje dane są bezpieczne. Spróbuj ponownie, a jeśli problem wraca, odśwież stronę.</p>
      <button onClick={reset} className="btn">Spróbuj ponownie</button>
    </div>
  );
}
