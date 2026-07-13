import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

const DEFAULT_MODEL = "claude-3-5-sonnet-latest";

/** Returns only whether a key is configured + a masked hint — never the raw key. */
export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`SELECT ai_api_key, ai_model FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ ai_api_key: string | null; ai_model: string | null }>;
    const key = rows[0]?.ai_api_key ?? null;
    return ok({
      configured: Boolean(key),
      masked: key ? `sk-…${key.slice(-4)}` : null,
      model: rows[0]?.ai_model ?? DEFAULT_MODEL
    });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

const schema = z.object({
  // Empty string clears the key.
  api_key: z.string().trim().max(200).optional(),
  model: z.string().trim().max(80).optional()
});

export async function PATCH(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only an owner or admin can change AI settings." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Invalid AI settings." });
  const { api_key, model } = parsed.data;

  try {
    if (api_key !== undefined) {
      const value = api_key.length > 0 ? api_key : null;
      if (value && !value.startsWith("sk-")) return fail(422, { code: "BAD_KEY", message: "An Anthropic API key should start with 'sk-'." });
      await prisma.$executeRaw`UPDATE organizations SET ai_api_key = ${value}, updated_at = now() WHERE id = ${orgId}::uuid`;
    }
    if (model !== undefined) {
      await prisma.$executeRaw`UPDATE organizations SET ai_model = ${model.length > 0 ? model : null}, updated_at = now() WHERE id = ${orgId}::uuid`;
    }
    return ok({ saved: true });
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}
