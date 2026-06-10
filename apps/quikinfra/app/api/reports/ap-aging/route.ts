import { NextResponse } from "next/server";

// Stubbed: the finance models this report aggregated were removed. Returns
// empty data so the Reports UI still renders until finance is rebuilt.
export async function GET() {
  return NextResponse.json({ success: true, data: [] });
}
