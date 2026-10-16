import { AppShell } from "@/components/AppShell";

const NAV = [
  { href: "/sot", label: "Roster" },
  { href: "/sot/ita", label: "ITAs" },
  { href: "/sot/logbook", label: "Logbook" },
  { href: "/sot/rotations", label: "Rotations" },
  { href: "/sot/risk", label: "Progression risk" },
];

export default function SotLayout({ children }: { children: React.ReactNode }) {
  return <AppShell surface="sot" nav={NAV}>{children}</AppShell>;
}
