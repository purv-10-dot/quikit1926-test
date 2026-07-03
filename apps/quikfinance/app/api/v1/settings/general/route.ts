import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { MODULE_KEYS, WEEK_DAYS } from "@/lib/general-modules";

export const dynamic = "force-dynamic";

type GeneralSettings = { disabled_modules?: string[]; week_start?: string };

export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId } = auth.context;
  try {
    const rows = (await prisma.$queryRaw`SELECT general_settings FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ general_settings: GeneralSettings | null }>;
    const s = rows[0]?.general_settings ?? {};
    const disabled = Array.isArray(s.disabled_modules) ? s.disabled_modules.filter((m) => MODULE_KEYS.includes(m)) : [];
    return ok({ disabled_modules: disabled, week_start: s.week_start ?? "Sunday" });
  } catch (error) {
    return fail(500, { code: "FETCH_FAILED", message: errorMessage(error) });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins can change general settings." });

  let body: unknown;
  try { body = await request.json(); } catch { body = {}; }
  const parsed = z.object({
    disabled_modules: z.array(z.enum(MODULE_KEYS as [string, ...string[]])).optional(),
    week_start: z.enum(WEEK_DAYS as unknown as [string, ...string[]]).optional()
  }).safeParse(body);
  if (!parsed.success) return fail(422, { code: "VALIDATION_FAILED", message: "Invalid general settings.", details: parsed.error.flatten() });

  try {
    const rows = (await prisma.$queryRaw`SELECT general_settings FROM organizations WHERE id = ${orgId}::uuid LIMIT 1`) as Array<{ general_settings: GeneralSettings | null }>;
    const next: GeneralSettings = { ...(rows[0]?.general_settings ?? {}), ...parsed.data };
    await prisma.$executeRaw`UPDATE organizations SET general_settings = ${JSON.stringify(next)}::jsonb, updated_at = now() WHERE id = ${orgId}::uuid`;
    return ok(next);
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}
