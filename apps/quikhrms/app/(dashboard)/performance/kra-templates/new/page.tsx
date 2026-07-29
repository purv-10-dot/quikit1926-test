"use client";

import { ScorecardEditor } from "../_editor";
import { PageBackground } from "@/components/hrms/page-background";

export default function NewKraTemplatePage() {
  return (
    <>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <ScorecardEditor />
    </>
  );
}
