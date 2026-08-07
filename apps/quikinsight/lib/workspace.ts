import { cookies } from "next/headers";
import { db } from "@quikit/database";

const COOKIE = "qi_active_workspace";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const qi = db as any;

export async function ensureDefaultWorkspace(userId: string, orgId: string): Promise<string> {
  const existing = await qi.qiWorkspace.findFirst({ where: { userId } });
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
