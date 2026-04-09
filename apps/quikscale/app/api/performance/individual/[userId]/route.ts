import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { userId: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const user = await db.user.findUnique({ where: { id: session.user.id }, include: { memberships: true } });
    const tenantId = user?.memberships[0]?.tenantId;
    if (!tenantId) return NextResponse.json({ success: false, error: "No tenant" }, { status: 400 });

    const target = await db.user.findUnique({
      where: { id: params.userId },
      include: {
        kpisOwned: { where: { tenantId }, include: { weeklyValues: true } },
        prioritiesOwned: { where: { tenantId }, include: { weeklyStatuses: true } },
        memberships: { where: { tenantId }, include: { team: true } },
        reviewsReceived: {
          where: { tenantId },
          include: { reviewer: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { createdAt: "desc" }
        },
      }
    });

    if (!target) return NextResponse.json({ success: false, error: "User not found" }, { status: 404 });

    const meetings = await db.meeting.findMany({
      where: { tenantId },
      include: { attendees: { where: { userId: params.userId } } }
    });

    return NextResponse.json({ success: true, data: { user: target, meetings } });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
