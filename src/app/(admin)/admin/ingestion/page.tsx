import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/PageHeader";
import { Pending } from "@/components/ui/Pending";

export const metadata: Metadata = { title: "Bulk ingestion" };

export default function Page() {
  return (
    <>
      <PageHeader title="Bulk ingestion" />
      <Pending prototype="(none yet — S1 decision)" binds={["BulkIngestionBatch (migration 2)", "dry-run docket + transactional commit"]} />
    </>
  );
}
