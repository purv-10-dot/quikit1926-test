import { ok, fail, errorMessage } from "@/lib/api/responses";
import { prisma } from "@/lib/prisma";
import { portalRoute } from "@/lib/portal/api";
import { ROLE_LABELS } from "@/lib/portal/rbac";

export const dynamic = "force-dynamic";

/** Company/profile info for the signed-in client portal user. */
export async function GET() {
  const guard = await portalRoute("client", "view");
  if (!guard.ok) return guard.response;
  const { orgId, contactId, role, permissions } = guard.context;
  try {
    let contact: Record<string, unknown> | null = null;
    if (contactId) {
      const rows = (await prisma.$queryRaw`
        SELECT display_name, email, phone, tax_id, pan, currency, billing_address, shipping_address
        FROM contacts WHERE id = ${contactId}::uuid AND org_id = ${orgId}::uuid LIMIT 1
      `) as Array<Record<string, unknown>>;
      contact = rows[0] ?? null;
    }
    return ok({ contact, role, roleLabel: ROLE_LABELS[role] ?? role, permissions });
  } catch (error) {
    return fail(500, { code: "PROFILE_FAILED", message: errorMessage(error) });
  }
}
