import { z } from "zod";

export const FUEL_PL = { petrol: "Benzyna", diesel: "Diesel", lpg: "LPG", cng: "CNG", hybrid: "Hybryda",
  plug_in_hybrid: "Hybryda plug-in", electric: "Elektryczny", other: "Inne" } as const;
export const TRANSMISSION_PL = { manual: "Manualna", automatic: "Automatyczna", semi_automatic: "Zautomatyzowana",
  cvt: "CVT", dct: "Dwusprzęgłowa (DCT)" } as const;

export const clean = (v: unknown) => (typeof v === "string" ? (v.trim() === "" ? undefined : v.trim()) : v);
export const num = (msg: string) => z.coerce.number({ invalid_type_error: msg });
export const opt = <T extends z.ZodTypeAny>(t: T) => z.preprocess(clean, t.optional());

const schema = z.object({
  make: z.string().trim().min(1, "Podaj markę").max(60),
  model: z.string().trim().min(1, "Podaj model").max(80),
  year: opt(num("Podaj rok").int("Podaj rok").min(1900, "Rok od 1900").max(2100, "Rok do 2100")),
  vin: z.preprocess((v) => clean(typeof v === "string" ? v.toUpperCase() : v),
    z.string().regex(/^[A-HJ-NPR-Z0-9]{11,17}$/, "VIN: 11–17 znaków, bez liter I, O i Q").optional()),
  plate: opt(z.string().max(15, "Maksymalnie 15 znaków")),
  engine: opt(z.string().max(100)),
  fuel_type: opt(z.enum(Object.keys(FUEL_PL) as [keyof typeof FUEL_PL])),
  transmission: opt(z.enum(Object.keys(TRANSMISSION_PL) as [keyof typeof TRANSMISSION_PL])),
  current_mileage: opt(num("Podaj przebieg").int("Podaj liczbę całkowitą").min(0, "Przebieg nie może być ujemny")),
  purchase_date: opt(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Podaj datę")),
  purchase_price: opt(num("Podaj kwotę").min(0, "Kwota nie może być ujemna")),
});

export function parseVehicle(fd: FormData) {
  const r = schema.safeParse(Object.fromEntries(fd));
  if (r.success) {
    const data = Object.fromEntries(Object.entries(r.data).map(([k, v]) => [k, v ?? null])) as Record<string, string | number | null>;
    return { ok: true as const, data };
  }
  const fields: Record<string, string> = {};
  for (const [k, m] of Object.entries(r.error.flatten().fieldErrors)) fields[k] = m?.[0] ?? "Niepoprawna wartość";
  return { ok: false as const, fields };
}

export type FormState = { error?: string; fields?: Record<string, string> };
