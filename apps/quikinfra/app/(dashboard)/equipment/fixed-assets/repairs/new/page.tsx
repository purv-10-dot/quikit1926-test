"use client";

import { useRouter } from "next/navigation";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { RepairForm } from "./RepairForm";

export default function OpenRepairPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader
        title="Open Repair"
        subtitle="Moves quantity into Under-Repair until closed"
        onBack={() => router.push("/equipment/fixed-assets")}
      />
      <PageContainer className="max-w-xl">
        <RepairForm />
      </PageContainer>
    </>
  );
}
