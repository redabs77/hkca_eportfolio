import { AppShell } from "@/components/AppShell";

export default function TraineeLayout({ children }: { children: React.ReactNode }) {
  return <AppShell surface="trainee" nav={[{ href: "/trainee", label: "Dashboard" }]}>{children}</AppShell>;
}
