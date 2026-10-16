type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

const TONE: Record<Tone, string> = {
  ok: "bg-ok-bg text-ok",
  warn: "bg-warn-bg text-warn",
  bad: "bg-bad-bg text-bad",
  info: "bg-info-bg text-info",
  neutral: "bg-bg-3 text-ink-2",
};

/** Status is always text + tint (never colour alone) for WCAG 1.4.1. */
export function StatusPill({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold leading-4 ${TONE[tone]}`}>
      {children}
    </span>
  );
}
