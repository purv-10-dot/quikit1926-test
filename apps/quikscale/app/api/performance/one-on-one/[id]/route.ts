import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("people.oneOnOne");
import { updateOneOnOneSchema } from "@/lib/schemas/oneOnOneSchema";

type Params = { id: string };

export const GET = withTenantAuth<Params>(
  async ({ tenantId, userId }, _req, { params }) => {
    const session = await db.oneOnOne.findFirst({
      where: {
        id: params.id,
        tenantId,
        // Visible to both manager and report
        OR: [{ managerId: userId }, { reportId: userId }],
      },
      include: {
        manager: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        report: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });
    if (!session) {
      return NextResponse.json(
        { success: false, error: "1:1 session not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: session });
  },
  { fallbackErrorMessage: "Failed to fetch 1:1 session" },
);

export const PUT = withTenantAuth<Params>(
  async ({ tenantId, userId }, request, { params }) => {
    const existing = await db.oneOnOne.findFirst({
      where: {
        id: params.id,
        tenantId,
        OR: [{ managerId: userId }, { reportId: userId }],
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "1:1 session not found" },
        { status: 404 },
      );
    }

    const parsed = updateOneOnOneSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid input",
        },
        { status: 400 },
      );
    }
    const input = parsed.data;

    const data: Record<string, unknown> = {};
    if (input.scheduledAt !== undefined)
      data.scheduledAt = new Date(input.scheduledAt);
    if (input.duration !== undefined) data.duration = input.duration;
    if (input.talkingPoints !== undefined)
      data.talkingPoints = input.talkingPoints;
    if (input.actionItems !== undefined) data.actionItems = input.actionItems;
    if (input.notes !== undefined) data.notes = input.notes;
    if (input.mood !== undefined) data.mood = input.mood;
    if (input.completedAt !== undefined) {
      data.completedAt = input.completedAt ? new Date(input.completedAt) : null;
    }

    const session = await db.oneOnOne.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        scheduledAt: true,
        duration: true,
        completedAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ success: true, data: session });
  },
  { fallbackErrorMessage: "Failed to update 1:1 session" },
);

export const DELETE = withTenantAuth<Params>(
  async ({ tenantId, userId }, _req, { params }) => {
    const existing = await db.oneOnOne.findFirst({
      where: {
        id: params.id,
        tenantId,
        OR: [{ managerId: userId }, { reportId: userId }],
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "1:1 session not found" },
        { status: 404 },
      );
    }

    await db.oneOnOne.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true, message: "1:1 session deleted" });
  },
  { fallbackErrorMessage: "Failed to delete 1:1 session" },
);
