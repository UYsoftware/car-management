"use client";
import { usePathname } from "next/navigation";
import { signOut } from "@/app/(auth)/login/actions";

// Każdy kolejny etap dopisuje tu swoje pozycje. Pokazujemy tylko to, co działa.
const ITEMS = [{ href: "/", label: "Pulpit" }, { href: "/garage", label: "Garaż" }, { href: "/analytics", label: "Analityka" }, { href: "/settings", label: "Ustawienia" }];

export function Nav({ email }: { email: string }) {
  const path = usePathname();
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface p-5 md:flex">
        <span className="text-lg font-semibold tracking-tight">Autogaraż</span>
        <nav aria-label="Główna" className="mt-8 flex flex-col gap-1">
          {ITEMS.map((i) => (
            <a key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-sm ${active(i.href) ? "bg-accent/10 font-medium text-accent" : "text-muted hover:bg-line/50 hover:text-ink"}`}>{i.label}</a>
          ))}
        </nav>
        <div className="mt-auto">
          <p className="truncate text-xs text-muted">{email}</p>
          <form action={signOut}><button className="btn-quiet -ml-3 mt-1">Wyloguj się</button></form>
        </div>
      </aside>
      <nav aria-label="Główna" className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-around border-t border-line bg-surface px-2 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] md:hidden">
        {ITEMS.map((i) => (
          <a key={i.href} href={i.href} aria-current={active(i.href) ? "page" : undefined}
            className={`px-3 py-3 text-sm ${active(i.href) ? "font-medium text-accent" : "text-muted"}`}>{i.label}</a>
        ))}
      </nav>
    </>
  );
}
