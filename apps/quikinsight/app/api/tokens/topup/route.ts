import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const runtime = "nodejs";

// Placeholder — Stripe/Razorpay top-up integration coming soon.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ comingSoon: true, message: "Token top-ups will be available in a future release." }, { status: 200 });
}
