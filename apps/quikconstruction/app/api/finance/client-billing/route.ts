import { NextRequest, NextResponse } from "next/server";

const data: any[] = [];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.toLowerCase() ?? "";
  let filtered = data;
  if (search) filtered = data.filter(r => r.billNo.toLowerCase().includes(search) || r.client.toLowerCase().includes(search) || r.projectName.toLowerCase().includes(search));
  return NextResponse.json({ data: filtered, total: filtered.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const record = { id: `cb-${data.length + 1}`, billNo: `RA-BILL/${Date.now()}`, ...body };
  data.push(record);
  return NextResponse.json(record, { status: 201 });
}
