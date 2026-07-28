import { NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import type { ConnectionDTO } from "@/types";

const PROVIDERS = [
  "quikscale",
  "quikcrm",
  "quikhrms",
  "quikinfra",
  "quiktrack",
  "outlook",
  "teams",
  "gmail",
  "slack",
  "sheets",
  "webhook",
  "fathom",
] as const;

const EXTERNAL = new Set(["outlook", "teams", "gmail", "slack", "sheets", "webhook", "fathom"]);

/** GET /api/connections — apps/accounts this org's workflows can use. */
export const GET = withOrgAuth(async ({ orgId }) => {
  const rows = await db.wfConnection.findMany({
    where: { orgId },
    orderBy: { createdAt: "asc" },
  });

  const data: ConnectionDTO[] = rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    label: r.label,
    status: r.status,
    external: EXTERNAL.has(r.provider),
    expiresAt: r.expiresAt?.toISOString() ?? null,
  }));

  return NextResponse.json({ success: true, data });
});

const createSchema = z.object({
  provider: z.enum(PROVIDERS),
  label: z.string().min(1).max(120),
});

/**
 * POST /api/connections — register a connection (managing org connections is
 * an App Admin capability, PRD FR-F1). Real OAuth token exchange is wired in
 * the connector phase; this creates the connection record.
 */
export const POST = withOrgAuth(
  async ({ orgId, userId }, req) => {
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const created = await db.wfConnection.create({
      data: {
        orgId,
        provider: parsed.data.provider,
        label: parsed.data.label,
        status: "connected",
        createdBy: userId,
        scopes: [],
      },
      select: { id: true },
    });
    return NextResponse.json({ success: true, data: { id: created.id } }, { status: 201 });
  },
  { requireAdmin: true },
);

/**
 * DELETE /api/connections?id=... — disconnect an account (App Admin). Scoped to
 * the caller's org via deleteMany so a cross-org id can never be removed.
 */
export const DELETE = withOrgAuth(
  async ({ orgId }, req) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) {
      return NextResponse.json({ success: false, error: "Missing connection id" }, { status: 400 });
    }
    const result = await db.wfConnection.deleteMany({ where: { id, orgId } });
    if (result.count === 0) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ success: true, data: { deleted: true } });
  },
  // Any org member may disconnect a mailbox in their org (org-scoped delete).
);
