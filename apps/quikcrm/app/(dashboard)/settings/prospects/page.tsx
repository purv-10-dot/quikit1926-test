import { getServerSession } from "next-auth";
import { requireUser } from "@/lib/auth/require";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { ProspectsTable, type ProspectRow } from "@/components/settings/prospects-table";

export const dynamic = "force-dynamic";

/**
 * Settings → Prospects
 *
 * Lists every LinkedIn profile saved to the CRM via the Chrome extension's
 * "Save to CRM" button (stored in CrmProspect by POST /api/leads/from-linkedin).
 * Org-scoped, visible to all org members. From here a prospect can be converted
 * into a CrmLead (Convert to Lead → pre-filled lead form). Server-rendered —
 * reads the org's prospects directly, newest first; the client table owns
 * selection, the convert modal, and status display.
 */
export default async function ProspectsPage() {
  const user = await requireUser();
  const session = await getServerSession(authOptions);
  const defaultOwnerId = session?.user?.id ?? "";
  const defaultOwnerName = session?.user?.name ?? session?.user?.email ?? "";

  const rows = await prisma.crmProspect.findMany({
    where: { orgId: user.orgId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      title: true,
      company: true,
      linkedinUrl: true,
      shortSummary: true,
      savedByName: true,
      status: true,
      convertedLeadId: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 500,
  });

  const prospects: ProspectRow[] = rows.map((p) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Prospects"
        subtitle="LinkedIn profiles saved to the CRM from the browser extension. Select one and convert it into a lead."
      />

      <ProspectsTable
        prospects={prospects}
        defaultOwnerId={defaultOwnerId}
        defaultOwnerName={defaultOwnerName}
      />
    </div>
  );
}
