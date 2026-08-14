import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

// Placeholder — full analytics (daily breakdowns, feature heatmaps, etc.) coming soon.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ comingSoon: true, message: "Usage analytics will be available in a future release." });
}
