/**
 * GET /api/public/contacts
 *
 * Public (API-key authenticated) contacts endpoint. Today it supports the
 * count use-case the third-party dashboard needs:
 *
 *   GET /api/public/contacts?count=true
 *     → { "total": 123 }
 *
 *   GET /api/public/contacts?count=true&createdAfter=2026-06-22
 *     → { "total": 15 }   // contacts created on/after the given UTC date
 *
 * `count=true` is currently required — it's the only supported mode. Asking
 * for the list itself (count omitted/false) returns 400 so we don't silently
 * ship an unpaginated dump; a future list mode can slot in here.
 *
 * Only non-deleted contacts are counted (`deletedAt: null`), matching the rest
 * of the app. All queries are scoped to the API key's `orgId`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@quikit/database";
import { db } from "@/lib/db";
import { withPublicApiAuth } from "@/lib/api/public-api-auth";

export const runtime = "nodejs";

const querySchema = z.object({
  // Accept the standard truthy spellings; anything else is treated as false.
  count: z
    .enum(["true", "1", "yes"])
    .optional()
    .transform((v) => v !== undefined),
  // YYYY-MM-DD. Parsed as UTC midnight so results are timezone-stable.
  createdAfter: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "createdAfter must be YYYY-MM-DD")
    .optional(),
});

export const GET = withPublicApiAuth(
  async ({ orgId }, req: NextRequest): Promise<NextResponse> => {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Invalid query: " +
            parsed.error.issues
              .map((i) => `${i.path.join(".")}: ${i.message}`)
              .join("; "),
        },
        { status: 400 },
      );
    }

    if (!parsed.data.count) {
      return NextResponse.json(
        { success: false, error: "Only count=true is supported" },
        { status: 400 },
      );
    }

    const where: Prisma.CrmContactWhereInput = { orgId, deletedAt: null };

    if (parsed.data.createdAfter) {
      const createdAfter = new Date(`${parsed.data.createdAfter}T00:00:00.000Z`);
      if (Number.isNaN(createdAfter.getTime())) {
        return NextResponse.json(
          { success: false, error: "Invalid createdAfter date" },
          { status: 400 },
        );
      }
      where.createdAt = { gte: createdAfter };
    }

    const total = await db.crmContact.count({ where });
    return NextResponse.json({ total });
  },
);
