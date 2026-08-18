import { NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";
import { Prisma } from "@quikit/database";
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
    notetakerEmail:
      r.provider === "teams"
        ? ((r.settings as { notetakerEmail?: string } | null)?.notetakerEmail ?? null)
        : undefined,
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

const settingsSchema = z.object({
  id: z.string().min(1),
  // Teams calendar connection: the bot email Fathom's auto-join invite goes
  // to. Empty string clears the override (falls back to FATHOM_NOTETAKER_EMAIL).
  notetakerEmail: z.string().trim().max(320).optional(),
});

/**
 * PATCH /api/connections — update a connection's per-connection settings
 * (App Admin). Today this is just `notetakerEmail` on a Teams calendar
 * connection: the Fathom bot address auto-invited to every online meeting
 * QuikFlow creates, so it auto-joins and records. Merges into the existing
 * settings JSON rather than replacing it.
 */
export const PATCH = withOrgAuth(
  async ({ orgId }, req) => {
    const parsed = settingsSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const { id, notetakerEmail } = parsed.data;
    const existing = await db.wfConnection.findFirst({
      where: { id, orgId },
      select: { settings: true },
    });
    if (!existing) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }
    const nextSettings = { ...(existing.settings as Record<string, unknown> | null) };
    if (notetakerEmail !== undefined) {
      if (notetakerEmail) nextSettings.notetakerEmail = notetakerEmail;
      else delete nextSettings.notetakerEmail;
    }
    await db.wfConnection.update({
      where: { id },
      data: { settings: nextSettings as Prisma.InputJsonValue },
    });
    return NextResponse.json({ success: true, data: { id } });
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
