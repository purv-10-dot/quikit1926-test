import { NextRequest, NextResponse } from "next/server";
import { getIssuances } from "@/lib/store/asset-mgmt-store";

/**
 * PATCH /api/store/asset-mgmt/issuances/:id
 *   - { action: "return" }       → mark the asset as returned
 *   - any other field            → patch in place
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const issuances = getIssuances();
  const idx = issuances.findIndex((i: any) => i.id === params.id);
  if (idx < 0) return NextResponse.json({ error: "Issuance not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const prev = issuances[idx];

  if (body?.action === "return") {
    if (prev.status === "returned") {
      return NextResponse.json({ error: "Already returned" }, { status: 409 });
    }
    const next = {
      ...prev,
      status: "returned",
      returnedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    issuances[idx] = next;
    return NextResponse.json(next);
  }

  const next = { ...prev, ...body, id: prev.id, updatedAt: new Date().toISOString() };
  issuances[idx] = next;
  return NextResponse.json(next);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const issuances = getIssuances();
  const idx = issuances.findIndex((i: any) => i.id === params.id);
  if (idx < 0) return NextResponse.json({ error: "Issuance not found" }, { status: 404 });
  issuances.splice(idx, 1);
  return NextResponse.json({ success: true });
}
