import { cookies } from "next/headers";
import { db } from "@quikit/database";

const COOKIE = "qi_active_workspace";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const qi = db as any;

export async function ensureDefaultWorkspace(userId: string, orgId: string): Promise<string> {
  // ORDER MATTERS. findFirst with no orderBy lets Postgres return whichever row
  // it likes, so a user with more than one workspace could get a different
  // "default" from one request to the next — connecting a platform in one
  // workspace and then reading another, which looks exactly like the connection
  // never happened. Oldest-first makes it stable and picks the original default.
  const existing = await qi.qiWorkspace.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing.id;

  const ws = await qi.qiWorkspace.create({
    data: { userId, orgId, name: "Default" },
  });
  return ws.id;
}

/** Reads the active workspace from cookie, validates ownership, falls back to default. */
export async function getActiveWorkspaceId(userId: string, orgId: string): Promise<string> {
  const jar = await cookies();
  const cookieId = jar.get(COOKIE)?.value;

  if (cookieId) {
    const ws = await qi.qiWorkspace.findFirst({ where: { id: cookieId, userId } });
    if (ws) return ws.id;
  }

  return ensureDefaultWorkspace(userId, orgId);
}
