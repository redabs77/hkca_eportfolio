import type { Metadata } from "next";
import Link from "next/link";
import { repo } from "@/lib/data/seed";
import { STAGE_ORDER, type Stage } from "@/lib/curriculum";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusPill } from "@/components/ui/StatusPill";
import { MonthsBar } from "@/components/ui/MonthsBar";

export const metadata: Metadata = { title: "Roster" };

const ITA_LABEL: Record<string, { text: string; tone: "ok" | "warn" | "bad" | "info" | "neutral" }> = {
  SOT_SYNTHESIS: { text: "Awaiting SOT synthesis", tone: "warn" },
  AWAITING_TRAINEE_SIGNATURE: { text: "Awaiting trainee signature", tone: "info" },
  CONTESTED: { text: "Contested", tone: "bad" },
  PENDING_BOE_REVIEW: { text: "With BOE", tone: "bad" },
};

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ stage?: string }> }) {
  const { stage } = await searchParams;
  const active = STAGE_ORDER.find((s) => s === stage) as Stage | undefined;
  const all = await repo.listTrainees();
  const rows = active ? all.filter((r) => r.stage === active) : all;
  const count = (s: Stage) => all.filter((r) => r.stage === s).length;

  return (
    <>
      <PageHeader
        title="Roster"
        sub={`${rows.length} of ${all.length} trainees`}
        actions={
          <nav aria-label="Filter by stage" className="flex gap-1 rounded-lg bg-bg-3 p-0.5">
            {[undefined, ...STAGE_ORDER].map((s) => {
              const on = s === active;
              return (
                <Link
                  key={s ?? "all"}
                  href={s ? `/sot?stage=${s}` : "/sot"}
                  aria-current={on ? "true" : undefined}
                  className={`rounded-md px-3 py-1 text-[12.5px] font-semibold ${on ? "bg-raised text-ink shadow-card" : "text-ink-2 hover:text-ink"}`}
                >
                  {s ?? "All"} <span className="font-mono text-[11px] text-ink-3">{s ? count(s) : all.length}</span>
                </Link>
              );
            })}
          </nav>
        }
      />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <caption className="sr-only">Trainee roster with accredited time, assessment status and next progression gate</caption>
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wider text-ink-3">
              {["Trainee", "Stage", "Accredited time", "VOP", "WBA", "ITA", "Next gate"].map((h) => (
                <th key={h} scope="col" className="px-6 py-2.5 font-semibold first:pl-6">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ita = r.itaStatus ? (ITA_LABEL[r.itaStatus] ?? { text: r.itaStatus, tone: "neutral" as const }) : null;
              return (
                <tr key={r.id} className="border-b border-line-sub hover:bg-bg-2">
                  <th scope="row" className="px-6 py-2.5 font-medium">
                    {r.name}
                    <span className="block font-mono text-[11px] font-normal text-ink-3">{r.hkcaNumber} · {r.hospital}</span>
                  </th>
                  <td className="px-6 py-2.5"><StatusPill>{r.stage}</StatusPill></td>
                  <td className="px-6 py-2.5"><MonthsBar months={r.accreditedMonths} stage={r.stage} /></td>
                  <td className="px-6 py-2.5 font-mono tabular-nums text-ink-2">{r.vopCases}</td>
                  <td className="px-6 py-2.5 font-mono tabular-nums text-ink-2">{r.wbaCount}</td>
                  <td className="px-6 py-2.5">{ita ? <StatusPill tone={ita.tone}>{ita.text}</StatusPill> : <span className="text-ink-3">—</span>}</td>
                  <td className="px-6 py-2.5">
                    <span className="text-ink-2">{r.nextGateLabel}</span>
                    <span className="block text-[11px] text-ink-3">
                      {r.nextGateBlockers.length === 0 ? "Eligible" : `${r.nextGateBlockers.length} blocker${r.nextGateBlockers.length > 1 ? "s" : ""}`}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
