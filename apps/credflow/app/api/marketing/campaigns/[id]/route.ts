import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { serializeCampaign } from "@/lib/services/campaigns/serialize";
import { parseOptionalCampaignDate, updateCampaignSchema } from "@/lib/validators/campaign";

export const runtime = "nodejs";

async function loadCampaign(tenantId: string, id: string) {
  return prisma.qcfCampaign.findFirst({ where: { id, tenantId } });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;

    const c = await loadCampaign(user.tenantId, id);
    if (!c) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
    return NextResponse.json(serializeCampaign(c));
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "campaigns", "edit");

    const existing = await loadCampaign(user.tenantId, id);
    if (!existing) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

    const parsed = updateCampaignSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const first = parsed.error.flatten().fieldErrors;
      const message =
        first.name?.[0] ??
        first.endDate?.[0] ??
        first.budget?.[0] ??
        "Invalid body";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const { budget, description, startDate, endDate, config, name, status, type } =
      parsed.data;

    const data: Prisma.QcfCampaignUpdateInput = {
      ...(name !== undefined ? { name } : {}),
      ...(status !== undefined ? { status } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(startDate !== undefined
        ? { startDate: parseOptionalCampaignDate(startDate) ?? null }
        : {}),
      ...(endDate !== undefined
        ? { endDate: parseOptionalCampaignDate(endDate) ?? null }
        : {}),
    };

    if (budget !== undefined || description !== undefined || config !== undefined) {
      const existingCfg =
        existing.config && typeof existing.config === "object" && !Array.isArray(existing.config)
          ? { ...(existing.config as Record<string, unknown>) }
          : {};
      const merged = { ...existingCfg, ...(config ?? {}) };
      if (budget !== undefined) {
        if (budget == null) {
          delete merged.budget;
          delete merged.budgetCurrency;
        } else {
          merged.budget = budget;
          merged.budgetCurrency = "INR";
        }
      }
      if (description !== undefined) {
        const desc = description?.trim();
        if (!desc) delete merged.description;
        else merged.description = desc;
      }
      data.config =
        Object.keys(merged).length > 0
          ? (merged as Prisma.InputJsonValue)
          : Prisma.JsonNull;
    }

    const c = await prisma.qcfCampaign.update({
      where: { id },
      data,
    });

    return NextResponse.json(serializeCampaign(c));
  } catch (e) {
    return errorResponse(e);
  }
}
