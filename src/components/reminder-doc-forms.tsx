"use client";
import { useActionState, useState } from "react";
import { Field, Submit } from "./vehicle-forms";
import { DOC_PL } from "@/lib/format";
import type { FormState } from "@/lib/vehicles";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
const useForm = (a: Action) => {
  const [s, run] = useActionState(a, {} as FormState);
  const f = s.fields ?? {};
  const p = (n: string) => ({ id: n, name: n, className: "input", "aria-invalid": !!f[n], "aria-describedby": f[n] ? `${n}-err` : undefined });
  return { s, f, run, p };
};
const Err = ({ s }: { s: FormState }) => s.error ? <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{s.error}</p> : null;

export function ReminderForm({ action }: { action: Action }) {
  const { s, f, run, p } = useForm(action);
  const [kind, setKind] = useState("date");
  return (
    <form action={run} className="space-y-5">
      <Err s={s} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nazwa *" name="title" error={f.title}><input {...p("title")} required placeholder="np. Wymiana oleju, OC" /></Field>
        <Field label="Termin wyznaczany przez *" name="kind" error={f.kind}>
          <select {...p("kind")} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="date">Datę</option><option value="mileage">Przebieg</option><option value="both">Datę i przebieg (co nastąpi pierwsze)</option>
          </select>
        </Field>
        {kind !== "mileage" && <Field label="Termin" name="due_date" error={f.due_date}><input {...p("due_date")} type="date" /></Field>}
        {kind !== "date" && <Field label="Przebieg (km)" name="due_mileage" error={f.due_mileage}><input {...p("due_mileage")} inputMode="numeric" /></Field>}
        {kind !== "mileage" && <Field label="Powtarzaj co (miesięcy)" name="interval_months" error={f.interval_months}><input {...p("interval_months")} inputMode="numeric" /></Field>}
        {kind !== "date" && <Field label="Powtarzaj co (km)" name="interval_km" error={f.interval_km}><input {...p("interval_km")} inputMode="numeric" /></Field>}
      </div>
      <p className="text-xs text-muted">Jeśli podasz odstęp, a nie podasz terminu, policzymy go od dziś. Po oznaczeniu jako wykonane przypomnienie przesunie się samo.</p>
      <Submit>Dodaj przypomnienie</Submit>
    </form>
  );
}

export function DocumentForm({ action, records }: { action: Action; records: { id: string; label: string }[] }) {
  const { s, f, run, p } = useForm(action);
  return (
    <form action={run} className="space-y-5">
      <Err s={s} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rodzaj *" name="type" error={f.type}>
          <select {...p("type")} required defaultValue=""><option value="" disabled>Wybierz…</option>
            {Object.entries(DOC_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Nazwa" name="title" error={f.title}><input {...p("title")} placeholder="domyślnie: nazwa pliku" /></Field>
        <Field label="Ważny do" name="expires_at" error={f.expires_at}><input {...p("expires_at")} type="date" /></Field>
        <Field label="Powiąż z wpisem serwisowym" name="maintenance_id" error={f.maintenance_id}>
          <select {...p("maintenance_id")} defaultValue=""><option value="">—</option>
            {records.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</select>
        </Field>
        <Field label="Plik * (PDF, JPG, PNG, WebP, HEIC — do 10 MB)" name="file" error={f.file}>
          <input {...p("file")} type="file" required accept="application/pdf,image/jpeg,image/png,image/webp,image/heic" />
        </Field>
      </div>
      <Submit>Wyślij dokument</Submit>
    </form>
  );
}
