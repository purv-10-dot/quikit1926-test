"use client";

import { useRouter } from "next/navigation";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { ComplianceDocumentForm } from "./ComplianceDocumentForm";

export default function NewComplianceDocumentPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader
        onBack={() => router.push("/equipment/deployment")}
        title="Add Compliance Document"
        subtitle="Insurance / Fitness / Permit / PUC / Road Tax / RC — drives expiry alerts"
      />
      <PageContainer className="max-w-3xl">
        <ComplianceDocumentForm />
      </PageContainer>
    </>
  );
}
