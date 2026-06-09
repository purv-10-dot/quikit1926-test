import { requireUser } from "@/lib/auth/require";
import { PageHeader } from "@/components/shared/page-header";
import { PageContainer } from "@/components/ui/container";
import { OpportunitiesView } from "@/components/opportunities/opportunities-view";
import { ExportButton } from "@/components/reports/export-button";

export default async function OpportunitiesPage() {
  await requireUser();
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Opportunities"
        subtitle="Pipeline + list views. Drag the grip handle on a card to change its stage."
        actions={<ExportButton apiPath="/api/opportunities" size="md" />}
      />
      <OpportunitiesView />
    </PageContainer>
  );
}
