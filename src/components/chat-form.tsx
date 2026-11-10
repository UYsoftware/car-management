"use client";
import { useActionState, useRef } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/lib/vehicles";

const QUICK = ["Co niedługo będzie wymagać serwisu?", "Przeanalizuj historię serwisową tego auta.", "Wyjaśnij kod błędu P0420."];

function Send() {
  const { pending } = useFormStatus();
  return <button className="btn" disabled={pending}>{pending ? "Asystent analizuje…" : "Wyślij"}</button>;
}

export function ChatForm({ action }: { action: (p: FormState, fd: FormData) => Promise<FormState> }) {
  const [s, run] = useActionState(action, {} as FormState);
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <form action={run} className="space-y-3">
      {s.error && <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{s.error}</p>}
      <div className="flex flex-wrap gap-2" aria-label="Przykładowe pytania">
        {QUICK.map((q) => (
          <button key={q} type="button" className="btn-quiet border border-line !py-1 text-xs" onClick={() => { if (ref.current) { ref.current.value = q; ref.current.focus(); } }}>{q}</button>
        ))}
      </div>
      <label className="sr-only" htmlFor="message">Twoje pytanie</label>
      <textarea id="message" ref={ref} name="message" rows={3} maxLength={2000} required className="input"
        placeholder="np. Auto szarpie przy 2000 obr/min i świeci check engine, kod P0300" />
      <div className="flex items-center justify-between gap-3"><Send /></div>
    </form>
  );
}
