import { prisma } from "@/lib/db/prisma";

// This slug scopes CredFlow's RBAC roles and app-access to the CredFlow app,
// NOT the monorepo QuikCRM app (CredFlow was forked from QuikCRM, hence the
// historical "QuikCrm" naming that used to live here). It must match
// `manifest.appId` and the `quikit.App.slug` row for this app.
export const QUIKCREDFLOW_APP_SLUG = "quikcredflow";
let cachedAppId: string | null = null;
export async function getQuikcredflowAppId(): Promise<string | null> {
  if (cachedAppId) return cachedAppId;
  const app = await prisma.app.findUnique({
    where: { slug: QUIKCREDFLOW_APP_SLUG },
    select: { id: true },
  });
  if (app) cachedAppId = app.id;
  return cachedAppId;
}
/** Idempotent — grants CredFlow launcher access for this org member. */
export async function ensureQuikcredflowAppAccess(opts: {
  userId: string;
  orgId: string;
  grantedBy: string;
}): Promise<void> {
  const appId = await getQuikcredflowAppId();
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