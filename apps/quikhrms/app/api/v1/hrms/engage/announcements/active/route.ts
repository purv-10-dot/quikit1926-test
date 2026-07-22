import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withServiceAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

export const GET = withServiceAuth(async (req: NextRequest, { orgId }) => {
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? 5);
    const now = new Date();
    const where = {
      orgId,
      deletedAt: null,
      publishedAt: { not: null, lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
    };

    const [count, items] = await Promise.all([
      prisma.announcement.count({ where }),
      prisma.announcement.findMany({
        where,
        orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
        take: limit,
        select: {
          id: true, title: true, content: true, isPinned: true, publishedAt: true,
          author: { select: { firstName: true, lastName: true, profilePhoto: true } },
        },
      }),
    ]);

    return successResponse({ count, items });
  } catch (e) {
    console.error("GET /engage/announcements/active error:", e);
    return internalError();
  }
});
