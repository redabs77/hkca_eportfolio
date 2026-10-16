import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pending } from "@/components/ui/Pending";

export const metadata: Metadata = { title: "Progression risk" };

export default function Page() {
  return (
    <>
      <PageHeader title="Progression risk" />
      <Pending prototype="HKCA_SOT_Console_Prototype.html" binds={["domain/progression/milestoneGates.ts", "velocity risk vs assessment risk split"]} />
    </>
  );
}
