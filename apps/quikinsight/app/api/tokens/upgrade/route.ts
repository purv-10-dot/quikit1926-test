import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

// Placeholder — subscription plan management coming soon.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ comingSoon: true, message: "Plan upgrades will be available in a future release." }, { status: 200 });
}
