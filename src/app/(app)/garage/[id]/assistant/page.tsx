import { createClient } from "@/lib/supabase/server";
import { ChatForm } from "@/components/chat-form";
import { DeleteButton } from "@/components/record-forms";
import { monthlyUsage, type Answer, type Level } from "@/lib/ai";
import { pln } from "@/lib/format";
import { sendMessage, deleteConversation } from "./actions";

export const maxDuration = 60;

const BADGE: Record<Level, { label: string; cls: string }> = {
  verified: { label: "Z Twoich danych", cls: "border-accent text-accent" },
  estimate: { label: "Szacunek", cls: "border-warn text-warn" },
  assumption: { label: "Założenie", cls: "border-dashed border-muted text-muted" },
};
const CONF = { low: "niska pewność", medium: "średnia pewność", high: "wysoka pewność" };

function AnswerView({ a }: { a: Answer }) {
  return (
    <div className="space-y-4">
      {a.safety_warning && <p role="alert" className="rounded-lg border border-danger/50 px-3 py-2 text-sm font-medium text-danger">Uwaga: {a.safety_warning}</p>}
      <p className="text-sm leading-relaxed">{a.summary}</p>
      {a.claims.length > 0 && (
        <ul className="space-y-2">
          {a.claims.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span className={`mt-0.5 shrink-0 rounded border px-1.5 py-0.5 text-xs ${BADGE[c.level].cls}`}>{BADGE[c.level].label}</span>
              <span>{c.text}{c.basis && <span className="block text-xs text-muted">Podstawa: {c.basis}</span>}</span>
            </li>
          ))}
        </ul>
      )}
      {a.cost_estimate && (
        <p className="rounded-lg border border-warn/40 px-3 py-2 text-sm"><span className="font-medium">Szacunkowy koszt: {pln(a.cost_estimate.min)} – {pln(a.cost_estimate.max)}</span> ({CONF[a.cost_estimate.confidence]}). <span className="text-muted">{a.cost_estimate.note}</span></p>
      )}
      {a.next_steps.length > 0 && (
        <div><p className="text-sm font-medium">Co dalej</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{a.next_steps.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
      )}
      {a.follow_up_question && <p className="text-sm text-muted">Pytanie doprecyzowujące: {a.follow_up_question}</p>}
    </div>
  );
}

export default async function Assistant({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string; new?: string }> }) {
  const [{ id }, { c, new: isNew }] = await Promise.all([params, searchParams]);
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const [convs, usage] = await Promise.all([
    sb.from("ai_conversations").select("id,title").eq("vehicle_id", id).order("updated_at", { ascending: false }).limit(15),
    monthlyUsage(sb, user!.id),
  ]);
  const list = convs.data ?? [];
  const cid = isNew ? null : list.find((x) => x.id === c)?.id ?? list[0]?.id ?? null;
  const msgs = cid ? (await sb.from("ai_messages").select("id,role,content,metadata").eq("conversation_id", cid).order("created_at")).data ?? [] : [];
  const left = usage.limit - usage.used;

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">W tym miesiącu zostało {Math.max(left, 0)} z {usage.limit} wiadomości.</p>
        <a href={`/garage/${id}/assistant?new=1`} className="btn-quiet border border-line">Nowa rozmowa</a>
      </div>

      {list.length > 0 && (
        <nav aria-label="Rozmowy" className="flex flex-wrap items-center gap-2 text-sm">
          {list.map((x) => (
            <a key={x.id} href={`/garage/${id}/assistant?c=${x.id}`} aria-current={x.id === cid ? "page" : undefined}
              className={`max-w-[14rem] truncate rounded-lg border px-3 py-1.5 ${x.id === cid ? "border-accent text-accent" : "border-line text-muted hover:text-ink"}`}>{x.title ?? "Rozmowa"}</a>
          ))}
        </nav>
      )}

      {msgs.length === 0 ? (
        <p className="card p-6 text-sm text-muted">Zadaj pytanie o ten samochód: serwis, objawy, kody OBD2 czy koszty. Asystent widzi historię serwisu, przypomnienia, tankowania i wydatki tego pojazdu, a każde twierdzenie oznacza jako dane z Twojego konta, szacunek albo założenie.</p>
      ) : (
        <ul className="space-y-4" aria-label="Rozmowa">
          {msgs.map((m) => m.role === "user" ? (
            <li key={m.id} className="ml-auto max-w-[85%] rounded-card bg-accent/10 px-4 py-3 text-sm">{m.content}</li>
          ) : (
            <li key={m.id} className="card p-5">
              {(m.metadata as { answer?: Answer })?.answer ? <AnswerView a={(m.metadata as { answer: Answer }).answer} /> : <p className="whitespace-pre-wrap text-sm">{m.content}</p>}
            </li>
          ))}
        </ul>
      )}

      {left > 0 ? <ChatForm key={cid ?? "new"} action={sendMessage.bind(null, id, cid ?? "")} />
        : <p role="status" className="card p-5 text-sm">Limit wiadomości na ten miesiąc został wykorzystany. {usage.premium ? "Odnowi się na początku następnego miesiąca." : "W planie Premium limit jest wyższy, a płatności pojawią się w osobnym etapie."}</p>}

      <p className="text-xs text-muted">Asystent to pomoc w zrozumieniu problemu, a nie diagnoza. Może się mylić i nie zastępuje mechanika, zwłaszcza w sprawach bezpieczeństwa jazdy.</p>
      {cid && <DeleteButton action={deleteConversation.bind(null, id, cid)} what="tę rozmowę" />}
    </div>
  );
}
