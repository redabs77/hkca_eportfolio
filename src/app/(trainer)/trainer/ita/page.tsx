import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pending } from "@/components/ui/Pending";

export const metadata: Metadata = { title: "ITA — trainer form" };

export default function Page() {
  return (
    <>
      <PageHeader title="ITA — trainer form" />
      <Pending prototype="HKCA_ITA_Trainer_Form.html" binds={["domain/ita/itaDomains.ts (15 items)", "ItaAssessorResponse (sealed, SHA-256)"]} />
    </>
  );
}
