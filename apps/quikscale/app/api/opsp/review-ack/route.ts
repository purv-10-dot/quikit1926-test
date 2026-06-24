import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import {
  isOpspAckSurface,
  opspAckEntityType,
  opspAckEntityId,
  type OpspAckSurface,
} from "@/lib/api/opspAck";

/**
 * OPSP post-finalize "Mark as Reviewed" acknowledgement.
 *
 * Persists the per-user high-water mark in `AuditEventRead` so it survives
 * logout (which clears localStorage) and works cross-device. The stored
 * `lastReadAt` is the timestamp of the latest edit the user acknowledged; the
 * client shows the post-finalize highlight only while a newer edit exists.
 *
 *   GET  ?year=&quarter=&surface=  → { ackedTs:number }  (0 if never acked)
 *   POST { year, quarter, surface, ackedTs }             → { ackedTs:number }
 *
 * Scoped to the acting user (session) + org. Gated on the OPSP module so both
 * form editors and reviewers can record their own mark.
 */
const withOrgAuth = withOrgAuthForModule("opsp");
const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

function parseYear(raw: unknown): number {
  return typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
}

export const GET = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const year = parseYear(sp.get("year"));
  const quarter = String(sp.get("quarter") ?? "");
  const surface = sp.get("surface");

  if (!year || !QUARTERS.includes(quarter) || !isOpspAckSurface(surface)) {
    return NextResponse.json({ success: false, error: "Invalid year/quarter/surface" }, { status: 400 });
  }

  const row = await db.auditEventRead.findUnique({
    where: {
      userId_entityType_entityId: {
        userId,
        entityType: opspAckEntityType(surface),
        entityId: opspAckEntityId(orgId, year, quarter),
      },
    },
    select: { lastReadAt: true },
  });

  return NextResponse.json({ success: true, data: { ackedTs: row ? row.lastReadAt.getTime() : 0 } });
}, { fallbackErrorMessage: "Failed to load OPSP acknowledgement" });

export const POST = withOrgAuth(async ({ orgId, userId }, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const year = parseYear(body.year);
  const quarter = String(body.quarter ?? "");
  const surface = body.surface as OpspAckSurface;
  const ackedTs = Number(body.ackedTs);

  if (!year || !QUARTERS.includes(quarter) || !isOpspAckSurface(surface)) {
    return NextResponse.json({ success: false, error: "Invalid year/quarter/surface" }, { status: 400 });
  }
  if (!Number.isFinite(ackedTs) || ackedTs < 0) {
    return NextResponse.json({ success: false, error: "Invalid ackedTs" }, { status: 400 });
  }

  const entityType = opspAckEntityType(surface);
  const entityId = opspAckEntityId(orgId, year, quarter);
  const lastReadAt = new Date(ackedTs);

  const saved = await db.auditEventRead.upsert({
    where: { userId_entityType_entityId: { userId, entityType, entityId } },
    update: { lastReadAt },
    create: { orgId, userId, entityType, entityId, lastReadAt },
    select: { lastReadAt: true },
  });

  return NextResponse.json({ success: true, data: { ackedTs: saved.lastReadAt.getTime() } });
}, { fallbackErrorMessage: "Failed to save OPSP acknowledgement" });
