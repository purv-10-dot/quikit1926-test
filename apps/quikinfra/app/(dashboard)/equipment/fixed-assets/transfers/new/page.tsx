"use client";

import { useRouter } from "next/navigation";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { AssetTransferForm } from "./AssetTransferForm";

export default function NewAssetTransferPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader
        title="New Asset Transfer"
        subtitle="Generates a gate pass; destination acknowledges to relocate the asset"
        onBack={() => router.push("/equipment/fixed-assets")}
      />
      <PageContainer className="max-w-3xl">
        <AssetTransferForm />
      </PageContainer>
    </>
  );
}
