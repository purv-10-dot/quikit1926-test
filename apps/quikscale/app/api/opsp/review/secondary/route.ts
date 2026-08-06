import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { writeAuditLog } from "@/lib/api/auditLog";
import { validationError } from "@/lib/api/validationError";
import { opspReviewSecondarySaveSchema } from "@/lib/schemas/opspReviewSchema";
import { resolveOpspOwnerOrSelf } from "@/lib/api/opspOwner";
import { userCan, forbidden } from "@/lib/api/permissions";

const reviewAuth = withOrgAuthForResource("opsp.review", "OPSP.Review");

/**
 * POST /api/opsp/review/secondary
 *
 * Saves status + comment for a secondary review row
 * (rocks / key initiatives / key thrusts).
 * Uses OPSPReviewEntry with period="secondary". Requires OPSP.Review:update.
 */
export const POST = reviewAuth.update(async ({ orgId, userId }, req) => {
  try {
    const parsed = opspReviewSecondarySaveSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed, "Invalid secondary review data");

    const { year, quarter, horizon, rowIndex, category, status, comment } = parsed.data;
    const yearNum = typeof year === "number" ? year : parseInt(year);

    // OPSP is org-shared: secondary-review entries attach to the canonical owner's plan.
    const ownerId = await resolveOpspOwnerOrSelf(orgId, userId);

    // 1. Verify the org's OPSP exists
    const opsp = await db.oPSPData.findUnique({
      where: {
        orgId_userId_year_quarter: { orgId, userId: ownerId, year: yearNum, quarter },
      },
      select: { id: true, status: true },
    });

    if (!opsp) {
      return NextResponse.json(
        { success: false, error: "No OPSP found for this period" },
        { status: 404 },
      );
    }

    // 1b. Same post-submit lock as the primary review route (EditFinalize
    // holders can still edit; see comment there for the full rationale).
    if (opsp.status === "reviewed") {
      const canEditAfterFinalize = await userCan(userId, orgId, "OPSP.History.EditFinalize", "update");
      if (!canEditAfterFinalize) {
        return forbidden("This OPSP's review has been submitted. Editing requires the 'Edit after Finalize' permission.");
      }
    }

    // 2a. Snapshot pre-update state. comment field stores JSON {status, text}.
    const prev = await db.oPSPReviewEntry.findUnique({
      where: {
        orgId_opspId_horizon_rowIndex_period: {
          orgId,
          opspId: opsp.id,
          horizon,
          rowIndex,
          period: "secondary",
        },
      },
      select: { comment: true, category: true },
    });
    let prevStatus: string | null = null;
    let prevText = "";
    if (prev?.comment) {
      try {
        const parsed = JSON.parse(prev.comment) as { status?: string | null; text?: string };
        prevStatus = parsed.status ?? null;
        prevText = parsed.text ?? "";
      } catch {
        // Pre-JSON entries — surface raw string as the text.
        prevText = prev.comment;
      }
    }
    const oldSnapshot = {
      horizon,
      rowIndex,
      category: prev?.category ?? null,
      status: prevStatus,
      comment: prevText,
    };
    const newSnapshot = {
      horizon,
      rowIndex,
      category,
      status: status ?? null,
      comment: comment ?? "",
    };

    // 2b. Upsert the secondary entry (period="secondary", status stored in comment as JSON prefix)
    const savedEntry = await db.oPSPReviewEntry.upsert({
      where: {
        orgId_opspId_horizon_rowIndex_period: {
          orgId,
          opspId: opsp.id,
          horizon,
          rowIndex,
          period: "secondary",
        },
      },
      update: {
        category,
        comment: JSON.stringify({ status: status ?? null, text: comment ?? "" }),
        updatedBy: userId,
      },
      create: {
        orgId,
        opspId: opsp.id,
        userId,
        horizon,
        rowIndex,
        category,
        period: "secondary",
        comment: JSON.stringify({ status: status ?? null, text: comment ?? "" }),
        updatedBy: userId,
      },
    });

    // 3. Audit log
    await writeAuditLog({
      orgId,
      actorId: userId,
      action: "UPDATE",
      entityType: "Review",
      entityId: opsp.id,
      oldValues: oldSnapshot,
      newValues: newSnapshot,
      changes: [`${horizon}:secondary:${category}:row${rowIndex}`],
      reason: `OPSP Secondary (${horizon}|rowIndex=${rowIndex}): ${category}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        rowIndex,
        status: status ?? null,
        comment: comment ?? "",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save secondary review data";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
});
