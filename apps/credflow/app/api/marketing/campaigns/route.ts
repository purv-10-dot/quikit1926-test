import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  buildCampaignConfig,
  createCampaignSchema,
  parseOptionalCampaignDate,
} from "@/lib/validators/campaign";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const items = await prisma.crmCampaign.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "campaigns", "create");
    const parsed = createCampaignSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const message =
        first.name?.[0] ??
        first.endDate?.[0] ??
        first.budget?.[0] ??
        "Invalid body";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { budget, description, startDate, endDate, config, name, status, type } = parsed.data;
    const c = await prisma.crmCampaign.create({
      data: {
        name,
        status: status ?? "Draft",
        type: type ?? null,
        startDate: parseOptionalCampaignDate(startDate),
        endDate: parseOptionalCampaignDate(endDate),
        config: buildCampaignConfig({ budget, description, config }) as Prisma.InputJsonValue | undefined,
        tenantId: user.tenantId,
      },
    });
    return NextResponse.json(c, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
