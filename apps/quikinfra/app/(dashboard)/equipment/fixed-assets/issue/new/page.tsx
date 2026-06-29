"use client";

import { useRouter } from "next/navigation";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { IssueAssetForm } from "./IssueAssetForm";

export default function IssueAssetPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader
        title="Issue Asset"
        subtitle="Quantity validated against available; gate pass on returnable exit"
        onBack={() => router.push("/equipment/fixed-assets")}
      />
      <PageContainer className="max-w-3xl">
        <IssueAssetForm />
      </PageContainer>
    </>
  );
}
