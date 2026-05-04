/**
 * Single sourced opportunity — fetch / update / convert.
 *
 *   GET    /api/sourced-opportunities/[id]
 *   PATCH  /api/sourced-opportunities/[id]   — partial update
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withTenantAuth } from "@/lib/api/withTenantAuth";
import { getVCRole, denyIfNotInRoles, ANALYST_ROLES } from "@/lib/rbac";

const patchSchema = z.object({
  startupName: z.string().min(2).max(200).optional(),
  contactName: z.string().max(200).optional(),
  contactEmail: z.string().email().optional().or(z.literal("").transform(() => undefined)),
  contactPhone: z.string().max(50).optional(),
  website: z.string().max(500).optional(),
  pitch: z.string().max(2000).optional(),
  verticalId: z.string().nullable().optional(),
  status: z.enum(["new", "reviewing", "qualified", "converted", "rejected"]).optional(),
  notes: z.string().max(2000).optional(),
  fundingAskLakhs: z.number().int().nonnegative().nullable().optional(),
});

export const GET = withTenantAuth(
  async ({ orgId }, _req: NextRequest, { params }: { params: { id: string } }) => {
    const item = await db.vCSourcedOpportunity.findFirst({
      where: { id: params.id, orgId },
      include: { vertical: { select: { id: true, name: true } } },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({
      success: true,
      data: { ...item, fundingAsk: item.fundingAsk?.toString() ?? null },
    });
  },
);

export const PATCH = withTenantAuth(
  async ({ orgId, userId }, req: NextRequest, { params }: { params: { id: string } }) => {
    const denied = denyIfNotInRoles(await getVCRole(userId, orgId), ANALYST_ROLES);
    if (denied) return denied;

    const parsed = patchSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }
    const item = await db.vCSourcedOpportunity.findFirst({
      where: { id: params.id, orgId },
      select: { id: true },
    });
    if (!item) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    const data: Record<string, unknown> = { updatedBy: userId };
    if (parsed.data.startupName !== undefined) data.startupName = parsed.data.startupName;
    if (parsed.data.contactName !== undefined) data.contactName = parsed.data.contactName;
    if (parsed.data.contactEmail !== undefined) data.contactEmail = parsed.data.contactEmail;
    if (parsed.data.contactPhone !== undefined) data.contactPhone = parsed.data.contactPhone;
    if (parsed.data.website !== undefined) data.website = parsed.data.website;
    if (parsed.data.pitch !== undefined) data.pitch = parsed.data.pitch;
    if (parsed.data.verticalId !== undefined) data.verticalId = parsed.data.verticalId;
    if (parsed.data.status !== undefined) data.status = parsed.data.status;
    if (parsed.data.notes !== undefined) data.notes = parsed.data.notes;
    if (parsed.data.fundingAskLakhs !== undefined) {
      data.fundingAsk = parsed.data.fundingAskLakhs == null
        ? null
        : BigInt(parsed.data.fundingAskLakhs) * BigInt(10_000_000);
    }

    await db.vCSourcedOpportunity.update({
      where: { id: params.id },
      data,
    });
    return NextResponse.json({ success: true });
  },
);
