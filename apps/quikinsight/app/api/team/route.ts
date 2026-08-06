import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { teamMembers, teamTasksToday } from "@/lib/mock/team";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ members: teamMembers, tasksToday: teamTasksToday });
}
