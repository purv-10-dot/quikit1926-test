"use client";

import { useRouter } from "next/navigation";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { RentOutForm } from "./RentOutForm";

export default function NewRentOutBillPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader
        title="New Rent-Out Bill"
        subtitle="Billable qty from approved logs · GST via customer-state comparison"
        onBack={() => router.push("/equipment/hire-rent")}
      />
      <PageContainer className="max-w-3xl">
        <RentOutForm />
      </PageContainer>
    </>
  );
}
