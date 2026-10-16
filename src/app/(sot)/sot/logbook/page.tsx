import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pending } from "@/components/ui/Pending";

export const metadata: Metadata = { title: "Logbook verification" };

export default function Page() {
  return (
    <>
      <PageHeader title="Logbook verification" />
      <Pending prototype="HKCA_SOT_Console_Prototype.html" binds={["VolumeOfPractice / CaseBlock", "EchoStudy (migration 2)"]} />
    </>
  );
}
