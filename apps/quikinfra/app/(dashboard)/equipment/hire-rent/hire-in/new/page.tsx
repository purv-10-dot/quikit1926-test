"use client";

import { useRouter } from "next/navigation";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { HireInForm } from "./HireInForm";

export default function NewHireInVerificationPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader
        title="Hire-In Verification"
        subtitle="Logged qty (approved logs) vs vendor-claimed → variance → payable"
        onBack={() => router.push("/equipment/hire-rent")}
      />
      <PageContainer className="max-w-3xl">
        <HireInForm />
      </PageContainer>
    </>
  );
}
