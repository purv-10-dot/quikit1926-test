import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getActiveWorkspaceId } from "@/lib/workspace";
import { getMailchimpStats } from "@/lib/connectors/mailchimp";
import { connectorErrorResponse } from "@/lib/connectors/errors";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const workspaceId = await getActiveWorkspaceId(session.user.id, (session.user as any).orgId ?? "");
    const data = await getMailchimpStats(session.user.id, workspaceId);
    return NextResponse.json({ connected: true, ...data });
  } catch (err) {
    const { body, status } = connectorErrorResponse("mailchimp", err);
    return NextResponse.json(body, { status });
  }
}
