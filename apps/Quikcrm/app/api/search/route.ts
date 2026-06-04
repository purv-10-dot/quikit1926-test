import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    if (!q || q.length < 2) return NextResponse.json({ leads: [], accounts: [], contacts: [] });

    const [leads, accounts, contacts] = await Promise.all([
      prisma.crmLead.findMany({
        where: {
          orgId: user.orgId,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { company: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
        select: { id: true, name: true, company: true, stage: true },
      }),
      prisma.crmAccount.findMany({
        where: { orgId: user.orgId, name: { contains: q, mode: "insensitive" } },
        take: 10,
        select: { id: true, name: true, industry: true },
      }),
      prisma.crmContact.findMany({
        where: {
          orgId: user.orgId,
          OR: [
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        },
        take: 10,
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
    ]);
    return NextResponse.json({ leads, accounts, contacts });
  } catch (e) {
    return errorResponse(e);
  }
}
