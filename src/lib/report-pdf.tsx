import "server-only";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Document, Page, Text, View, Font, StyleSheet } from "@react-pdf/renderer";
import { pln, km, datePl, dec, MAINTENANCE_PL, EXPENSE_PL, DOC_PL } from "./format";
import { FUEL_PL, TRANSMISSION_PL } from "./vehicles";

const dir = path.join(process.cwd(), "assets", "fonts");
Font.register({ family: "Liberation", fonts: [
  { src: path.join(dir, "LiberationSans-Regular.ttf") },
  { src: path.join(dir, "LiberationSans-Bold.ttf"), fontWeight: "bold" },
] });
Font.registerHyphenationCallback((w) => [w]);

const c = (s: unknown) => String(s ?? "").replace(/[\u00a0\u202f]/g, " ");
const SRC: Record<string, string> = { manual: "Ręcznie", fuel: "Tankowanie", service: "Serwis" };
const INK = "#14181D", MUTED = "#5B6672", LINE = "#DDE2E6", ACCENT = "#0B5C6E";

type Row = Record<string, any>;
export type ReportData = {
  premium: boolean; generated: string; vehicle: Row;
  mileage: Row[]; mileageTotal: number; maintenance: Row[]; maintenanceTotal: number; providers: Record<string, string>;
  fuel: Row[]; fuelTotal: number; documents: Row[];
  stats: { total: number; thisYear: number; costPerKm: number | null; driven: number; avgL: number | null; fuelPer100: number | null };
  byCat: [string, number][];
};

export async function loadReport(sb: SupabaseClient, id: string, premium: boolean): Promise<ReportData | null> {
  const yearStart = `${new Date().getFullYear()}-01-01`;
  const [v, ml, mt, fr, fe, mon, dc, pr, first] = await Promise.all([
    sb.from("vehicles").select("*").eq("id", id).is("archived_at", null).maybeSingle(),
    sb.from("mileage_logs").select("recorded_at,mileage,source", { count: "exact" }).eq("vehicle_id", id).order("recorded_at", { ascending: false }).order("mileage", { ascending: false }).limit(premium ? 60 : 5),
    sb.from("maintenance_records").select("performed_at,mileage,type,description,cost,provider_id", { count: "exact" }).eq("vehicle_id", id).order("performed_at", { ascending: false }).limit(premium ? 500 : 5),
    sb.from("fuel_records").select("filled_at,mileage,liters,total_amount,station", { count: "exact" }).eq("vehicle_id", id).order("filled_at", { ascending: false }).limit(premium ? 15 : 5),
    sb.from("v_fuel_efficiency").select("liters,cost,distance_km").eq("vehicle_id", id),
    sb.from("v_monthly_expenses").select("month,category,total").eq("vehicle_id", id),
    premium ? sb.from("documents").select("type,title,expires_at").eq("vehicle_id", id).order("created_at", { ascending: false }).limit(100) : Promise.resolve({ data: [] as Row[] }),
    sb.from("service_providers").select("id,name"),
    sb.from("mileage_logs").select("mileage").eq("vehicle_id", id).order("mileage").limit(1).maybeSingle(),
  ]);
  if (!v.data) return null;
  const m = mon.data ?? [];
  const total = m.reduce((s, r) => s + Number(r.total), 0);
  const cat = new Map<string, number>();
  m.forEach((r) => cat.set(r.category, (cat.get(r.category) ?? 0) + Number(r.total)));
  const e = fe.data ?? [];
  const dist = e.reduce((s, r) => s + Number(r.distance_km), 0);
  const driven = v.data.current_mileage - (first.data?.mileage ?? v.data.current_mileage);
  return {
    premium, vehicle: v.data, generated: new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date()),
    mileage: ml.data ?? [], mileageTotal: ml.count ?? 0, maintenance: mt.data ?? [], maintenanceTotal: mt.count ?? 0,
    providers: Object.fromEntries((pr.data ?? []).map((p) => [p.id, p.name])), fuel: fr.data ?? [], fuelTotal: fr.count ?? 0,
    documents: dc.data ?? [],
    stats: {
      total, thisYear: m.filter((r) => r.month >= yearStart).reduce((s, r) => s + Number(r.total), 0), driven,
      costPerKm: driven > 0 && total > 0 ? total / driven : null,
      avgL: dist > 0 ? (e.reduce((s, r) => s + Number(r.liters), 0) / dist) * 100 : null,
      fuelPer100: dist > 0 ? (e.reduce((s, r) => s + Number(r.cost), 0) / dist) * 100 : null,
    },
    byCat: [...cat].sort((a, b) => b[1] - a[1]),
  };
}

