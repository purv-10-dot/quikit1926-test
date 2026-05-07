import { NextRequest, NextResponse } from "next/server";
import { getAssets, getIssuances } from "@/lib/store/asset-mgmt-store";

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const assets = getAssets();
  const idx = assets.findIndex((a: any) => a.id === params.id);
  if (idx < 0) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const next = { ...assets[idx], ...body, id: assets[idx].id, updatedAt: new Date().toISOString() };
  assets[idx] = next;
  return NextResponse.json(next);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const assets = getAssets();
  const idx = assets.findIndex((a: any) => a.id === params.id);
  if (idx < 0) return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  // Block delete if the asset is currently issued out and not returned.
  const inUse = getIssuances().some(
    (i: any) => i.assetId === params.id && i.status === "issued",
  );
  if (inUse) {
    return NextResponse.json(
      { error: "Asset is currently issued — return it first" },
      { status: 409 },
    );
  }
  assets.splice(idx, 1);
  return NextResponse.json({ success: true });
}
