import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { listComments, addComment } from "@/lib/contacts/interactions";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };
const bodySchema = z.object({ body: z.string().trim().min(1).max(4000) });

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  try {
    return ok(await listComments(auth.context.prisma, auth.context.orgId, params.id));
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  let body: unknown = {};
  try { body = await request.json(); } catch { body = {}; }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Comment cannot be empty." });
  try {
    const row = await addComment(auth.context.prisma, auth.context.orgId, params.id, auth.context.userId, parsed.data.body);
    return ok(row, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "CREATE_FAILED", message: errorMessage(error) });
  }
}
