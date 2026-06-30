import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Audit-log activity for a quote (detail Activity Logs tab). */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;

  try {
    const rows = (await prisma.$queryRawUnsafe(
      `SELECT a.id, a.action, to_char(a.created_at,'YYYY-MM-DD HH24:MI') AS at,
              COALESCE(u.full_name, u.email) AS user_name
       FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
       WHERE a.org_id=$2::uuid AND a.entity_type='quotation' AND a.entity_id=$1::uuid
       ORDER BY a.created_at DESC`,
      params.id,
      orgId
    )) as Array<Record<string, unknown>>;
    return ok(rows);
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}
