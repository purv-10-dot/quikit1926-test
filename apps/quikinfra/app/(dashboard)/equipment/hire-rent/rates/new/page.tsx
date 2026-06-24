"use client";

import { useRouter } from "next/navigation";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { HireRateForm } from "./HireRateForm";

export default function NewHireRatePage() {
  const router = useRouter();

  return (
    <>
      <PageHeader
        title="Add Hire Rate"
        subtitle="Hire-In (vendor) rate card"
        onBack={() => router.push("/equipment/hire-rent")}
      />
      <PageContainer className="max-w-3xl">
        <HireRateForm />
      </PageContainer>
    </>
  );
}
