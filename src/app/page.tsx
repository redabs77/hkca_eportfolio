import Link from "next/link";
import { SURFACES } from "@/lib/roles";

const PROTOTYPES = [
  {
    href: "/prototypes/HKCA_SOT_Console_Prototype.html",
    title: "1. SOT Console (Direction B: Clinical Dense)",
    description: "Triage roster, risk indicators, logbook verification queue, rotation handshake, ITA escalation ladder.",
  },
  {
    href: "/prototypes/HKCA_Trainee_Dashboard_DirectionA.html",
    title: "2. Trainee Dashboard (Direction A: Stripe Executive)",
    description: "Curriculum progression dial, milestone gates, peer distribution bell curve, self-reflection modal flow.",
  },
  {
    href: "/prototypes/HKCA_ITA_Trainer_Form.html",
    title: "3. Trainer 15-Item ITA Form (Mobile-First Single Form)",
    description: "Official 15-item College form, College anchors, grade 4 mandatory rationale, autosaved draft.",
  },
  {
    href: "/prototypes/HKCA_ITA_Trainee_List.html",
    title: "4. Trainer Batch Entry Grid (Desktop Rapid Entry)",
    description: "Keyboard-first 15-item grid (1–4/X rate & advance) for trainers evaluating multiple trainees in batch.",
  },
  {
    href: "/prototypes/HKCA_ITA_Synthesis_Flow.html",
    title: "5. SOT ITA Synthesis & Counter-signature Flow",
    description: "Multi-trainer divergence synthesis, SOT sign-off, face-to-face counter-signature, contested BOE flow.",
  },
];

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-12">
      <header className="border-b border-line pb-6">
        <h1 className="text-[24px] font-bold tracking-tight text-ink">HKCA ePortfolio — Testing Portal</h1>
        <p className="mt-1.5 text-[14px] text-ink-2">
          Hong Kong College of Anaesthesiologists Training Portfolio replacement. Use this portal to test both the standalone design prototypes and the initial application skeleton.
        </p>
      </header>

      {/* Standalone Prototypes Section */}
      <section className="mt-10">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[16px] font-semibold text-ink">Interactive Design Prototypes (Stakeholder Review)</h2>
          <span className="text-[12px] font-medium text-ink-3">Standalone HTML</span>
        </div>
        <p className="mt-1 text-[13px] text-ink-2">
          Fully interactive single-page prototypes for workflow evaluation and rubric verification.
        </p>

        <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-bg">
          {PROTOTYPES.map((p) => (
            <li key={p.href}>
              <a
                href={p.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex items-center justify-between gap-4 p-4 transition-colors hover:bg-bg-2"
              >
                <div>
                  <span className="block text-[14px] font-semibold text-ink group-hover:text-pri">
                    {p.title} <span className="text-[12px] font-normal text-ink-3">↗</span>
                  </span>
                  <span className="mt-0.5 block text-[12px] text-ink-2">{p.description}</span>
                </div>
                <span className="rounded bg-bg-2 px-2.5 py-1 text-[11px] font-medium text-ink-2 group-hover:bg-pri-soft group-hover:text-pri">
                  Open ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* Next.js Application Skeleton Section */}
      <section className="mt-12">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[16px] font-semibold text-ink">Application Skeleton (Next.js 16 + Tailwind 4)</h2>
          <span className="text-[12px] font-medium text-ink-3">Work in progress</span>
        </div>
        <p className="mt-1 text-[13px] text-ink-2">
          Multi-role web app with unified AppShell and live domain rules engine on synthetic seed data.
        </p>

        <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-bg">
          {SURFACES.map((s) => (
            <li key={s.id}>
              <Link
                href={s.home}
                className="group flex items-center justify-between gap-4 p-4 transition-colors hover:bg-bg-2"
              >
                <div>
                  <span className="block text-[14px] font-semibold text-ink group-hover:text-pri">
                    {s.label}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-ink-2">{s.blurb}</span>
                </div>
                <span className="text-ink-3 group-hover:text-ink">→</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
