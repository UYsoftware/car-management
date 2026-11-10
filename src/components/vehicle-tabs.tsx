"use client";
import { usePathname } from "next/navigation";

export function VehicleTabs({ id }: { id: string }) {
  const path = usePathname();
  const tabs = [["", "Przegląd"], ["/service", "Serwis"], ["/fuel", "Paliwo"], ["/costs", "Koszty"], ["/reminders", "Przypomnienia"], ["/documents", "Dokumenty"], ["/assistant", "Asystent AI"]];
  return (
    <nav aria-label="Sekcje pojazdu" className="-mx-5 overflow-x-auto border-b border-line px-5 md:mx-0 md:px-0">
      <ul className="flex gap-1">
        {tabs.map(([s, l]) => {
          const href = `/garage/${id}${s}`;
          const on = path === href;
          return (
            <li key={s}><a href={href} aria-current={on ? "page" : undefined}
              className={`-mb-px block whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${on ? "border-accent font-medium text-accent" : "border-transparent text-muted hover:text-ink"}`}>{l}</a></li>
          );
        })}
      </ul>
    </nav>
  );
}
