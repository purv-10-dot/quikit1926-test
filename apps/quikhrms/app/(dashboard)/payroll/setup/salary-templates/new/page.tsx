"use client";

import { SalaryTemplateForm } from "../_form/template-form";
import { PageBackground } from "@/components/hrms/page-background";

export default function NewSalaryTemplatePage() {
  return (
    <>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <SalaryTemplateForm />
    </>
  );
}
