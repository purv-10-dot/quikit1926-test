import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { updateProjectSchema } from "@/lib/validation/project";

export const GET = withProjectAccess<{ id: string }>(
  async ({ orgId, projectId }) => {
    const project = await db.qtProject.findFirst({
      where: { id: projectId, orgId: orgId, isDeleted: false },
      include: {
        statuses: {
          where: { isDeleted: false },
          orderBy: { orderIndex: "asc" },
        },
        issueTypes: { where: { isDeleted: false }, orderBy: { orderIndex: "asc" } },
      },
    });
    return NextResponse.json({ success: true, data: project });
  },
  { paramKey: "id" },
);

export const PATCH = withProjectAccess<{ id: string }>(
  async ({ orgId, userId, projectId }, req) => {
    const parsed = updateProjectSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
        { status: 400 },
      );
    }

    try {
      // The space key is immutable — it's embedded in every work-item ID, so
      // changing it would orphan existing references. Strip any incoming
      // projectKey so it can never be updated, even via a crafted request.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { projectKey: _immutableKey, ...updatable } = parsed.data;
      // withProjectAccess has already verified this user can edit this
      // project in this org, so the unique-id where is safe to use directly.
      const project = await db.qtProject.update({
        where: { id: projectId },
        data: {
          ...updatable,
          startDate: updatable.startDate ? new Date(updatable.startDate) : undefined,
          endDate: updatable.endDate ? new Date(updatable.endDate) : undefined,
          updatedBy: userId,
        },
      });
      return NextResponse.json({ success: true, data: project });
    } catch (error: unknown) {
      const code = (error as { code?: string })?.code;
      if (code === "P2002") {
        const target = (error as { meta?: { target?: string[] } })?.meta?.target ?? [];
        if (target.includes("projectKey")) {
          return NextResponse.json(
            { success: false, error: "This space key is already in use. Choose a different one." },
            { status: 409 },
          );
        }
        return NextResponse.json(
          { success: false, error: "A space with these details already exists." },
          { status: 409 },
        );
      }
      const message = error instanceof Error ? error.message : "Failed to update space";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "update" } },
);

export const DELETE = withProjectAccess<{ id: string }>(
  async ({ orgId, userId, projectId }) => {
    await db.qtProject.update({
      where: { id: projectId },
      data: { isDeleted: true, updatedBy: userId },
    });
    return NextResponse.json({ success: true, data: { id: projectId } });
  },
  { paramKey: "id", requirePermission: { resource: "Project", action: "delete" } },
);
