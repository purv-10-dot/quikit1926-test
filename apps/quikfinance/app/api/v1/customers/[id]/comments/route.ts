import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };

const bodySchema = z.object({ body: z.string().trim().min(1).max(4000) });

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`
      SELECT cc.id, cc.body, cc.author, to_char(cc.created_at,'YYYY-MM-DD HH24:MI') AS created_at, p.full_name AS user_name
      FROM contact_comments cc LEFT JOIN profiles p ON p.id = cc.user_id
      WHERE cc.contact_id = ${params.id}::uuid AND cc.org_id = ${orgId}::uuid
      ORDER BY cc.created_at DESC`) as unknown[];
    return ok(rows);
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, userId } = auth.context;

  let body: unknown = {};
  try { body = await request.json(); } catch { body = {}; }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Comment cannot be empty." });

  try {
    const rows = (await prisma.$queryRaw`
      INSERT INTO contact_comments (org_id, contact_id, user_id, body)
      VALUES (${orgId}::uuid, ${params.id}::uuid, ${userId ? userId : null}::uuid, ${parsed.data.body})
      RETURNING id, body, to_char(created_at,'YYYY-MM-DD HH24:MI') AS created_at`) as unknown[];
    return ok(rows[0], undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