const s = StyleSheet.create({
  page: { fontFamily: "Liberation", fontSize: 9, color: INK, padding: 36, paddingBottom: 48 },
  brand: { fontSize: 8, color: ACCENT, fontWeight: "bold", letterSpacing: 1.5 },
  h1: { fontSize: 22, fontWeight: "bold", marginTop: 4 },
  sub: { color: MUTED, marginTop: 2 },
  h2: { fontSize: 12, fontWeight: "bold", marginTop: 18, marginBottom: 6, color: ACCENT },
  banner: { marginTop: 12, padding: 8, borderWidth: 1, borderColor: "#C77700", color: "#8A5200", borderRadius: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  kv: { width: "50%", flexDirection: "row", paddingVertical: 2 },
  k: { width: "40%", color: MUTED }, val: { width: "60%" },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 8 },
  statV: { fontSize: 13, fontWeight: "bold", marginTop: 2 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 3 },
  th: { fontWeight: "bold", color: MUTED, borderBottomColor: INK },
  note: { color: MUTED, fontSize: 8, marginTop: 4 },
  foot: { position: "absolute", bottom: 22, left: 36, right: 36, flexDirection: "row", justifyContent: "space-between", color: MUTED, fontSize: 7.5 },
});

type Col = { h: string; w: string; right?: boolean };
function Table({ cols, rows, empty }: { cols: Col[]; rows: string[][]; empty: string }) {
  if (!rows.length) return <Text style={{ color: MUTED }}>{empty}</Text>;
  const cell = (col: Col, t: string, i: number) => <Text key={i} style={{ width: col.w, textAlign: col.right ? "right" : "left", paddingRight: 4 }}>{c(t)}</Text>;
  return (
    <View>
      <View style={[s.tr, s.th]} fixed>{cols.map((col, i) => cell(col, col.h, i))}</View>
      {rows.map((r, i) => <View key={i} style={s.tr} wrap={false}>{r.map((t, j) => cell(cols[j], t, j))}</View>)}
    </View>
  );
}
const Stat = ({ label, value }: { label: string; value: string }) => (
  <View style={s.stat}><Text style={{ color: MUTED, fontSize: 8 }}>{label}</Text><Text style={s.statV}>{c(value)}</Text></View>
);

