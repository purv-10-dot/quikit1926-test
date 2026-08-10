import { Suspense } from "react";
import { ReportsLayoutNav } from "@/components/reports/reports-layout-nav";
import { ReportsCommandShell } from "@/components/reports/reports-command-shell";
import { PageContainer } from "@/components/ui/container";
import { PageHeader } from "@/components/shared/page-header";

export default function ReportsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PageContainer size="full">
      <PageHeader
        title="Reports & Analytics"
        subtitle="Executive overview, standard reports, and a custom report builder — like Salesforce or HubSpot."
      />
      <Suspense fallback={null}>
        <ReportsCommandShell>
          <ReportsLayoutNav />
          {children}
        </ReportsCommandShell>
      </Suspense>
    </PageContainer>
  );
}
