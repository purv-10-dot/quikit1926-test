import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

/** Publish a draft manual journal (Zoho: Draft → Published). Posts it to the ledger. */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, db, orgId, userId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`SELECT status FROM journal_entries WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid AND source_type = 'manual' LIMIT 1`) as Array<{ status: string }>;
    if (!rows.length) return fail(404, { code: "NOT_FOUND", message: "Journal entry was not found." });
    if (rows[0].status === "posted") return fail(409, { code: "INVALID_STATE", message: "This journal is already published." });
    await prisma.$executeRaw`UPDATE journal_entries SET status = 'posted', posted_by = ${userId ? userId : null}::uuid, posted_at = now(), updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    await db.from("audit_logs").insert({ org_id: orgId, user_id: userId, entity_type: "journal_entry", entity_id: params.id, action: "publish", new_values: { status: "posted" } });
    return ok({ id: params.id, status: "posted" });
  } catch (error) {
    return fail(400, { code: "PUBLISH_FAILED", message: errorMessage(error) });
  }
}
