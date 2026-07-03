import { redirect } from "next/navigation";
import { requirePortalContext } from "@/lib/portal/context";
import type { PortalKey } from "@/lib/portal/hosts";
import { PortalShell } from "./PortalShell";
import { PortalAccessDenied } from "./PortalAccessDenied";

/**
 * Server gate used by every portal layout: resolves the portal context
 * (auth + tenant + role), redirects unauthenticated users to /login, shows an
 * access-denied screen when the user has no portal access, otherwise renders the
 * portal shell around the page.
 */
export async function PortalGate({ portal, children }: { portal: PortalKey; children: React.ReactNode }) {
  const res = await requirePortalContext(portal);
  if (!res.ok) {
    if (res.status === 401) redirect("/login");
    return <PortalAccessDenied portal={portal} message={res.message} />;
  }
  const { context } = res;
  return (
    <PortalShell session={{ portal: context.portal, role: context.role, orgId: context.orgId, companies: context.companies.map((c) => ({ orgId: c.orgId, name: c.name, role: c.role })) }}>
      {children}
    </PortalShell>
  );
}
