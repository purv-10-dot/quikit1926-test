import { NextRequest, NextResponse } from "next/server";

const data: any[] = [];

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search")?.toLowerCase() ?? "";
  let filtered = data;
  if (search) filtered = data.filter(r => r.contractor.toLowerCase().includes(search) || r.projectName.toLowerCase().includes(search));
  return NextResponse.json({ data: filtered, total: filtered.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const mason = parseInt(body.mason || "0");
  const helperM = parseInt(body.helperM || "0");
  const helperF = parseInt(body.helperF || "0");
  const carpenter = parseInt(body.carpenter || "0");
  const fitter = parseInt(body.fitter || "0");
  const plumber = parseInt(body.plumber || "0");
  const electrician = parseInt(body.electrician || "0");
  const operator = parseInt(body.operator || "0");
  const total = mason + helperM + helperF + carpenter + fitter + plumber + electrician + operator;
  const record = { id: `lab-${data.length + 1}`, ...body, mason, helperM, helperF, carpenter, fitter, plumber, electrician, operator, total };
  data.push(record);
  return NextResponse.json(record, { status: 201 });
}
