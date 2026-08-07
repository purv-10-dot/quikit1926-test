import { prisma } from "@/lib/db/prisma";

// NOTE: function/const names retain the "QuikCrm" label for historical reasons
// (CredFlow was forked from QuikCRM). The slug below is what matters — it scopes
// CredFlow's RBAC roles and app-access to the CredFlow app, not the monorepo
// QuikCRM app. Renaming the identifiers is a separate cosmetic cleanup.
export const QUIKCRM_APP_SLUG = "quikcredflow";
let cachedAppId: string | null = null;
export async function getQuikCrmAppId(): Promise<string | null> {
  if (cachedAppId) return cachedAppId;
  const app = await prisma.app.findUnique({
    where: { slug: QUIKCRM_APP_SLUG },
    select: { id: true },
  });
  if (app) cachedAppId = app.id;
  return cachedAppId;
}
/** Idempotent — grants CredFlow launcher access for this org member. */
export async function ensureQuikCrmAppAccess(opts: {
  userId: string;
  orgId: string;
  grantedBy: string;
}): Promise<void> {
  const appId = await getQuikCrmAppId();
  if (!appId) return;
  const existing = await prisma.userAppAccess.findFirst({
    where: { orgId: opts.orgId, appId, userId: opts.userId },
    select: { id: true },
  });
  if (existing) return;
  await prisma.userAppAccess.create({
    data: {
      userId: opts.userId,
      orgId: opts.orgId,
      appId,
      role: "member",
      grantedBy: opts.grantedBy,
    },
  });
}