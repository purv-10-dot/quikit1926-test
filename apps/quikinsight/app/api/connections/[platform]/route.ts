import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clearCache } from "@/lib/dashboardCache";
import { getActiveWorkspaceId } from "@/lib/workspace";

// A single UI platform card can map to several Prisma connection records
// (e.g. the Google card bundles GA4 + Search Console + YouTube + Business
// Profile from one OAuth; Meta bundles Facebook + Instagram).
function toPrismaEnums(platform: string): string[] {
  const map: Record<string, string[]> = {
    google:     ["GOOGLE_ANALYTICS", "GOOGLE_SEARCH_CONSOLE", "YOUTUBE", "GOOGLE_BUSINESS_PROFILE"],
    google_ads: ["GOOGLE_ADS"],
    gbp:        ["GOOGLE_BUSINESS_PROFILE"],
    meta:       ["META_FACEBOOK", "META_INSTAGRAM"],
    meta_ads:   ["META_ADS"],
    linkedin:   ["LINKEDIN"],
    hubspot:    ["HUBSPOT"],
    salesforce: ["SALESFORCE"],
    mailchimp:  ["MAILCHIMP"],
    dynamics:   ["DYNAMICS"],
    zoho:       ["ZOHO"],
    quikcrm:    ["QUIKCRM"],
  };
  return map[platform] ?? [platform.toUpperCase()];
}

// Single-record lookup for the GET status check below.
function toPrismaEnum(platform: string): string {
  return toPrismaEnums(platform)[0];
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { platform: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user.orgId as string) ?? "");

  const updated = await prisma.platformConnection.updateMany({
    where: {
      userId:      session.user.id,
      workspaceId,
      platform:    { in: toPrismaEnums(params.platform) as never[] },
    },
    data:  { status: "DISCONNECTED" },
  });

  if (updated.count === 0) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  clearCache(); // drop cached dashboard data so aggregation reflects the disconnect

  return NextResponse.json({ disconnected: params.platform, count: updated.count });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { platform: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user.orgId as string) ?? "");

  const { prismaPlatform, metadata } = await req.json() as { prismaPlatform: string; metadata: Record<string, unknown> };

  const existing = await prisma.platformConnection.findFirst({
    where:  { userId: session.user.id, workspaceId, platform: prismaPlatform as never },
    select: { metadata: true },
  });
  const merged = { ...((existing?.metadata as Record<string, unknown>) ?? {}), ...metadata };

  await prisma.platformConnection.updateMany({
    where: { userId: session.user.id, workspaceId, platform: prismaPlatform as never },
    data:  { metadata: merged as never },
  });

  clearCache(); // force dashboard to re-aggregate with the new property/site

  return NextResponse.json({ ok: true });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { platform: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user.orgId as string) ?? "");

  const conn = await prisma.platformConnection.findFirst({
    where:   { userId: session.user.id, workspaceId, platform: toPrismaEnum(params.platform) as never },
    include: {
      syncs: {
        orderBy: { startedAt: "desc" },
        take:    5,
      },
    },
  });

  if (!conn) {
    return NextResponse.json({ connected: false, platform: params.platform });
  }

  return NextResponse.json({
    connected:    conn.status === "CONNECTED",
    platform:     conn.platform,
    connectedAt:  conn.createdAt,
    tokenExpires: conn.tokenExpiresAt,
    metadata:     conn.metadata,
    syncHistory:  conn.syncs,
  });
}
