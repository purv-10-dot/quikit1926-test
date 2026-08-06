"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useParams } from "next/navigation";
import { SalaryTemplateForm } from "../_form/template-form";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";

export default function EditSalaryTemplatePage() {
  const api = useApiClient();
  const params = useParams();
  const id = params.id as string;

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "salary-templates", id],
    queryFn: () => api.get<{
      id: string;
      name: string;
      code: string;
      description: string | null;
      isDefault: boolean;
      isActive: boolean;
      components: {
        componentId: string;
        amountType: "Fixed" | "PercentOfBasic" | "PercentOfCTC" | "PercentOfGross" | "Formula";
        amountValue: string | number | null;
        component: {
          id: string; name: string; code: string; type: "Earning" | "Deduction" | "Reimbursement" | "Benefit" | "StatutoryContribution";
          category: string; amountType: "Fixed" | "PercentOfBasic" | "PercentOfCTC" | "PercentOfGross" | "Formula"; amountValue: string | number | null;
        };
      }[];
    }>(`/api/v1/hrms/payroll/salary-templates/${id}`),
  });

  if (isLoading || !data?.data) return (
    <div className="p-8 space-y-2">
      <SkeletonLine w="40%" h={16} />
      <SkeletonLine w="70%" h={12} />
      <SkeletonLine w="60%" h={12} />
    </div>
  );

  return (
    <>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <SalaryTemplateForm initial={data.data} />
    </>
  );
}
