import Link from "next/link";
import { NavLink } from "./NavLink";
import { SURFACES, type Surface } from "@/lib/roles";

export interface NavItem { href: string; label: string }

export function AppShell({
  surface, nav, children,
}: { surface: Surface; nav: NavItem[]; children: React.ReactNode }) {
  const current = SURFACES.find((s) => s.id === surface)!;
  return (
    <div className="grid min-h-dvh grid-cols-[216px_1fr]">
      <aside className="flex flex-col border-r border-line bg-bg-2" aria-label="Primary">
        <Link href="/" className="px-4 pb-3 pt-5">
          <span className="block text-[13px] font-bold tracking-tight">HKCA ePortfolio</span>
          <span className="block text-[11px] text-ink-3">{current.label}</span>
        </Link>
        <nav className="flex flex-col gap-0.5 px-2" aria-label={`${current.label} sections`}>
          {nav.map((n) => (
            <NavLink key={n.href} href={n.href}>{n.label}</NavLink>
          ))}
        </nav>
        <div className="mt-auto border-t border-line px-4 py-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-3">Switch surface</p>
          <ul className="space-y-1">
            {SURFACES.filter((s) => s.id !== surface).map((s) => (
              <li key={s.id}><Link href={s.home} className="text-ink-2 hover:text-ink">{s.label}</Link></li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-snug text-ink-3">Synthetic data only. No authentication in this build.</p>
        </div>
      </aside>
      <main className="min-w-0">{children}</main>
    </div>
  );
}
