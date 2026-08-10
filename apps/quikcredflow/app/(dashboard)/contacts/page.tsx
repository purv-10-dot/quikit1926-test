import { requireUser } from "@/lib/auth/require";
import { getEffectiveMatrix } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/shared/page-header";
import { PageContainer } from "@/components/ui/container";
import { ExportButton } from "@/components/reports/export-button";
import { ContactsListClient } from "@/components/contacts/contacts-list-client";

const ADMIN_ROLE = "Administrator";

export default async function ContactsPage() {
  const user = await requireUser();
  const isAdmin = user.role === ADMIN_ROLE;
  let canCreate = isAdmin;
  let canEdit = isAdmin;
  let canDelete = isAdmin;
  if (!isAdmin) {
    const matrix = await getEffectiveMatrix(user.userId, user.orgId, user.role);
    const row = matrix.find((r) => r.module === "contacts");
    canCreate = !!row?.actions.includes("create");
    canEdit = !!row?.actions.includes("edit");
    canDelete = !!row?.actions.includes("delete");
  }

  return (
    <PageContainer size="full">
      <PageHeader
        title="Contacts"
        subtitle="Click a row to edit · Use Advanced filter for compound conditions"
        actions={<ExportButton apiPath="/api/contacts" size="md" />}
      />
      <ContactsListClient
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        isAdmin={isAdmin}
      />
    </PageContainer>
  );
}
