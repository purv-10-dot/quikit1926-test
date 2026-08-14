-- QuikFlow — new schema `app_quikflow` + workflow-automation tables.
-- Additive only: creates a brand-new schema and its tables. Touches no
-- existing schema/table, so it is safe to apply independently.
-- See QUIKFLOW_ARCHITECTURE.md §6 and QuikFlow-PRD §11.

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app_quikflow";

-- CreateEnum
CREATE TYPE "app_quikflow"."WfStatus" AS ENUM ('Draft', 'Active', 'Paused', 'Archived');

-- CreateEnum
CREATE TYPE "app_quikflow"."WfRunStatus" AS ENUM ('running', 'waiting', 'success', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "app_quikflow"."WfStepStatus" AS ENUM ('ok', 'waiting', 'failed', 'skipped');

-- CreateEnum
CREATE TYPE "app_quikflow"."WfScope" AS ENUM ('org', 'personal');

-- CreateEnum
CREATE TYPE "app_quikflow"."WfProvider" AS ENUM ('quikscale', 'quikcrm', 'quikhrms', 'quikinfra', 'quiktrack', 'outlook', 'teams', 'gmail', 'slack', 'sheets', 'webhook');

-- CreateEnum
CREATE TYPE "app_quikflow"."WfApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "app_quikflow"."WfWorkflow" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "app_quikflow"."WfScope" NOT NULL DEFAULT 'personal',
    "ownerId" TEXT NOT NULL,
    "status" "app_quikflow"."WfStatus" NOT NULL DEFAULT 'Draft',
    "trigger" JSONB NOT NULL,
    "graphNodes" JSONB NOT NULL DEFAULT '[]',
    "graphEdges" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastRunAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WfWorkflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikflow"."WfVersion" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "graphNodes" JSONB NOT NULL,
    "graphEdges" JSONB NOT NULL,
    "publishedBy" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WfVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikflow"."WfRun" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "workflowVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "app_quikflow"."WfRunStatus" NOT NULL DEFAULT 'running',
    "triggerData" JSONB NOT NULL DEFAULT '{}',
    "dedupeKey" TEXT NOT NULL,
    "durationMs" INTEGER,
    "error" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "WfRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikflow"."WfStepLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT,
    "status" "app_quikflow"."WfStepStatus" NOT NULL DEFAULT 'ok',
    "resumeAt" TIMESTAMP(3),
    "jobId" TEXT,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WfStepLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikflow"."WfJoinState" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "joinNodeId" TEXT NOT NULL,
    "expected" INTEGER NOT NULL,
    "arrived" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WfJoinState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikflow"."WfSchedule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "cron" TEXT NOT NULL,
    "nextRunAt" TIMESTAMP(3),

    CONSTRAINT "WfSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikflow"."WfConnection" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "app_quikflow"."WfProvider" NOT NULL,
    "label" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'connected',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WfConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikflow"."WfApproval" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "runId" TEXT,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "status" "app_quikflow"."WfApprovalStatus" NOT NULL DEFAULT 'pending',
    "requestedFor" TEXT,
    "decidedBy" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WfApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikflow"."WfAutomationPrincipal" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'QuikFlow Automation',
    "scopes" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WfAutomationPrincipal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikflow"."WfTemplate" (
    "id" TEXT NOT NULL,
    "app" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "description" TEXT,
    "triggerLabel" TEXT,
    "actionLabel" TEXT,
    "graphNodes" JSONB NOT NULL DEFAULT '[]',
    "graphEdges" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "WfTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WfWorkflow_orgId_status_idx" ON "app_quikflow"."WfWorkflow"("orgId", "status");
CREATE INDEX "WfWorkflow_orgId_app_idx" ON "app_quikflow"."WfWorkflow"("orgId", "app");
CREATE INDEX "WfWorkflow_orgId_scope_idx" ON "app_quikflow"."WfWorkflow"("orgId", "scope");
CREATE INDEX "WfWorkflow_orgId_ownerId_idx" ON "app_quikflow"."WfWorkflow"("orgId", "ownerId");

CREATE INDEX "WfVersion_orgId_idx" ON "app_quikflow"."WfVersion"("orgId");
CREATE UNIQUE INDEX "WfVersion_workflowId_version_key" ON "app_quikflow"."WfVersion"("workflowId", "version");

CREATE UNIQUE INDEX "WfRun_orgId_dedupeKey_key" ON "app_quikflow"."WfRun"("orgId", "dedupeKey");
CREATE INDEX "WfRun_orgId_workflowId_startedAt_idx" ON "app_quikflow"."WfRun"("orgId", "workflowId", "startedAt");
CREATE INDEX "WfRun_orgId_status_idx" ON "app_quikflow"."WfRun"("orgId", "status");

CREATE INDEX "WfStepLog_orgId_runId_idx" ON "app_quikflow"."WfStepLog"("orgId", "runId");

CREATE UNIQUE INDEX "WfJoinState_runId_joinNodeId_key" ON "app_quikflow"."WfJoinState"("runId", "joinNodeId");
CREATE INDEX "WfJoinState_orgId_idx" ON "app_quikflow"."WfJoinState"("orgId");

CREATE INDEX "WfSchedule_orgId_nextRunAt_idx" ON "app_quikflow"."WfSchedule"("orgId", "nextRunAt");

CREATE UNIQUE INDEX "WfConnection_orgId_provider_label_key" ON "app_quikflow"."WfConnection"("orgId", "provider", "label");
CREATE INDEX "WfConnection_orgId_provider_idx" ON "app_quikflow"."WfConnection"("orgId", "provider");

CREATE INDEX "WfApproval_orgId_status_idx" ON "app_quikflow"."WfApproval"("orgId", "status");

CREATE UNIQUE INDEX "WfAutomationPrincipal_orgId_key" ON "app_quikflow"."WfAutomationPrincipal"("orgId");

CREATE INDEX "WfTemplate_app_idx" ON "app_quikflow"."WfTemplate"("app");
CREATE INDEX "WfTemplate_category_idx" ON "app_quikflow"."WfTemplate"("category");

-- AddForeignKey
ALTER TABLE "app_quikflow"."WfVersion" ADD CONSTRAINT "WfVersion_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "app_quikflow"."WfWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikflow"."WfRun" ADD CONSTRAINT "WfRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "app_quikflow"."WfWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikflow"."WfStepLog" ADD CONSTRAINT "WfStepLog_runId_fkey" FOREIGN KEY ("runId") REFERENCES "app_quikflow"."WfRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikflow"."WfSchedule" ADD CONSTRAINT "WfSchedule_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "app_quikflow"."WfWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_quikflow"."WfApproval" ADD CONSTRAINT "WfApproval_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "app_quikflow"."WfWorkflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;
