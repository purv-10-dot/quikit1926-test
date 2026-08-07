-- Create the app_quikinsight schema before any table DDL runs.
CREATE SCHEMA IF NOT EXISTS "app_quikinsight";

CREATE TABLE IF NOT EXISTS "app_quikinsight"."QiWorkspace" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "orgId"       TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QiWorkspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinsight"."QiPlatformConnection" (
    "id"             TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "orgId"          TEXT NOT NULL,
    "workspaceId"    TEXT NOT NULL,
    "platform"       TEXT NOT NULL,
    "accessToken"    TEXT NOT NULL,
    "refreshToken"   TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes"         TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "metadata"       JSONB NOT NULL DEFAULT '{}',
    "status"         TEXT NOT NULL DEFAULT 'CONNECTED',
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QiPlatformConnection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinsight"."QiDataSync" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "platform"     TEXT NOT NULL,
    "syncType"     TEXT NOT NULL DEFAULT 'incremental',
    "status"       TEXT NOT NULL,
    "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"  TIMESTAMP(3),
    "recordCount"  INTEGER,
    "errorMessage" TEXT,
    CONSTRAINT "QiDataSync_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinsight"."QiConnectedAccount" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "teamId"      TEXT NOT NULL,
    "provider"    TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "credentials" JSONB,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QiConnectedAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinsight"."QiDashboard" (
    "id"        TEXT NOT NULL,
    "teamId"    TEXT NOT NULL,
    "name"      TEXT NOT NULL DEFAULT 'Dashboard',
    "config"    JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QiDashboard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinsight"."QiDashboardSnapshot" (
    "id"          TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "data"        JSONB NOT NULL,
    "snapshotAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QiDashboardSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinsight"."QiEmailReportSettings" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "enabled"    BOOLEAN NOT NULL DEFAULT false,
    "recipients" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "frequency"  TEXT NOT NULL DEFAULT 'WEEKLY',
    "lastSentAt" TIMESTAMP(3),
    CONSTRAINT "QiEmailReportSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinsight"."QiAiInsightCache" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "orgId"       TEXT NOT NULL,
    "data"        JSONB NOT NULL,
    "source"      TEXT NOT NULL DEFAULT 'rules',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QiAiInsightCache_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinsight"."QiUserRole" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "role"      TEXT NOT NULL,
    "teamId"    TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QiUserRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinsight"."QiInvitation" (
    "id"         TEXT NOT NULL,
    "email"      TEXT NOT NULL,
    "orgId"      TEXT NOT NULL,
    "role"       TEXT NOT NULL DEFAULT 'MEMBER',
    "teamId"     TEXT,
    "token"      TEXT NOT NULL,
    "expiresAt"  TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QiInvitation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinsight"."QiTokenBalance" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "orgId"       TEXT NOT NULL,
    "totalTokens" INTEGER NOT NULL DEFAULT 100000,
    "usedTokens"  INTEGER NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QiTokenBalance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinsight"."QiTokenUsageLog" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "orgId"        TEXT NOT NULL,
    "feature"      TEXT NOT NULL,
    "model"        TEXT NOT NULL,
    "inputTokens"  INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalTokens"  INTEGER NOT NULL DEFAULT 0,
    "status"       TEXT NOT NULL DEFAULT 'success',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QiTokenUsageLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikinsight"."QiTokenTransaction" (
    "id"            TEXT NOT NULL,
    "userId"        TEXT NOT NULL,
    "orgId"         TEXT NOT NULL,
    "type"          TEXT NOT NULL,
    "amount"        INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter"  INTEGER NOT NULL,
    "reason"        TEXT NOT NULL,
    "referenceId"   TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QiTokenTransaction_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX IF NOT EXISTS "QiWorkspace_userId_name_key" ON "app_quikinsight"."QiWorkspace"("userId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "QiPlatformConnection_workspaceId_platform_key" ON "app_quikinsight"."QiPlatformConnection"("workspaceId", "platform");
CREATE UNIQUE INDEX IF NOT EXISTS "QiConnectedAccount_userId_provider_key" ON "app_quikinsight"."QiConnectedAccount"("userId", "provider");
CREATE UNIQUE INDEX IF NOT EXISTS "QiEmailReportSettings_userId_key" ON "app_quikinsight"."QiEmailReportSettings"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "QiAiInsightCache_userId_key" ON "app_quikinsight"."QiAiInsightCache"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "QiUserRole_userId_key" ON "app_quikinsight"."QiUserRole"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "QiInvitation_token_key" ON "app_quikinsight"."QiInvitation"("token");
CREATE UNIQUE INDEX IF NOT EXISTS "QiTokenBalance_userId_key" ON "app_quikinsight"."QiTokenBalance"("userId");

-- Lookup indexes
CREATE INDEX IF NOT EXISTS "QiWorkspace_userId_idx" ON "app_quikinsight"."QiWorkspace"("userId");
CREATE INDEX IF NOT EXISTS "QiPlatformConnection_workspaceId_idx" ON "app_quikinsight"."QiPlatformConnection"("workspaceId");
CREATE INDEX IF NOT EXISTS "QiPlatformConnection_userId_idx" ON "app_quikinsight"."QiPlatformConnection"("userId");
CREATE INDEX IF NOT EXISTS "QiPlatformConnection_orgId_idx" ON "app_quikinsight"."QiPlatformConnection"("orgId");
CREATE INDEX IF NOT EXISTS "QiDataSync_userId_connectionId_idx" ON "app_quikinsight"."QiDataSync"("userId", "connectionId");
CREATE INDEX IF NOT EXISTS "QiDataSync_connectionId_startedAt_idx" ON "app_quikinsight"."QiDataSync"("connectionId", "startedAt" DESC);
CREATE INDEX IF NOT EXISTS "QiConnectedAccount_teamId_idx" ON "app_quikinsight"."QiConnectedAccount"("teamId");
CREATE INDEX IF NOT EXISTS "QiConnectedAccount_userId_idx" ON "app_quikinsight"."QiConnectedAccount"("userId");
CREATE INDEX IF NOT EXISTS "QiDashboard_teamId_idx" ON "app_quikinsight"."QiDashboard"("teamId");
CREATE INDEX IF NOT EXISTS "QiDashboardSnapshot_dashboardId_snapshotAt_idx" ON "app_quikinsight"."QiDashboardSnapshot"("dashboardId", "snapshotAt" DESC);
CREATE INDEX IF NOT EXISTS "QiAiInsightCache_orgId_idx" ON "app_quikinsight"."QiAiInsightCache"("orgId");
CREATE INDEX IF NOT EXISTS "QiUserRole_teamId_idx" ON "app_quikinsight"."QiUserRole"("teamId");
CREATE INDEX IF NOT EXISTS "QiInvitation_orgId_idx" ON "app_quikinsight"."QiInvitation"("orgId");
CREATE INDEX IF NOT EXISTS "QiInvitation_email_idx" ON "app_quikinsight"."QiInvitation"("email");
CREATE INDEX IF NOT EXISTS "QiTokenBalance_orgId_idx" ON "app_quikinsight"."QiTokenBalance"("orgId");
CREATE INDEX IF NOT EXISTS "QiTokenUsageLog_userId_createdAt_idx" ON "app_quikinsight"."QiTokenUsageLog"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "QiTokenUsageLog_orgId_createdAt_idx" ON "app_quikinsight"."QiTokenUsageLog"("orgId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "QiTokenTransaction_userId_createdAt_idx" ON "app_quikinsight"."QiTokenTransaction"("userId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "QiTokenTransaction_orgId_createdAt_idx" ON "app_quikinsight"."QiTokenTransaction"("orgId", "createdAt" DESC);

-- Foreign keys
ALTER TABLE "app_quikinsight"."QiPlatformConnection"
    ADD CONSTRAINT "QiPlatformConnection_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "app_quikinsight"."QiWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikinsight"."QiDataSync"
    ADD CONSTRAINT "QiDataSync_connectionId_fkey"
    FOREIGN KEY ("connectionId") REFERENCES "app_quikinsight"."QiPlatformConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app_quikinsight"."QiDashboardSnapshot"
    ADD CONSTRAINT "QiDashboardSnapshot_dashboardId_fkey"
    FOREIGN KEY ("dashboardId") REFERENCES "app_quikinsight"."QiDashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
