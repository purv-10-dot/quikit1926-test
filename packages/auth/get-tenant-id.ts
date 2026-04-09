import { db } from "@quikit/database";
import { getServerSession } from "next-auth";
import { type NextAuthOptions } from "next-auth";

export interface GetTenantIdConfig {
  appSlug?: string;
}

export function createGetTenantId(authOptions: NextAuthOptions, config: GetTenantIdConfig = {}) {
  return async function getTenantId(userId: string): Promise<string | null> {
    const session = await getServerSession(authOptions);
    const tenantId = session?.user?.tenantId;

    if (tenantId) {
      const membership = await db.membership.findFirst({
        where: { userId, tenantId, status: "active" },
      });
      if (!membership) return null;

      // If app slug provided, also verify app access
      if (config.appSlug) {
        const app = await db.app.findUnique({ where: { slug: config.appSlug } });
        if (app) {
          const appAccess = await db.userAppAccess.findUnique({
            where: { userId_tenantId_appId: { userId, tenantId, appId: app.id } },
          });
          if (!appAccess) return null;
        }
      }

      return tenantId;
    }

    const membership = await db.membership.findFirst({
      where: { userId, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    return membership?.tenantId ?? null;
  };
}
