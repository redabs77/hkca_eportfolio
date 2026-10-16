import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pending } from "@/components/ui/Pending";

export const metadata: Metadata = { title: "Dashboard" };

export default function Page() {
  return (
    <>
      <PageHeader title="Dashboard" />
      <Pending prototype="HKCA_Trainee_Dashboard_DirectionA.html" binds={["domain/progression/milestoneGates.ts", "WbaAssessment / VolumeOfPractice", "peer percentiles"]} />
    </>
  );
}
