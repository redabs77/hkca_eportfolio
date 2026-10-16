import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pending } from "@/components/ui/Pending";

export const metadata: Metadata = { title: "ITAs" };

export default function Page() {
  return (
    <>
      <PageHeader title="ITAs" />
      <Pending prototype="HKCA_ITA_Synthesis_Flow.html" binds={["domain/ita/overallAssessment.ts", "domain/ita/stateMachine.ts", "ItaSession / ItaAssessorResponse"]} />
    </>
  );
}
