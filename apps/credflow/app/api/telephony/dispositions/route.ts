import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";

export const runtime = "nodejs";

const createSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  category: z.string().optional().nullable(),
  triggersPaymentVerification: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});

// Default disposition set seeded the first time a tenant's list is empty so
// the Lead → Call disposition modal has something to show without a manual
// admin step. Mirrors the legacy SMB-outreach top-level values plus the
// well-known names that the createCallLog stage-mapping switch keys off
// ("Demo Scheduled", "Not Connected", "Discussion Pending", "Payment Done").
const DEFAULT_DISPOSITIONS: Array<{
  code: string;
  label: string;
  name: string;
  category?: string;
  triggersPaymentVerification?: boolean;
  smbDispositionValue?: string;
  targetLeadStage?: string;
}> = [
  { code: "interested", label: "Interested", name: "Interested", smbDispositionValue: "Interested" },
  { code: "not_interested", label: "Not Interested", name: "Not Interested", smbDispositionValue: "Not Interested" },
  { code: "not_reachable", label: "Not Reachable", name: "Not Reachable", smbDispositionValue: "Not Reachable" },
  { code: "callback_requested", label: "Callback Requested", name: "Callback Requested", smbDispositionValue: "Callback Requested" },
  { code: "demo_scheduled", label: "Demo Scheduled", name: "Demo Scheduled", targetLeadStage: "Demo Scheduled" },
  { code: "not_connected", label: "Not Connected", name: "Not Connected", targetLeadStage: "Not Connected (New Lead)" },
  { code: "discussion_pending", label: "Discussion Pending", name: "Discussion Pending", targetLeadStage: "Active" },
  {
    code: "payment_done",
    label: "Payment Done",
    name: "Payment Done",
    targetLeadStage: "Payment Pending",
    triggersPaymentVerification: true,
  },
  {
    code: "payment_verification",
    label: "Payment Verification",
    name: "Payment Verification",
    targetLeadStage: "Payment Pending",
    triggersPaymentVerification: true,
  },
];

async function seedDefaultsIfEmpty(tenantId: string) {
  const count = await prisma.crmCallDisposition.count({ where: { tenantId } });
  if (count > 0) return;
  await prisma.crmCallDisposition.createMany({
    data: DEFAULT_DISPOSITIONS.map((d, i) => ({
      tenantId,
      code: d.code,
      label: d.label,
      name: d.name,
      category: d.category ?? null,
      triggersPaymentVerification: d.triggersPaymentVerification ?? false,
      smbDispositionValue: d.smbDispositionValue ?? null,
      targetLeadStage: d.targetLeadStage ?? null,
      sortOrder: i * 10,
    })),
    skipDuplicates: true,
  });
}

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await seedDefaultsIfEmpty(user.tenantId);
    const items = await prisma.crmCallDisposition.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { code: "asc" },
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
    await assertModule(user, "settings", "create");
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    const item = await prisma.crmCallDisposition.create({
      data: { ...parsed.data, tenantId: user.tenantId } as Prisma.CrmCallDispositionUncheckedCreateInput,
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
