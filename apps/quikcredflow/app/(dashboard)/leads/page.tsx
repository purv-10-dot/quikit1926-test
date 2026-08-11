import { requireUser } from "@/lib/auth/require";
import { LeadsExplorer } from "@/components/leads/leads-explorer";
import { PageHeader } from "@/components/shared/page-header";
import { ExportButton } from "@/components/reports/export-button";
import { LeadCsvImportButton } from "@/components/leads/lead-csv-import-button";

/**
 * Leads list page.
 *
 * The page itself is a Server Component for the auth gate; all data is loaded
 * client-side via POST /api/leads/filter so the advanced-filter modal and
 * saved-views bar can interact with it without a full page reload.
 */
export default async function LeadsListPage() {
  await requireUser();
  return (
    <div>
      <PageHeader
        title="Leads"
        actions={
          <>
            <LeadCsvImportButton />
            <ExportButton apiPath="/api/leads" size="md" />
          </>
        }
      />
      <LeadsExplorer />
    </div>
  );
}
