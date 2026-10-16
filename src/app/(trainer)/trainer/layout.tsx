import { AppShell } from "@/components/AppShell";

export default function TrainerLayout({ children }: { children: React.ReactNode }) {
  return <AppShell surface="trainer" nav={[{ href: "/trainer/ita", label: "ITA forms" }]}>{children}</AppShell>;
}
