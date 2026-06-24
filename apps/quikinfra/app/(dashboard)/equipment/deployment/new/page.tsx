"use client";

import { useRouter } from "next/navigation";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { TransferForm } from "./TransferForm";

export default function NewTransferPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader
        onBack={() => router.push("/equipment/deployment")}
        title="New Equipment Transfer"
        subtitle="Generates a gate pass; destination PM acknowledges receipt"
      />

      <PageContainer className="max-w-3xl">
        <TransferForm />
      </PageContainer>
    </>
  );
}
