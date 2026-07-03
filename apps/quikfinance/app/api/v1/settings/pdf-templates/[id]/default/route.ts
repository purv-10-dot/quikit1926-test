import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { prisma, orgId, role } = auth.context;
  if (!["owner", "admin", "accountant"].includes(role)) return fail(403, { code: "FORBIDDEN", message: "Only admins can manage templates." });

  try {
    const rows = (await prisma.$queryRaw`SELECT module FROM pdf_templates WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid LIMIT 1`) as Array<{ module: string }>;
    if (!rows[0]) return fail(404, { code: "NOT_FOUND", message: "Template not found." });
    const module = rows[0].module;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`UPDATE pdf_templates SET is_default = false, updated_at = now() WHERE org_id = ${orgId}::uuid AND module = ${module} AND is_default = true`;
      await tx.$executeRaw`UPDATE pdf_templates SET is_default = true, updated_at = now() WHERE id = ${params.id}::uuid AND org_id = ${orgId}::uuid`;
    });
    return ok({ id: params.id, module });
  } catch (error) {
    return fail(400, { code: "UPDATE_FAILED", message: errorMessage(error) });
  }
}
