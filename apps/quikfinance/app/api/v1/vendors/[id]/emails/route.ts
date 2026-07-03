import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { listEmails, composeAndLogEmail } from "@/lib/contacts/interactions";

export const dynamic = "force-dynamic";

type RouteContext = { params: { id: string } };
const bodySchema = z.object({
  to: z.string().trim().email().optional(),
  cc: z.string().trim().max(500).optional().nullable(),
  subject: z.string().trim().min(1).max(300),
  body: z.string().trim().min(1).max(20000)
});

export async function GET(_request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  try {
    return ok(await listEmails(auth.context.prisma, auth.context.orgId, params.id));
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  let raw: unknown = {};
  try { raw = await request.json(); } catch { raw = {}; }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Subject and body are required.", details: parsed.error.flatten() });
  try {
    const result = await composeAndLogEmail(auth.context.prisma, auth.context.orgId, params.id, auth.context.userId, parsed.data);
    if (!result.ok) return fail(result.code === "NOT_FOUND" ? 404 : 422, { code: result.code, message: result.message });
    return ok({ email: result.email, delivery: result.delivery }, undefined, { status: 201 });
  } catch (error) {
    return fail(400, { code: "SEND_FAILED", message: errorMessage(error) });
  }
}
