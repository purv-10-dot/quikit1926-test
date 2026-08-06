import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

// GET /api/okrs — real OKR data from a connected OKR tool.
// No OKR-tool connector exists yet, so this returns empty and the page shows a
// "not connected" state. Once an OKR connector is added, populate from it here.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json([]);
}
