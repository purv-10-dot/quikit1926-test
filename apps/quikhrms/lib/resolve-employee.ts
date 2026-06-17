import { prisma } from "@/lib/prisma";

const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Resolves an auth-layer userId to the actual Employee.id in the DB.
 *
 * A real session always carries a valid Employee.id, so an exact match wins.
 * Only the dev no-login flow (header `x-user-id` = e.g. "user_dev_001", which
 * is not a real cuid) falls back to the seeded admin — and never in production,
 * so a logged-in user can never be silently resolved to someone else.
 */
export async function resolveEmployeeId(orgId: string, userId: string): Promise<string | null> {
  const exact = await prisma.employee.findFirst({
    where: { orgId, deletedAt: null, id: userId },
    select: { id: true },
  });
  if (exact) return exact.id;

  if (IS_PROD) return null;

  const devFallback = await prisma.employee.findFirst({
    where: { orgId, deletedAt: null, employeeCode: "QK-EMP-0001" },
    select: { id: true },
  });
  return devFallback?.id ?? null;
}
