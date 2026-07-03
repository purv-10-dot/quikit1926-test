import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { PortalKey } from "./hosts";
import { permissionsFor, type Permission } from "./rbac";

/**
 * Server-side portal context resolver — the portal analogue of
 * requireApiContext(). Resolves the signed-in user's access to a portal:
 * org (tenant), role, the contact they represent, and — for the CA portal —
 * the list of companies plus the currently selected one (client switcher).
 */

export type PortalCompany = { orgId: string; name: string; role: string; contactId: string | null };

export type PortalContext = {
  userId: string;
  portal: PortalKey;
  orgId: string;
  role: string;
  contactId: string | null;
  permissions: Permission[];
  companies: PortalCompany[]; // >1 only for CA (multi-company)
};

export type PortalAuthResult =
  | { ok: true; context: PortalContext }
  | { ok: false; status: number; code: string; message: string };

const COMPANY_COOKIE = (portal: PortalKey) => `qf_portal_company_${portal}`;

export async function requirePortalContext(portal: PortalKey): Promise<PortalAuthResult> {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  if (!userId) return { ok: false, status: 401, code: "UNAUTHENTICATED", message: "Sign in to continue." };

  const rows = (await prisma.$queryRaw`
    SELECT pu.org_id, pu.role, pu.contact_id, o.name AS org_name
    FROM portal_users pu
    JOIN organizations o ON o.id = pu.org_id
    WHERE pu.user_id = ${userId}::uuid AND pu.portal = ${portal} AND pu.is_active = true
    ORDER BY o.name
  `) as Array<{ org_id: string; role: string; contact_id: string | null; org_name: string }>;

  if (!rows.length) {
    return { ok: false, status: 403, code: "NO_PORTAL_ACCESS", message: `You don't have access to the ${portal} portal.` };
  }

  const companies: PortalCompany[] = rows.map((r) => ({ orgId: r.org_id, name: r.org_name, role: r.role, contactId: r.contact_id }));

  // Selected company (CA switcher) — cookie, else first.
  let selected = companies[0];
  if (companies.length > 1) {
    const cookieVal = cookies().get(COMPANY_COOKIE(portal))?.value;
    selected = companies.find((c) => c.orgId === cookieVal) ?? companies[0];
  }

  return {
    ok: true,
    context: {
      userId,
      portal,
      orgId: selected.orgId,
      role: selected.role,
      contactId: selected.contactId,
      permissions: permissionsFor(portal, selected.role),
      companies
    }
  };
}

export function portalCompanyCookieName(portal: PortalKey): string {
  return COMPANY_COOKIE(portal);
}
