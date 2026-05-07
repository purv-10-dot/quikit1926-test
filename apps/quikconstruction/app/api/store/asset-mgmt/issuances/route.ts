import { NextRequest, NextResponse } from "next/server";
import { getAssets, getIssuances, nextId } from "@/lib/store/asset-mgmt-store";

export async function GET() {
  const assets = getAssets();
  const assetById = new Map(assets.map((a: any) => [a.id, a]));
  const data = getIssuances().map((i: any) => {
    const asset = assetById.get(i.assetId);
    return {
      ...i,
      assetCode: asset?.assetCode ?? "—",
      assetName: asset?.name ?? "—",
    };
  });
  return NextResponse.json({ data, total: data.length });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const assetId = String(body?.assetId ?? "").trim();
  const issuedTo = String(body?.issuedTo ?? "").trim();
  const issueDate = String(body?.issueDate ?? "").trim();
  if (!assetId) return NextResponse.json({ error: "Asset is required" }, { status: 400 });
  if (!issuedTo) return NextResponse.json({ error: "Issued To is required" }, { status: 400 });
  if (!issueDate) return NextResponse.json({ error: "Issue date is required" }, { status: 400 });

  const asset = getAssets().find((a: any) => a.id === assetId);
  if (!asset) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

  const issuances = getIssuances();
  // Block if the same asset is already out (non-returned).
  const alreadyOut = issuances.find(
    (i: any) => i.assetId === assetId && i.status === "issued",
  );
  if (alreadyOut) {
    return NextResponse.json(
      { error: "Asset is already issued and not yet returned" },
      { status: 409 },
    );
  }

  const returnable = body?.returnable === false ? false : true;
  const expectedReturn = returnable
    ? body?.expectedReturn ? String(body.expectedReturn) : null
    : null;

  const now = new Date().toISOString();
  const seq = String(issuances.length + 1).padStart(4, "0");
  const record = {
    id: nextId("iss"),
    issuanceNumber: `ISS-${seq}`,
    assetId,
    issuedTo,
    issueDate,
    expectedReturn,
    returnable,
    notes: body?.notes ? String(body.notes) : null,
    status: "issued",
    returnedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  issuances.push(record);
  return NextResponse.json(record, { status: 201 });
}
