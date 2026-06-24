"use client";

import { useRouter } from "next/navigation";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { JobCardForm } from "./JobCardForm";

export default function NewJobCardPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader
        onBack={() => router.push("/equipment/maintenance")}
        title="New Maintenance Job Card"
        subtitle="Machine moves to Under Maintenance until closed"
      />

      <PageContainer className="max-w-4xl">
        <JobCardForm />
      </PageContainer>
    </>
  );
}
