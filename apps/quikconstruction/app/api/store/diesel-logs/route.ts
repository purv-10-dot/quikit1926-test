import { NextResponse } from "next/server";
const data: any[] = [];
export async function GET() { return NextResponse.json({ data, total: 0 }); }
export async function POST(req: Request) { const body = await req.json(); const r = { id: `dl-${data.length+1}`, ...body }; data.push(r); return NextResponse.json(r, { status: 201 }); }
