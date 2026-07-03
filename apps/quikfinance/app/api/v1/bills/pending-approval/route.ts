import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

/** Draft bills awaiting internal approval (e.g. vendor-portal submissions). */
export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = await prisma.$queryRaw`
      SELECT b.id, b.bill_number, b.total, to_char(b.issue_date,'YYYY-MM-DD') AS issue_date,
             b.vendor_reference, b.notes, c.display_name AS vendor,
             (b.notes ILIKE '%vendor portal%') AS from_portal
      FROM bills b
      JOIN contacts c ON c.id = b.contact_id
      WHERE b.org_id = ${orgId}::uuid AND b.status = 'draft'
      ORDER BY b.created_at DESC
      LIMIT 200`;
    return ok(rows);
  } catch (error) {
    return fail(500, { code: "PENDING_FAILED", message: errorMessage(error) });
  }
}
