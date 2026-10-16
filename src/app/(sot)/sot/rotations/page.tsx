import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pending } from "@/components/ui/Pending";

export const metadata: Metadata = { title: "Rotations" };

export default function Page() {
  return (
    <>
      <PageHeader title="Rotations" />
      <Pending prototype="HKCA_SOT_Console_Prototype.html" binds={["Rotation", "domain/ledger/accreditedTime.ts"]} />
    </>
  );
}
