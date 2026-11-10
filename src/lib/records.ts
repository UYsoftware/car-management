import { z } from "zod";
import { clean, num, opt, FUEL_PL } from "./vehicles";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Podaj datę");
const odo = num("Podaj przebieg").int("Podaj liczbę całkowitą").min(0, "Przebieg nie może być ujemny");
const MAINT = ["oil_change", "filters", "timing_belt", "brakes", "tires", "battery", "suspension", "inspection", "other"] as const;
const CATS = ["maintenance", "repairs", "insurance", "taxes_fees", "tires", "other"] as const;

export const maintenanceSchema = z.object({
  type: z.enum(MAINT, { errorMap: () => ({ message: "Wybierz rodzaj" }) }),
  performed_at: date, mileage: odo,
  description: opt(z.string().max(2000)), cost: opt(num("Podaj kwotę").min(0, "Kwota nie może być ujemna")),
  provider_name: opt(z.string().max(120)), notes: opt(z.string().max(4000)),
  next_service_date: opt(date), next_service_mileage: opt(odo),
});

export const fuelSchema = z.object({
  filled_at: date, mileage: odo,
  liters: num("Podaj litry").gt(0, "Litry muszą być większe od zera"),
  price_per_liter: opt(num("Podaj cenę").gt(0, "Cena musi być większa od zera")),
  total_amount: opt(num("Podaj kwotę").gt(0, "Kwota musi być większa od zera")),
  station: opt(z.string().max(120)),
  fuel_type: opt(z.enum(Object.keys(FUEL_PL) as [keyof typeof FUEL_PL])),
  full_tank: z.preprocess((v) => v === "on", z.boolean()),
});

export const expenseSchema = z.object({
  category: z.enum(CATS, { errorMap: () => ({ message: "Wybierz kategorię" }) }),
  spent_at: date, amount: num("Podaj kwotę").gt(0, "Kwota musi być większa od zera"),
  description: opt(z.string().max(500)),
});

export function parse<T extends z.ZodTypeAny>(schema: T, fd: FormData) {
  const r = schema.safeParse(Object.fromEntries([...fd].map(([k, v]) => [k, clean(v)])));
  if (r.success) return { ok: true as const, data: r.data as z.infer<T> };
  const fields: Record<string, string> = {};
  for (const [k, m] of Object.entries(r.error.flatten().fieldErrors)) fields[k] = (m as string[] | undefined)?.[0] ?? "Niepoprawna wartość";
  return { ok: false as const, fields };
}

export const reminderSchema = z.object({
  title: z.string().trim().min(1, "Podaj nazwę").max(150),
  kind: z.enum(["date", "mileage", "both"], { errorMap: () => ({ message: "Wybierz typ" }) }),
  due_date: opt(date), due_mileage: opt(odo),
  interval_months: opt(num("Podaj liczbę miesięcy").int("Podaj liczbę całkowitą").min(1, "Co najmniej 1").max(240, "Maksymalnie 240")),
  interval_km: opt(num("Podaj liczbę km").int("Podaj liczbę całkowitą").min(1, "Co najmniej 1")),
});

export const documentSchema = z.object({
  type: z.enum(["insurance", "inspection", "invoice", "purchase_contract", "registration", "other"], { errorMap: () => ({ message: "Wybierz rodzaj" }) }),
  title: opt(z.string().max(150)), expires_at: opt(date), maintenance_id: opt(z.string().uuid()),
});
