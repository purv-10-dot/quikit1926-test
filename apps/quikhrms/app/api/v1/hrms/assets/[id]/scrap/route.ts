import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, notFound, conflict, internalError } from "@/lib/api-response";
import { scrapAssetSchema } from "@/lib/validations/assets";
import { createAuditLog } from "@/lib/utils/audit";
import { publishAssetUpdate } from "@/lib/services/realtime";

export const POST = withAuth(async (req: NextRequest, { orgId, userId }, params) => {
  try {
    const { id } = params;
    const body = await req.json();
    const parsed = scrapAssetSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const asset = await prisma.asset.findFirst({ where: { id, orgId, deletedAt: null } });
    if (!asset) return notFound("Asset not found");

    const activeCount = await prisma.assetAssignment.count({
      where: { orgId, assetId: id, status: "AssignmentActive", deletedAt: null },
    });

    const totalQty = asset.quantity ?? 1;
    const scrapQty = parsed.data.quantity;
    const maxScrap = totalQty - activeCount;

    if (scrapQty > maxScrap) {
      return conflict(`Cannot scrap ${scrapQty}: only ${maxScrap} unit(s) free (${activeCount} assigned).`);
    }

    if (asset.status === "Retired" || asset.status === "AssetLost") {
      return conflict("Asset already fully scrapped");
    }

    const newQty = totalQty - scrapQty;
    const fullyScrapped = newQty === 0;
    const scrapDate = parsed.data.disposalDate ? new Date(parsed.data.disposalDate) : new Date();

    const [scrap] = await prisma.$transaction([
      prisma.assetScrap.create({
        data: {
          orgId,
          assetId: id,
          quantity: scrapQty,
          reason: parsed.data.disposalReason,
          scrapDate,
          scrapValue: parsed.data.scrapValue ?? null,
          markedLost: parsed.data.markLost ?? false,
          scrappedBy: userId,
          notes: parsed.data.notes,
        },
      }),
      prisma.asset.update({
        where: { id },
        data: {
          quantity: newQty,
          ...(fullyScrapped && {
            status: parsed.data.markLost ? "AssetLost" : "Retired",
            disposalDate: scrapDate,
            disposalReason: parsed.data.disposalReason,
            scrappedBy: userId,
          }),
          updatedBy: userId,
        },
      }),
    ]);

    await createAuditLog({
      orgId, userId, action: "Create", entityType: "AssetScrap", entityId: scrap.id,
      metadata: { assetId: id, quantity: scrapQty, reason: parsed.data.disposalReason, fullyScrapped },
    });

    void publishAssetUpdate(orgId, { assetId: id, action: "scrapped" });

    return successResponse(scrap, undefined, 201);
  } catch (error) {
    console.error("POST /assets/[id]/scrap error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.asset.write"] });
