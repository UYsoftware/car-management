"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { FUEL_PL, TRANSMISSION_PL, type FormState } from "@/lib/vehicles";

type Vehicle = { make: string; model: string; year: number | null; vin: string | null; plate: string | null; engine: string | null;
  fuel_type: string | null; transmission: string | null; purchase_date: string | null; purchase_price: number | null };
type Action = (prev: FormState, fd: FormData) => Promise<FormState>;

export function Submit({ children }: { children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return <button className="btn" disabled={pending}>{pending ? "Zapisywanie…" : children}</button>;
}

export function Field({ label, name, error, children }: { label: string; name: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm" htmlFor={name}>{label}
      <div className="mt-1">{children}</div>
      {error && <p id={`${name}-err`} className="mt-1 text-xs text-danger">{error}</p>}
    </label>
  );
}

export function VehicleForm({ action, vehicle, submitLabel }: { action: Action; vehicle?: Vehicle; submitLabel: string }) {
  const [state, run] = useActionState(action, {} as FormState);
  const f = state.fields ?? {};
  const p = (n: string) => ({ id: n, name: n, className: "input", "aria-invalid": !!f[n], "aria-describedby": f[n] ? `${n}-err` : undefined });
  return (
    <form action={run} className="space-y-5">
      {state.error && <p role="alert" className="rounded-lg border border-danger/40 px-3 py-2 text-sm text-danger">{state.error}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Marka *" name="make" error={f.make}><input {...p("make")} required defaultValue={vehicle?.make} /></Field>
        <Field label="Model *" name="model" error={f.model}><input {...p("model")} required defaultValue={vehicle?.model} /></Field>
        <Field label="Rok produkcji" name="year" error={f.year}><input {...p("year")} inputMode="numeric" defaultValue={vehicle?.year ?? ""} /></Field>
        <Field label="Numer rejestracyjny" name="plate" error={f.plate}><input {...p("plate")} defaultValue={vehicle?.plate ?? ""} /></Field>
        <Field label="VIN" name="vin" error={f.vin}><input {...p("vin")} autoCapitalize="characters" defaultValue={vehicle?.vin ?? ""} /></Field>
        <Field label="Silnik" name="engine" error={f.engine}><input {...p("engine")} placeholder="np. 2.0 TDI 150 KM" defaultValue={vehicle?.engine ?? ""} /></Field>
        <Field label="Rodzaj paliwa" name="fuel_type" error={f.fuel_type}>
          <select {...p("fuel_type")} defaultValue={vehicle?.fuel_type ?? ""}><option value="">—</option>
            {Object.entries(FUEL_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        <Field label="Skrzynia biegów" name="transmission" error={f.transmission}>
          <select {...p("transmission")} defaultValue={vehicle?.transmission ?? ""}><option value="">—</option>
            {Object.entries(TRANSMISSION_PL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </Field>
        {!vehicle && <Field label="Aktualny przebieg (km)" name="current_mileage" error={f.current_mileage}><input {...p("current_mileage")} inputMode="numeric" /></Field>}
        <Field label="Data zakupu" name="purchase_date" error={f.purchase_date}><input {...p("purchase_date")} type="date" defaultValue={vehicle?.purchase_date ?? ""} /></Field>
        <Field label="Cena zakupu (zł)" name="purchase_price" error={f.purchase_price}><input {...p("purchase_price")} inputMode="decimal" defaultValue={vehicle?.purchase_price ?? ""} /></Field>
        <Field label="Zdjęcie (JPG, PNG lub WebP, do 5 MB)" name="photo"><input id="photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" className="input" /></Field>
      </div>
      <Submit>{submitLabel}</Submit>
    </form>
  );
}

export function MileageForm({ action, current }: { action: Action; current: number }) {
  const [state, run] = useActionState(action, {} as FormState);
  return (
    <form action={run} className="flex flex-wrap items-end gap-3">
      <label className="text-sm" htmlFor="mileage">Nowy przebieg (km)
        <input id="mileage" name="mileage" inputMode="numeric" required defaultValue={current} className="input mt-1 w-40" />
      </label>
      <Submit>Zapisz przebieg</Submit>
      {state.error && <p role="alert" className="w-full text-sm text-danger">{state.error}</p>}
    </form>
  );
}
