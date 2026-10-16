/**
 * Honest placeholder for a screen that is designed (see prototype) but not yet built.
 * Names the source prototype and the domain/schema pieces it will bind to.
 */
export function Pending({ prototype, binds }: { prototype: string; binds: string[] }) {
  return (
    <div className="m-6 max-w-2xl rounded-lg border border-dashed border-line p-5">
      <p className="text-[12px] font-semibold uppercase tracking-wider text-ink-3">Not built yet</p>
      <p className="mt-2 text-ink-2">
        Designed in <code className="font-mono text-[12px] text-ink">prototypes/{prototype}</code>. Binds to:
      </p>
      <ul className="mt-2 list-inside list-disc space-y-0.5 text-ink-2">
        {binds.map((b) => (
          <li key={b} className="font-mono text-[12px]">{b}</li>
        ))}
      </ul>
    </div>
  );
}
