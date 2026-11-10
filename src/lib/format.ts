export const pln = (n: number) =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(n);
export const km = (n: number) => `${new Intl.NumberFormat("pl-PL").format(n)} km`;
export const datePl = (iso: string) =>
  new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));
export const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 864e5);

export const MAINTENANCE_PL: Record<string, string> = {
  oil_change: "Wymiana oleju", filters: "Wymiana filtrów", timing_belt: "Rozrząd", brakes: "Hamulce",
  tires: "Opony", battery: "Akumulator", suspension: "Zawieszenie", inspection: "Przegląd techniczny", other: "Inne",
};

export const EXPENSE_PL: Record<string, string> = {
  fuel: "Paliwo", maintenance: "Obsługa", repairs: "Naprawy", insurance: "Ubezpieczenie",
  taxes_fees: "Podatki i opłaty", tires: "Opony", other: "Inne",
};
export const EXPENSE_COLOR: Record<string, string> = {
  fuel: "#0B8FA6", maintenance: "#6C8EAD", repairs: "#C77700", insurance: "#7A6FB0",
  taxes_fees: "#8A9A5B", tires: "#B5547A", other: "#8B97A3",
};
export const monthLabel = (iso: string) =>
  new Intl.DateTimeFormat("pl-PL", { month: "short", year: "2-digit" }).format(new Date(iso));
export const dec = (n: number, d = 1) => n.toFixed(d).replace(".", ",");

export const DOC_PL: Record<string, string> = {
  insurance: "Ubezpieczenie", inspection: "Przegląd techniczny", invoice: "Faktura",
  purchase_contract: "Umowa zakupu", registration: "Dowód rejestracyjny", other: "Inne",
};
