import { STAGE_EXIT_MONTHS, TOTAL_TRAINING_MONTHS, type Stage } from "@/lib/curriculum";

/** Accredited-time bar with BAT/HAT gate ticks (24 / 48 of 72). */
export function MonthsBar({ months, stage }: { months: number; stage: Stage }) {
  const pct = Math.min(100, (months / TOTAL_TRAINING_MONTHS) * 100);
  return (
    <div className="flex items-center gap-2">
      <div
        role="meter"
        aria-label={`Accredited time, ${stage}`}
        aria-valuemin={0}
        aria-valuemax={TOTAL_TRAINING_MONTHS}
        aria-valuenow={months}
        className="relative h-1.5 w-28 overflow-hidden rounded-full bg-bg-3"
      >
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        {(["BAT", "HAT"] as const).map((s) => (
          <span
            key={s}
            aria-hidden
            className="absolute top-0 h-full w-px bg-bg"
            style={{ left: `${(STAGE_EXIT_MONTHS[s] / TOTAL_TRAINING_MONTHS) * 100}%` }}
          />
        ))}
      </div>
      <span className="font-mono text-[11px] font-semibold tabular-nums text-ink-2">
        {months.toFixed(0)}/{TOTAL_TRAINING_MONTHS}
      </span>
    </div>
  );
}