export function ReportDocument({ d }: { d: ReportData }) {
  const v = d.vehicle, st = d.stats;
  const kv: [string, string][] = [
    ["Marka i model", `${v.make} ${v.model}`], ["Rok produkcji", v.year ?? "—"], ["VIN", v.vin ?? "—"], ["Nr rejestracyjny", v.plate ?? "—"],
    ["Silnik", v.engine ?? "—"], ["Paliwo", v.fuel_type ? FUEL_PL[v.fuel_type as keyof typeof FUEL_PL] : "—"],
    ["Skrzynia biegów", v.transmission ? TRANSMISSION_PL[v.transmission as keyof typeof TRANSMISSION_PL] : "—"], ["Aktualny przebieg", km(v.current_mileage)],
    ["Data zakupu", v.purchase_date ? datePl(v.purchase_date) : "—"], ["Cena zakupu", v.purchase_price != null ? pln(Number(v.purchase_price)) : "—"],
  ].map(([a, b]) => [a as string, String(b)]);
  const cut = (shown: number, total: number) => (d.premium || total <= shown ? null : <Text style={s.note}>Pokazano {shown} z {total} wpisów (wersja podglądowa).</Text>);

  return (
    <Document title={`Raport — ${v.make} ${v.model}`} author="Autogaraż" language="pl">
      <Page size="A4" style={s.page}>
        <Text style={s.brand}>AUTOGARAŻ · RAPORT POJAZDU</Text>
        <Text style={s.h1}>{c(`${v.make} ${v.model}`)}</Text>
        <Text style={s.sub}>{c([v.year, v.plate].filter(Boolean).join(" · "))}{v.year || v.plate ? " · " : ""}wygenerowano {datePl(d.generated)}</Text>
        {!d.premium && <Text style={s.banner}>Wersja podglądowa (plan Free): w raporcie jest do 5 ostatnich wpisów w każdej sekcji i brak listy dokumentów. Pełny raport jest dostępny w planie Premium.</Text>}

        <Text style={s.h2}>Dane pojazdu</Text>
        <View style={s.grid}>{kv.map(([k, val]) => <View key={k} style={s.kv}><Text style={s.k}>{k}</Text><Text style={s.val}>{c(val)}</Text></View>)}</View>

        <Text style={s.h2}>Podsumowanie</Text>
        <View style={s.stats}>
          <Stat label="Wydatki łącznie" value={pln(st.total)} /><Stat label="Wydatki w tym roku" value={pln(st.thisYear)} />
          <Stat label="Koszt na km" value={st.costPerKm ? pln(st.costPerKm) : "—"} /><Stat label="Średnie spalanie" value={st.avgL ? `${dec(st.avgL)} l/100 km` : "—"} />
        </View>
        <Text style={s.note}>{st.driven > 0 ? `Koszt na km liczony na ${km(st.driven)} od pierwszego wpisu przebiegu. ` : ""}Wszystkie dane pochodzą z wpisów właściciela w aplikacji.</Text>

        <Text style={s.h2}>Historia przebiegu</Text>
        <Table empty="Brak wpisów." cols={[{ h: "Data", w: "30%" }, { h: "Przebieg", w: "35%" }, { h: "Źródło", w: "35%" }]}
          rows={d.mileage.map((r) => [datePl(r.recorded_at), km(r.mileage), SRC[r.source] ?? r.source])} />
        {cut(d.mileage.length, d.mileageTotal)}

        <Text style={s.h2}>Historia serwisowa i napraw</Text>
        <Table empty="Brak wpisów." cols={[{ h: "Data", w: "14%" }, { h: "Przebieg", w: "14%" }, { h: "Rodzaj", w: "18%" }, { h: "Opis", w: "26%" }, { h: "Warsztat", w: "16%" }, { h: "Koszt", w: "12%", right: true }]}
          rows={d.maintenance.map((r) => [datePl(r.performed_at), km(r.mileage), MAINTENANCE_PL[r.type] ?? r.type, r.description ?? "", r.provider_id ? d.providers[r.provider_id] ?? "" : "", r.cost ? pln(Number(r.cost)) : ""])} />
        {cut(d.maintenance.length, d.maintenanceTotal)}

        <Text style={s.h2}>Paliwo</Text>
        <Text style={{ marginBottom: 6 }}>{st.avgL ? `Średnie spalanie: ${dec(st.avgL)} l/100 km · koszt na 100 km: ${pln(st.fuelPer100 ?? 0)}` : "Za mało tankowań „do pełna”, by policzyć spalanie."}</Text>
        <Table empty="Brak tankowań." cols={[{ h: "Data", w: "20%" }, { h: "Przebieg", w: "20%" }, { h: "Litry", w: "15%", right: true }, { h: "Kwota", w: "20%", right: true }, { h: "Stacja", w: "25%" }]}
          rows={d.fuel.map((r) => [datePl(r.filled_at), km(r.mileage), dec(Number(r.liters), 2), pln(Number(r.total_amount)), "  " + (r.station ?? "")])} />
        {cut(d.fuel.length, d.fuelTotal)}

        <Text style={s.h2}>Wydatki według kategorii</Text>
        <Table empty="Brak wydatków." cols={[{ h: "Kategoria", w: "50%" }, { h: "Suma", w: "30%", right: true }, { h: "Udział", w: "20%", right: true }]}
          rows={d.byCat.map(([k, t]) => [EXPENSE_PL[k] ?? k, pln(t), `${Math.round((t / (st.total || 1)) * 100)}%`])} />

        {d.premium && (<>
          <Text style={s.h2}>Dokumenty</Text>
          <Table empty="Brak dokumentów." cols={[{ h: "Nazwa", w: "45%" }, { h: "Rodzaj", w: "30%" }, { h: "Ważny do", w: "25%" }]}
            rows={d.documents.map((r) => [r.title, DOC_PL[r.type] ?? r.type, r.expires_at ? datePl(r.expires_at) : "—"])} />
          <Text style={s.note}>Lista dokumentów zapisanych w aplikacji; same pliki nie są dołączane do raportu.</Text>
        </>)}

        <View style={s.foot} fixed>
          <Text>Raport sporządzony z danych wprowadzonych przez właściciela; nie stanowi certyfikatu ani wyceny.</Text>
          <Text render={({ pageNumber, totalPages }) => `Strona ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
