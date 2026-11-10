/** Licznik w stylu zegara samochodowego — element wyróżniający karty pojazdów. */
export function Odometer({ value, digits = 6 }: { value: number; digits?: number }) {
  const s = String(Math.max(0, Math.floor(value))).padStart(digits, "0").slice(-digits);
  return (
    <div role="img" aria-label={`Przebieg: ${new Intl.NumberFormat("pl-PL").format(value)} kilometrów`} className="flex items-center gap-1">
      {[...s].map((d, i) => (
        <span key={i} aria-hidden
          className="grid h-9 w-6 place-items-center rounded-cell bg-dial font-mono text-lg font-medium text-dialink shadow-[inset_0_-10px_8px_-8px_rgb(0_0_0/.5)]">
          {d}
        </span>
      ))}
      <span aria-hidden className="ml-1.5 text-xs text-muted">km</span>
    </div>
  );
}
