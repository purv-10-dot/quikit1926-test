import { NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { isBotMailbox } from "@/lib/connectors";
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
  // Teams calendar connection: the email of the FATHOM ACCOUNT whose calendar
  // should auto-join. Fathom has no invitable bot mailbox — its notetaker joins
  // meetings that appear on a Fathom user's connected calendar, so inviting
  // that person is how a QuikFlow-created meeting reaches Fathom at all.
  // Empty string clears the override (falls back to FATHOM_NOTETAKER_EMAIL).
  //
  // Both checks below exist because every way of getting this wrong fails
  // SILENTLY at meeting time — a malformed value makes Graph reject the whole
  // event, and a bot-looking value is nobody's mailbox, so the invite bounces
  // and Fathom never learns the meeting exists. Save time is the only moment a
  // human is present to see the problem.
  notetakerEmail: z
    .union([
      z.literal(""),
      z
        .string()
        .trim()
        .max(320)
        .email("Fathom account email must be a valid email address")
        .refine((v) => !isBotMailbox(v), {
          message:
            "Fathom has no invitable bot mailbox. Enter the email of the Fathom account whose calendar should auto-join (that person's own address, e.g. name@company.com).",
        }),
    ])
    .optional(),
});

/**
 * PATCH /api/connections — update a connection's per-connection settings
 * (App Admin). Today this is just `notetakerEmail` on a Teams calendar
 * connection: the Fathom account address auto-invited to every online meeting
 * QuikFlow creates, which is what puts the meeting on that account's synced
 * calendar so Fathom auto-joins and records. The stored key keeps its original
 * name so existing connections keep working; the meaning is the Fathom user,
 * not a bot. Merges into the existing settings JSON rather than replacing it.
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
