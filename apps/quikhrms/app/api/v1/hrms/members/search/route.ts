import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/with-auth";
import { successResponse, internalError } from "@/lib/api-response";

/**
 * GET /api/v1/hrms/members/search?q=<email-or-name>
 *
 * Type-ahead for the "Add New User" modal. Suggests people who already belong
 * to this org in central QuikIT (the Admin Portal "Members" list). Selecting a
 * suggestion lets the admin grant HRMS access without picking an invitation
 * method — the person already has a QuikIT account and is simply linked by
 * email (see provisionMemberRemote: existing users are linked, never re-issued
 * a password).
 *
 * Anyone who already has an HRMS employee record is excluded — they appear in
 * the Users table and the invite endpoint would reject them as a duplicate.
 */
export const GET = withAuth(async (req: NextRequest, { orgId }) => {
  try {
    const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
    // Require a couple of characters so a focused-but-empty field stays quiet.
    if (q.length < 2) return successResponse([]);

    const members = await prisma.orgMember.findMany({
      where: {
        orgId,
        status: "active",
        user: {
          OR: [
            { email: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        },
      },
      select: {
        userId: true,
        role: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { user: { firstName: "asc" } },
      take: 8,
    });

    // Drop anyone already provisioned as an HRMS employee — they can't be
    // invited again (the POST guards against it) and already show in the list.
    const emails = members.map((m) => m.user.email);
    const existing = emails.length
      ? await prisma.employee.findMany({
          where: {
            orgId,
            deletedAt: null,
            OR: emails.map((e) => ({ workEmail: { equals: e, mode: "insensitive" as const } })),
          },
          select: { workEmail: true },
        })
      : [];
    const taken = new Set(existing.map((e) => (e.workEmail ?? "").toLowerCase()));

    const shaped = members
      .filter((m) => !taken.has(m.user.email.toLowerCase()))
      .map((m) => ({
        userId: m.userId,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        email: m.user.email,
        memberRole: m.role,
      }));

    return successResponse(shaped);
  } catch (error) {
    console.error("GET /members/search error:", error);
    return internalError();
  }
}, { requiredPermissions: ["hrms.user.invite"] });
