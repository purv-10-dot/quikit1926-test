/**
 * Catch-all settings endpoint for the OrgWorkspaceSettings JSON tree.
 *
 * GET /api/settings/<path>     → returns the value at a dotted path
 * PATCH /api/settings/<path>   → upserts the JSON value at a dotted path
 *
 * Use specific routes (e.g. /api/users, /api/permission-templates) for entities
 * that have their own table. This route handles tree-shaped configuration only.
 */

import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";

export const runtime = "nodejs";

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];

function getAt(obj: JsonValue, path: string[]): JsonValue {
  let cur: JsonValue = obj;
  for (const k of path) {
    if (cur && typeof cur === "object" && !Array.isArray(cur) && k in cur) {
      cur = (cur as Record<string, JsonValue>)[k]!;
    } else return null;
  }
  return cur;
}

function setAt(obj: JsonValue, path: string[], value: JsonValue): JsonValue {
  if (path.length === 0) return value;
  const root: Record<string, JsonValue> =
    obj && typeof obj === "object" && !Array.isArray(obj) ? { ...(obj as Record<string, JsonValue>) } : {};
  let cursor: Record<string, JsonValue> = root;
  for (let i = 0; i < path.length - 1; i++) {
    const k = path[i]!;
    const next = cursor[k];
    cursor[k] = next && typeof next === "object" && !Array.isArray(next) ? { ...(next as Record<string, JsonValue>) } : {};
    cursor = cursor[k] as Record<string, JsonValue>;
  }
  cursor[path[path.length - 1]!] = value;
  return root;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  try {
    const { slug } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    const ws = await prisma.crmOrgWorkspaceSettings.findUnique({ where: { tenantId: user.tenantId } });
    const tree = (ws?.settings as JsonValue) ?? {};
    return NextResponse.json({ value: getAt(tree, slug) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string[] }> }) {
  try {
    const { slug } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "settings", "edit");
    const body = await req.json().catch(() => ({}));
    const value = (body && typeof body === "object" && "value" in body ? body.value : body) as JsonValue;
    const existing = await prisma.crmOrgWorkspaceSettings.findUnique({ where: { tenantId: user.tenantId } });
    const next = setAt((existing?.settings as JsonValue) ?? {}, slug, value);
    await prisma.crmOrgWorkspaceSettings.upsert({
      where: { tenantId: user.tenantId },
      create: { tenantId: user.tenantId, settings: next as object },
      update: { settings: next as object },
    });
    return NextResponse.json({ ok: true, value: getAt(next, slug) });
  } catch (e) {
    return errorResponse(e);
  }
}
