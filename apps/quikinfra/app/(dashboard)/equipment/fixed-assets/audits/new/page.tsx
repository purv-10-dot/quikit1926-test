"use client";

import { useRouter } from "next/navigation";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { AuditForm } from "./AuditForm";

export default function NewAuditPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader
        title="Physical Audit"
        subtitle="Counted vs book quantity → variance (adjust to reconcile)"
        onBack={() => router.push("/equipment/fixed-assets")}
      />
      <PageContainer className="max-w-xl">
        <AuditForm />
      </PageContainer>
    </>
  );
}
