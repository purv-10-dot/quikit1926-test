import { getServerSession } from "next-auth";
import { requireUser } from "@/lib/auth/require";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { PageHeader } from "@/components/shared/page-header";
import { ProspectsTable, type ProspectRow } from "@/components/settings/prospects-table";
import { prospectScopeWhere } from "@/lib/auth/prospect-acl";
import { parseLinkedInPosts } from "@/lib/services/prospects/linkedin-posts";
import { parseLinkedInCompany } from "@/lib/services/prospects/linkedin-company";
import { parseLinkedInExperiences } from "@/lib/services/prospects/linkedin-experience";

export const dynamic = "force-dynamic";

/**
 * Settings → Prospects
 *
 * Lists LinkedIn profiles saved to the CRM via the Chrome extension's
 * "Save to CRM" button (stored in CrmProspect by POST /api/leads/from-linkedin).
 * Visibility is role-scoped by prospectScopeWhere: Administrators (incl.
 * Organization Admins) see the whole org, every other role sees only what they
 * personally saved. From here a prospect can be converted into a CrmLead
 * (Convert to Lead → pre-filled lead form). Server-rendered — reads the
 * in-scope prospects directly, newest first; the client table owns selection,
 * the convert modal, and status display.
 */
export default async function ProspectsPage() {
  const user = await requireUser();
  const session = await getServerSession(authOptions);
  const defaultOwnerId = session?.user?.id ?? "";
  const defaultOwnerName = session?.user?.name ?? session?.user?.email ?? "";

  const rows = await prisma.crmProspect.findMany({
    where: prospectScopeWhere(user),
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      title: true,
      company: true,
      linkedinUrl: true,
      shortSummary: true,
      // Recent LinkedIn activity captured by the extension. Raw scraped JSON —
      // normalized via parseLinkedInPosts below before it reaches the client.
      posts: true,
      // Full company record captured by the extension's company scraper. Raw
      // scraped JSON — normalized via parseLinkedInCompany below so the client
      // only receives a typed, render-safe object.
      companyData: true,
      // Work history captured by the profile scraper. Raw scraped JSON —
      // normalized via parseLinkedInExperiences below so the client only
      // receives a typed, render-safe list.
      experiences: true,
      savedByName: true,
      status: true,
      convertedLeadId: true,
      createdAt: true,
      icpId: true,
      // Reference only — we read the ICP's name for display rather than storing
      // a copy on the prospect. `isActive` lets the table flag a prospect tagged
      // with an ICP that has since been deactivated.
      icp: { select: { id: true, name: true, isActive: true } },
      // Origin Upwork job, when this prospect came from "Convert to Prospect".
      // Reference only: the id drives a link back to the Upwork record, and the
      // job keeps all of its own fields. Null for every other prospect.
      upworkJobId: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 500,
  });

  // Normalize the untrusted `posts` blob server-side so the client only ever
  // receives a typed, render-safe list (and malformed scrapes can't break the UI).
  const prospects: ProspectRow[] = rows.map(({ posts, companyData, experiences, ...p }) => ({
    ...p,
    createdAt: p.createdAt.toISOString(),
    posts: parseLinkedInPosts(posts),
    companyDetails: parseLinkedInCompany(companyData),
    experiences: parseLinkedInExperiences(experiences),
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
