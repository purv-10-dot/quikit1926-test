import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";
import { parsePagination, paginationMeta } from "@/lib/utils/pagination";
import type { Prisma } from "@quikit/database";

export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const { searchParams } = new URL(req.url);
    const { page, limit, sort, order } = parsePagination(searchParams);
    const category = searchParams.get("category");
    const search = searchParams.get("search");
    const reason = searchParams.get("reason");

    const where: Prisma.AssetScrapWhereInput = {
      orgId,
      ...(reason === "lost" && { markedLost: true }),
      ...(reason === "retired" && { markedLost: false }),
      ...((category || search) && {
        asset: {
          ...(category && { category }),
          ...(search && {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { assetCode: { contains: search, mode: "insensitive" } },
              { serialNumber: { contains: search, mode: "insensitive" } },
            ],
          }),
        },
      }),
    };

    const [scraps, total, summary] = await Promise.all([
      prisma.assetScrap.findMany({
        where,
        orderBy: sort ? { [sort]: order } : { scrapDate: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          asset: {
            select: { id: true, assetCode: true, name: true, category: true, brand: true, model: true, purchasePrice: true },
          },
        },
      }),
      prisma.assetScrap.count({ where }),
      prisma.assetScrap.aggregate({
        where: { orgId },
        _sum: { scrapValue: true, quantity: true },
        _count: true,
      }),
    ]);

    return successResponse(
      {
        items: scraps,
        summary: {
          totalEvents: summary._count,
          totalUnits: summary._sum.quantity ?? 0,
          totalScrapValue: summary._sum.scrapValue ?? 0,
        },
      },
      paginationMeta(page, limit, total),
    );
  } catch (error) {
    console.error("GET /assets/scrap error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.asset.read"] });
