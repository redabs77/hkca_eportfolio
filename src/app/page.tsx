import Link from "next/link";
import { SURFACES } from "@/lib/roles";

export default function Home() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-[22px] font-semibold tracking-tight">HKCA ePortfolio</h1>
      <p className="mt-1 text-ink-2">
        Application skeleton on synthetic data. Pick a surface — authentication is not wired yet.
      </p>
      <ul className="mt-8 divide-y divide-line border-y border-line">
        {SURFACES.map((s) => (
          <li key={s.id}>
            <Link href={s.home} className="flex items-baseline justify-between gap-6 py-3.5 hover:bg-bg-2">
              <span>
                <span className="block font-semibold">{s.label}</span>
                <span className="block text-ink-2">{s.blurb}</span>
              </span>
              <span aria-hidden className="text-ink-3">→</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
