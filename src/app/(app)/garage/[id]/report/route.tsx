import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { isPremium } from "@/lib/plan";
import { loadReport, ReportDocument } from "@/lib/report-pdf";

export const runtime = "nodejs";
export const maxDuration = 60;

const slug = (s: string) => s.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return new NextResponse("Nie znaleziono", { status: 404 });
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new NextResponse("Wymagane logowanie", { status: 401 });

  const data = await loadReport(sb, id, await isPremium(sb, user.id));
  if (!data) return new NextResponse("Nie znaleziono pojazdu", { status: 404 });
  try {
    const buf = await renderToBuffer(<ReportDocument d={data} />);
    return new NextResponse(new Uint8Array(buf), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="raport-${slug(`${data.vehicle.make} ${data.vehicle.model}`) || "pojazd"}-${data.generated}.pdf"`,
      "Cache-Control": "private, no-store",
    } });
  } catch (e) {
    console.error("report", e);
    return new NextResponse("Nie udało się wygenerować raportu", { status: 500 });
  }
}
