import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateQuikCRMCredentials } from "@/lib/connectors/quikcrm";
import { clearCache } from "@/lib/dashboardCache";
import { getActiveWorkspaceId } from "@/lib/workspace";

// POST /api/connections/quikcrm/connect
// Body: { apiUrl: string; apiKey: string }
// Validates credentials against the QuikCRM /me endpoint, then upserts
// the PlatformConnection record with status CONNECTED.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let apiUrl: string;
  let apiKey: string;
  try {
    const body = await req.json() as { apiUrl?: unknown; apiKey?: unknown };
    if (typeof body.apiUrl !== "string" || !body.apiUrl.trim()) {
      return NextResponse.json({ error: "apiUrl is required" }, { status: 400 });
    }
    if (typeof body.apiKey !== "string" || !body.apiKey.trim()) {
      return NextResponse.json({ error: "apiKey is required" }, { status: 400 });
    }
    apiUrl = body.apiUrl.trim();
    apiKey = body.apiKey.trim();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Validate credentials against the QuikCRM API
  let orgId: string | undefined;
  let orgName: string | undefined;
  try {
    const info = await validateQuikCRMCredentials(apiUrl, apiKey);
    orgId   = info.orgId;
    orgName = info.orgName;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect to QuikCRM";
    return NextResponse.json({ error: message }, { status: 422 });
  }

  // Upsert the connection
  const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user.orgId as string) ?? "");
  await prisma.platformConnection.upsert({
    where: { workspaceId_platform: { workspaceId, platform: "QUIKCRM" } as never },
    create: {
      userId:      session.user.id,
      orgId:       session.user.orgId as string,
      workspaceId,
      platform:    "QUIKCRM",
      status:      "CONNECTED",
      accessToken: apiKey,
      metadata:    { apiUrl, orgId, orgName },
      scopes:      [],
    },
    update: {
      status:      "CONNECTED",
      accessToken: apiKey,
      metadata:    { apiUrl, orgId, orgName },
    },
  });

  clearCache();

  return NextResponse.json({ connected: true, orgName });
}
