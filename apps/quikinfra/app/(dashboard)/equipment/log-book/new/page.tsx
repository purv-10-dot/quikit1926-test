"use client";

import { useRouter } from "next/navigation";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { EquipmentLogForm } from "./EquipmentLogForm";

export default function NewEquipmentLogPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader
        onBack={() => router.push("/equipment/log-book")}
        title="New Equipment Log"
        subtitle="Daily reading — submit for PM approval"
      />

      <PageContainer className="max-w-4xl">
        <EquipmentLogForm />
      </PageContainer>
    </>
  );
}
