"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  // Section roots (e.g. /sot) match exactly; deeper routes match by prefix.
  const depth = href.split("/").filter(Boolean).length;
  const active = depth <= 1 ? path === href : path === href || path.startsWith(href + "/");
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
        active ? "bg-bg-3 text-ink" : "text-ink-2 hover:bg-bg-3 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}
