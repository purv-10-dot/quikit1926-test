import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, validationError, conflict, internalError } from "@/lib/api-response";
import { createAssetSchema } from "@/lib/validations/assets";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import { createAuditLog } from "@/lib/utils/audit";
import { publishAssetUpdate } from "@/lib/services/realtime";
import { resolveScope, employeeScopeFilter } from "@/lib/rbac/scope";
import { forbidden } from "@/lib/api-response";
import type { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, ctx) => {
  try {
    const { orgId } = ctx;
    const { searchParams } = new URL(req.url);
    const { page, limit, sort, order } = parsePagination(searchParams);
    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const condition = searchParams.get("condition");
    const search = searchParams.get("search");
    const assigneeId = searchParams.get("assigneeId");

    const scope = resolveScope(ctx, {
      all: "hrms.asset.read",
      team: "hrms.asset.read_team",
      self: "hrms.asset.read_self",
    });
    const scopeFilter = await employeeScopeFilter(ctx, scope);
    if (!scopeFilter.allow) return forbidden("No asset read permission");

    const includeScrap = searchParams.get("includeScrap") === "true";

    const where: Prisma.AssetWhereInput = {
      orgId,
      deletedAt: null,
      ...(!includeScrap && !status && { status: { notIn: ["Retired", "AssetLost"] } }),
      ...(status && { status: status as Prisma.EnumAssetStatusFilter["equals"] }),
      ...(category && { category }),
      ...(condition && { condition: condition as Prisma.EnumAssetConditionFilter["equals"] }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" } },
          { assetCode: { contains: search, mode: "insensitive" } },
          { serialNumber: { contains: search, mode: "insensitive" } },
          { brand: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...(assigneeId && { assignments: { some: { employeeId: assigneeId, status: "AssignmentActive" } } }),
      ...(scopeFilter.employeeIds && !assigneeId && {
        assignments: { some: { employeeId: { in: scopeFilter.employeeIds }, status: "AssignmentActive" } },
      }),
    };

    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        orderBy: sort ? { [sort]: order } : { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          assignments: {
            where: { status: "AssignmentActive", deletedAt: null },
            select: { id: true, employeeId: true, assignedAt: true, expectedReturnDate: true },
          },
          _count: {
            select: {
              assignments: { where: { status: "AssignmentActive", deletedAt: null } },
            },
          },
        },
      }),
      prisma.asset.count({ where }),
    ]);

    // Each AssetAssignment = 1 unit (no quantity field on assignment).
    // assignedCount = active assignments. availableCount = quantity - assignedCount (clamped >= 0).
    const enriched = assets.map((a) => {
      const assignedCount = a._count.assignments;
      const total = a.quantity ?? 1;
      return {
        ...a,
        assignedCount,
        availableCount: Math.max(0, total - assignedCount),
      };
    });

    return successResponse(enriched, paginationMeta(page, limit, total));
  } catch (error) {
    console.error("GET /assets error:", error);
    return internalError();
  }
});

export const POST = withAuth(async (req: NextRequest, { orgId, userId }) => {
  try {
    const body = await req.json();
    const parsed = createAssetSchema.safeParse(body);
    if (!parsed.success) {
      return validationError("Validation failed", parsed.error.flatten().fieldErrors);
    }

    const d = parsed.data;
    const splitUnits = d.trackIndividually && d.quantity > 1;
    const codes = splitUnits
      ? Array.from({ length: d.quantity }, (_, i) => `${d.assetCode}-${String(i + 1).padStart(2, "0")}`)
      : [d.assetCode];

    const existing = await prisma.asset.findFirst({
      where: { orgId, assetCode: { in: codes }, deletedAt: null },
      select: { assetCode: true },
    });
    if (existing) return conflict(`Asset code already exists: ${existing.assetCode}`);

    const baseData = {
      orgId,
      name: d.name,
      category: d.category,
      brand: d.brand,
      model: d.model,
      purchaseDate: d.purchaseDate ? new Date(d.purchaseDate) : null,
      purchasePrice: d.purchasePrice ?? null,
      warrantyExpiry: d.warrantyExpiry ? new Date(d.warrantyExpiry) : null,
      status: d.status,
      condition: d.condition,
      location: d.location,
      specs: d.specs ? JSON.parse(JSON.stringify(d.specs)) : undefined,
      notes: d.notes,
      createdBy: userId,
      updatedBy: userId,
    };

    if (splitUnits) {
      const result = await prisma.asset.createManyAndReturn({
        data: codes.map((code) => ({
          ...baseData,
          assetCode: code,
          quantity: 1,
          serialNumber: null,
        })),
      });
      for (const a of result) {
        await createAuditLog({ orgId, userId, action: "Create", entityType: "Asset", entityId: a.id });
        void publishAssetUpdate(orgId, { assetId: a.id, action: "created" });
      }
      return successResponse({ count: result.length, assets: result }, undefined, 201);
    }

    const asset = await prisma.asset.create({
      data: {
        ...baseData,
        assetCode: d.assetCode,
        serialNumber: d.serialNumber,
        quantity: d.quantity,
      },
    });

    await createAuditLog({ orgId, userId, action: "Create", entityType: "Asset", entityId: asset.id });
    void publishAssetUpdate(orgId, { assetId: asset.id, action: "created" });
    return successResponse(asset, undefined, 201);
  } catch (error) {
    console.error("POST /assets error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.asset.write"] });
