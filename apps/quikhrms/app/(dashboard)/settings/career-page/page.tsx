"use client";

import { PageBackground } from "@/components/hrms/page-background";
import { CareerPageSettingsContent } from "@/components/hrms/settings/career-page-settings";

export default function CareerPageSettingsPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <CareerPageSettingsContent />
    </div>
  );
}
