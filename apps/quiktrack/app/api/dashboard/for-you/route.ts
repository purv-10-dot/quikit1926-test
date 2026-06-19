import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";

export const GET = withOrgAuth(async ({ orgId, userId }, req) => {
  const url = new URL(req.url);
  const tab = url.searchParams.get("tab") ?? "recommended";

  const projects = await db.qtProject.findMany({
    where: {
      orgId: orgId,
      isDeleted: false,
      members: { some: { userId, isDeleted: false } },
    },
    orderBy: { updatedAt: "desc" },
    take: 12,
    select: {
      id: true,
      name: true,
      projectKey: true,
      icon: true,
      color: true,
      projectType: true,
      updatedAt: true,
    },
  });

  if (tab === "assigned") {
    const issues = await db.qtIssue.findMany({
      where: { orgId: orgId, assigneeId: userId, isDeleted: false },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        key: true,
        title: true,
        type: true,
        statusId: true,
        projectId: true,
        updatedAt: true,
      },
    });
    return NextResponse.json({
      success: true,
      data: { recommendedSpaces: projects.slice(0, 3), feed: issues },
    });
  }

  return NextResponse.json({
    success: true,
    data: { recommendedSpaces: projects.slice(0, 3), feed: projects },
  });
});
