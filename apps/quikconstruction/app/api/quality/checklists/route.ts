import { NextRequest, NextResponse } from "next/server";

const data: any[] = [];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.toLowerCase() ?? "";
  let filtered = data;
  if (search) filtered = data.filter(r => r.name.toLowerCase().includes(search) || r.category.toLowerCase().includes(search));
  return NextResponse.json({ data: filtered, total: filtered.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const record = { id: `chk-${data.length + 1}`, itemsCount: body.items?.split(",").length ?? 0, createdDate: new Date().toISOString().split("T")[0], status: "Active", ...body };
  data.push(record);
  return NextResponse.json(record, { status: 201 });
}
