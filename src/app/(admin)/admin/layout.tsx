import { AppShell } from "@/components/AppShell";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AppShell surface="admin" nav={[{ href: "/admin/ingestion", label: "Bulk ingestion" }]}>{children}</AppShell>;
}
