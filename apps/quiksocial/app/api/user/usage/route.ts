/**
 * GET /api/user/usage
 *
 * Returns the user's plan + their usage counters this month: posts
 * created, brands owned, members invited.
 *
 * Ported to QuikIT (Phase 3, Batch 5).
 */

import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

const PLAN_LIMITS = {
  posts: 100,
  members: 5,
  brands: 3,
};

export const GET = withOrgAuth(async ({ orgId, userId }) => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [postsThisMonth, brandsCount, membersCount] = await Promise.all([
    db.post.count({
      where: { orgId, createdBy: userId, createdAt: { gte: startOfMonth } },
    }),
    db.brand.count({ where: { orgId, createdBy: userId } }),
    db.brandMembership.count({ where: { orgId, invitedBy: userId } }),
  ]);

  return NextResponse.json({
    success: true,
    data: {
      postsThisMonth,
      brandsCount,
      membersCount,
      limits: PLAN_LIMITS,
      plan: "Free",
      renewalDate: null,
    },
  });
});
