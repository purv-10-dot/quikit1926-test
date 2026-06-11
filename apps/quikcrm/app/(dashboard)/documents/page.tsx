import { requireUser } from "@/lib/auth/require";
import { PageContainer } from "@/components/ui/container";
import { PageHeader } from "@/components/shared/page-header";
import { DocumentsLibraryClient } from "@/components/documents/documents-library-client";

export default async function DocumentsPage() {
  await requireUser();
  return (
    <PageContainer size="wide">
      <PageHeader
        title="Documents"
        subtitle="All files uploaded across leads, accounts, opportunities, quotes, and orders."
      />
      <DocumentsLibraryClient />
    </PageContainer>
  );
}
