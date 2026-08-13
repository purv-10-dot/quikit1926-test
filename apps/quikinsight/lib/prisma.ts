import { db } from "@quikit/database";

/**
 * Backward-compat proxy: routes that import `prisma` from "@/lib/prisma" and
 * use the old unprefix model names (platformConnection, dataSync, etc.) are
 * automatically redirected to the Qi* models added to the shared schema.
 *
 * Do NOT use `prisma` in new code — import from "@/lib/db" instead.
 */
const QI_ALIASES: Record<string, string> = {
  platformConnection:   "qiPlatformConnection",
  dataSync:             "qiDataSync",
  connectedAccount:     "qiConnectedAccount",
  dashboard:            "qiDashboard",
  emailReportSettings:  "qiEmailReportSettings",
  aiInsightCache:       "qiAiInsightCache",
  invitation:           "qiInvitation",
  dashboardSnapshot:    "qiDashboardSnapshot",
  userRole:             "qiUserRole",
  tokenBalance:         "qiTokenBalance",
  tokenUsageLog:        "qiTokenUsageLog",
  tokenTransaction:     "qiTokenTransaction",
  workspace:            "qiWorkspace",
};

export const prisma = new Proxy(db, {
  get(target, prop) {
    if (typeof prop === "string" && QI_ALIASES[prop]) {
      return (target as Record<string, unknown>)[QI_ALIASES[prop]];
    }
    return (target as Record<string, unknown>)[prop as string];
  },
}) as typeof db & {
  platformConnection:  typeof db.qiPlatformConnection;
  dataSync:            typeof db.qiDataSync;
  connectedAccount:    typeof db.qiConnectedAccount;
  dashboard:           typeof db.qiDashboard;
  emailReportSettings: typeof db.qiEmailReportSettings;
  aiInsightCache:      typeof db.qiAiInsightCache;
  invitation:          typeof db.qiInvitation;
  dashboardSnapshot:   typeof db.qiDashboardSnapshot;
  userRole:            typeof db.qiUserRole;
  tokenBalance:        typeof db.qiTokenBalance;
  tokenUsageLog:       typeof db.qiTokenUsageLog;
  tokenTransaction:    typeof db.qiTokenTransaction;
  workspace:           typeof db.qiWorkspace;
};
