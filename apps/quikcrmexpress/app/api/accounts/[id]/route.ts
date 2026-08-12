/**
 * GET    /api/accounts/[id] — single. Returns 404 once soft-deleted (use trash view).
 * PATCH  /api/accounts/[id] — update. Re-derives ownerName, syncs revenue/segment/industry,
 *                            prevents parentAccountId cycles, writes AccountChange activity.
 * DELETE /api/accounts/[id] — soft delete (sets deletedAt = now). Restore lives at /restore.
 */
import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { updateAccountSchema } from "@/lib/validators/account";
import {
  findFirstAccountRow,
  updateAccountRow,
  formatRevenueDisplay,
  parseRevenueDisplay,
  segmentEnumToLabel,
  slugifyIndustry,
  deriveOwnerName,
  assertNoParentCycle,
  writeAccountActivity,
} from "@/lib/services/accounts";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "accounts", "view");
    await assertAccountAccess(user, id);

    const acc = await findFirstAccountRow({
      where: { id, orgId: user.orgId, deletedAt: null },
    });
    if (!acc) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json(acc);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "accounts", "edit");
    await assertAccountAccess(user, id);

    const parsed = updateAccountSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const dto = parsed.data;

    const existing = await findFirstAccountRow({
      where: { id, orgId: user.orgId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    if (dto.parentAccountId !== undefined && dto.parentAccountId !== null) {
      await assertNoParentCycle(user.orgId, id, dto.parentAccountId);
    }

    // ownerId change → re-derive ownerName + record outcome
    const existingOwnerName = existing.owner ?? "";
    let ownerName = existingOwnerName;
    let ownerChangeOutcome: string | null = null;
    if (dto.ownerId !== undefined && dto.ownerId !== existing.ownerId) {
      ownerName = (await deriveOwnerName(dto.ownerId)) ?? "";
      ownerChangeOutcome = `Owner: ${existingOwnerName || "—"} → ${ownerName || "—"}`;
    }

    // Revenue display sync: if amount/currency changed and the user didn't override
    // the display string in this PATCH, regenerate it.
    let displayValue: string | null | undefined = dto.annualRevenueDisplay;
    if (
      displayValue === undefined &&
      (dto.annualRevenueAmount !== undefined || dto.annualRevenueCurrency !== undefined)
    ) {
      const amount = dto.annualRevenueAmount ?? existing.annualRevenueAmount ?? null;
      const currency = dto.annualRevenueCurrency ?? existing.annualRevenueCurrency ?? "INR";
      displayValue = formatRevenueDisplay(amount, currency);
    }

    // Segment text: if segmentEnum changed and segment text wasn't in this PATCH, sync.
    let segmentText: string | null | undefined = dto.segment;
    if (segmentText === undefined && dto.segmentEnum !== undefined) {
      segmentText = segmentEnumToLabel(dto.segmentEnum) ?? null;
    }

    // Industry slug: only re-slugify when industry itself changed.
    let industryKey: string | null | undefined;
    if (dto.industry !== undefined) {
      industryKey = slugifyIndustry(dto.industry);
    }

    // Free-text annualRevenueDisplay was set without amount → best-effort backfill.
    let amountFromDisplay: number | null | undefined;
    let currencyFromDisplay: string | null | undefined;
    if (
      dto.annualRevenueDisplay !== undefined &&
      dto.annualRevenueAmount === undefined
    ) {
      const p = parseRevenueDisplay(dto.annualRevenueDisplay);
      if (p) {
        amountFromDisplay = p.amount;
        currencyFromDisplay = p.currency;
      }
    }

    // ownerName is server-managed; ignore any client-supplied value.
    const data: Prisma.QceAccountUpdateInput = {
      ...(dto.name !== undefined && { name: dto.name }),
      ...(segmentText !== undefined && { segment: segmentText }),
      ...(dto.segmentEnum !== undefined && { segmentEnum: dto.segmentEnum }),
      ...(dto.ownerId !== undefined && { ownerId: dto.ownerId }),
      ...(dto.ownerId !== undefined && { ownerName }),
      ...(dto.industry !== undefined && { industry: dto.industry }),
      ...(industryKey !== undefined && { industryKey }),
      ...(dto.website !== undefined && { website: dto.website }),
      ...(dto.city !== undefined && { city: dto.city }),
      ...(dto.status !== undefined && { status: dto.status }),
      ...(displayValue !== undefined && { annualRevenueDisplay: displayValue }),
      ...(dto.annualRevenueAmount !== undefined && {
        annualRevenueAmount: dto.annualRevenueAmount,
      }),
      ...(amountFromDisplay !== undefined && {
        annualRevenueAmount: amountFromDisplay,
      }),
      ...(dto.annualRevenueCurrency !== undefined && {
        annualRevenueCurrency: dto.annualRevenueCurrency,
      }),
      ...(currencyFromDisplay !== undefined && {
        annualRevenueCurrency: currencyFromDisplay,
      }),
      ...(dto.countryCode !== undefined && { countryCode: dto.countryCode }),
      ...(dto.state !== undefined && { state: dto.state }),
      ...(dto.postalCode !== undefined && { postalCode: dto.postalCode }),
      ...(dto.parentAccountId !== undefined && { parentAccountId: dto.parentAccountId }),
      ...(dto.healthScore !== undefined && { healthScore: dto.healthScore }),
      ...(dto.contractStart !== undefined && { contractStart: dto.contractStart }),
      ...(dto.contractEnd !== undefined && { contractEnd: dto.contractEnd }),
      ...(dto.renewalDate !== undefined && { renewalDate: dto.renewalDate }),
      ...(dto.npsScore !== undefined && { npsScore: dto.npsScore }),
      ...(dto.tags !== undefined && { tags: dto.tags }),
    };

    const updated = await updateAccountRow({ where: { id }, data });
    await prisma.qceActivity.create({
      data: {
        orgId: user.orgId,
        type: "AccountChange",
        relatedKind: "Account",
        relatedObjectId: id,
        subject: `Account · ${dto.name ?? existing.name}`,
        outcome:
          ownerChangeOutcome ||
          `Updated: ${Object.keys(data).slice(0, 4).join(", ")}${
            Object.keys(data).length > 4 ? "…" : ""
          }`,
        ownerName: user.name || null,
        occurredAt: new Date(),
      },
    });

    return NextResponse.json(updated);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "accounts", "delete");
    await assertAccountAccess(user, id);

    const existing = await prisma.qceAccount.findFirst({
      where: { id, orgId: user.orgId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!existing) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

    await prisma.$transaction([
      prisma.qceAccount.update({ where: { id }, data: { deletedAt: new Date() } }),
      prisma.qceActivity.create({
        data: {
          orgId: user.orgId,
          type: "AccountChange",
          relatedKind: "Account",
          relatedObjectId: id,
          subject: `Account · ${existing.name}`,
          outcome: "Soft-deleted (moved to trash)",
          ownerName: user.name || null,
          occurredAt: new Date(),
        },
      }),
    ]);

    // Suppress lint: writeAccountActivity is unused here because we inline the write
    // inside the transaction so the activity rolls back if the soft-delete fails.
    void writeAccountActivity;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
