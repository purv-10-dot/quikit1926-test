import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { DASHBOARD_TEMPLATES } from "@/lib/services/dashboard-templates";

export const POST = withAuth(async (_req: NextRequest, { orgId, userId }) => {
  try {
    const created: { id: string; name: string }[] = [];
    for (const t of DASHBOARD_TEMPLATES) {
      const existing = await prisma.dashboard.findFirst({
        where: { orgId, deletedAt: null, isPrebuilt: true, category: t.category },
      });
      if (existing) continue;
      const d = await prisma.dashboard.create({
        data: {
          orgId,
          name: t.name,
          description: t.description,
          category: t.category,
          iconName: t.iconName,
          color: t.color,
          isPrebuilt: true,
          widgets: t.widgets as never,
          isPublic: true,
          createdBy: userId,
          updatedBy: userId,
        },
      });
      created.push({ id: d.id, name: d.name });
    }
    return successResponse({ created, total: DASHBOARD_TEMPLATES.length });
  } catch (e) {
    console.error("POST /dashboards/seed-prebuilt error:", e);
    return internalError();
  }
});
