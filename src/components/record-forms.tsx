"use client";
import { useActionState } from "react";
import { Field, Submit } from "./vehicle-forms";
import { FUEL_PL, type FormState } from "@/lib/vehicles";
import { MAINTENANCE_PL, EXPENSE_PL } from "@/lib/format";

type Action = (prev: FormState, fd: FormData) => Promise<FormState>;
const useForm = (a: Action) => {
  const [s, run] = useActionState(a, {} as FormState);
  const f = s.fields ?? {};
  const p = (n: string) => ({ id: n, name: n, className: "input", "aria-invalid": !!f[n], "aria-describedby": f[n] ? `${n}-err` : undefined });
  return { s, f, run, p };
};
const Err = ({ s }: { s: FormState }) => s.error ? <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{s.error}</p> : null;

export function MaintenanceForm({ action, today, mileage, providers, record }: { action: Action; today: string; mileage: number; providers: string[]; record?: Record<string, any> }) {
  const { s, f, run, p } = useForm(action);
  return (
    <form action={run} className="space-y-5">
      <Err s={s} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rodzaj *" name="type" error={f.type}>
          <select {...p("type")} required defaultValue={record?.type ?? ""}>
            <option value="" disabled>Wybierz…</option>
            {Object.entries(MAINTENANCE_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Data *" name="performed_at" error={f.performed_at}><input {...p("performed_at")} type="date" required defaultValue={record?.performed_at ?? today} /></Field>
        <Field label="Przebieg (km) *" name="mileage" error={f.mileage}><input {...p("mileage")} inputMode="numeric" required defaultValue={record?.mileage ?? mileage} /></Field>
        <Field label="Koszt (zł)" name="cost" error={f.cost}><input {...p("cost")} inputMode="decimal" defaultValue={record?.cost ?? ""} /></Field>
        <Field label="Warsztat" name="provider_name" error={f.provider_name}>
          <input {...p("provider_name")} list="providers" autoComplete="off" defaultValue={record?.provider_name ?? ""} />
          <datalist id="providers">{providers.map((n) => <option key={n} value={n} />)}</datalist>
        </Field>
        <Field label="Opis" name="description" error={f.description}><input {...p("description")} defaultValue={record?.description ?? ""} /></Field>
        <Field label="Następny serwis — data" name="next_service_date" error={f.next_service_date}><input {...p("next_service_date")} type="date" defaultValue={record?.next_service_date ?? ""} /></Field>
        <Field label="Następny serwis — przebieg (km)" name="next_service_mileage" error={f.next_service_mileage}><input {...p("next_service_mileage")} inputMode="numeric" defaultValue={record?.next_service_mileage ?? ""} /></Field>
      </div>
      <Field label="Notatki" name="notes" error={f.notes}><textarea {...p("notes")} rows={3} defaultValue={record?.notes ?? ""} /></Field>
      {!record && <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="create_reminder" defaultChecked className="h-4 w-4" /> Utwórz przypomnienie o następnym serwisie (jeśli podano termin)</label>}
      <Submit>{record ? "Zapisz zmiany" : "Dodaj wpis"}</Submit>
    </form>
  );
}

export function FuelForm({ action, today, mileage, record }: { action: Action; today: string; mileage: number; record?: Record<string, any> }) {
  const { s, f, run, p } = useForm(action);
  return (
    <form action={run} className="space-y-5">
      <Err s={s} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Data *" name="filled_at" error={f.filled_at}><input {...p("filled_at")} type="date" required defaultValue={record?.filled_at ?? today} /></Field>
        <Field label="Przebieg (km) *" name="mileage" error={f.mileage}><input {...p("mileage")} inputMode="numeric" required defaultValue={record?.mileage ?? mileage} /></Field>
        <Field label="Litry *" name="liters" error={f.liters}><input {...p("liters")} inputMode="decimal" required defaultValue={record?.liters ?? ""} /></Field>
        <Field label="Cena za litr (zł)" name="price_per_liter" error={f.price_per_liter}><input {...p("price_per_liter")} inputMode="decimal" defaultValue={record?.price_per_liter ?? ""} /></Field>
        <Field label="Kwota łącznie (zł)" name="total_amount" error={f.total_amount}><input {...p("total_amount")} inputMode="decimal" defaultValue={record?.total_amount ?? ""} /></Field>
        <Field label="Stacja" name="station" error={f.station}><input {...p("station")} defaultValue={record?.station ?? ""} /></Field>
        <Field label="Rodzaj paliwa" name="fuel_type" error={f.fuel_type}>
          <select {...p("fuel_type")} defaultValue={record?.fuel_type ?? ""}><option value="">—</option>
            {Object.entries(FUEL_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" name="full_tank" defaultChecked={record?.full_tank ?? true} className="h-4 w-4" /> Do pełna (potrzebne do liczenia spalania)</label>
      </div>
      <p className="text-xs text-muted">Podaj cenę za litr albo kwotę łącznie — drugą wartość policzymy.</p>
      <Submit>{record ? "Zapisz zmiany" : "Dodaj tankowanie"}</Submit>
    </form>
  );
}

export function ExpenseForm({ action, today }: { action: Action; today: string }) {
  const { s, f, run, p } = useForm(action);
  const cats = Object.entries(EXPENSE_PL).filter(([k]) => k !== "fuel");
  return (
    <form action={run} className="space-y-5">
      <Err s={s} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kategoria *" name="category" error={f.category}>
          <select {...p("category")} required defaultValue=""><option value="" disabled>Wybierz…</option>
            {cats.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Data *" name="spent_at" error={f.spent_at}><input {...p("spent_at")} type="date" required defaultValue={today} /></Field>
        <Field label="Kwota (zł) *" name="amount" error={f.amount}><input {...p("amount")} inputMode="decimal" required /></Field>
        <Field label="Opis" name="description" error={f.description}><input {...p("description")} placeholder="np. OC/AC na rok" /></Field>
      </div>
      <p className="text-xs text-muted">Paliwo i serwis dodajesz w swoich zakładkach — koszty pojawiają się tu automatycznie.</p>
      <Submit>Dodaj wydatek</Submit>
    </form>
  );
}

export function DeleteButton({ action, what }: { action: () => Promise<void>; what: string }) {
  return (
    <form action={action} onSubmit={(e) => { if (!confirm(`Usunąć ${what}? Tej operacji nie można cofnąć.`)) e.preventDefault(); }}>
      <button className="btn-quiet !px-2 !py-1 text-xs hover:!text-danger" aria-label={`Usuń ${what}`}>Usuń</button>
    </form>
  );
}
