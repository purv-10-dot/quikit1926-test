-- QuikTrack GitHub development integration (Phase 1 schema)
-- 5 additive tables in app_quiktrack + FKs to QtIssue / QtGithubInstallation.
-- Purely additive: no DROP, no ALTER of existing columns.

-- CreateTable
CREATE TABLE "app_quiktrack"."QtGithubInstallation" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "githubAccountLogin" TEXT NOT NULL,
    "githubAccountId" TEXT,
    "targetType" TEXT NOT NULL DEFAULT 'Organization',
    "repoSelection" TEXT NOT NULL DEFAULT 'SELECTED',
    "accessTokenEnc" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "backfillStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "backfilledFrom" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "QtGithubInstallation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quiktrack"."QtGithubRepo" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "installationId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "defaultBranch" TEXT NOT NULL DEFAULT 'main',
    "projectId" TEXT,
    "backfillStatus" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QtGithubRepo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quiktrack"."QtDevBranch" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT,
    "sourceSystem" TEXT NOT NULL DEFAULT 'github',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QtDevBranch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quiktrack"."QtDevCommit" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "sha" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "authorName" TEXT,
    "url" TEXT,
    "committedAt" TIMESTAMP(3),
    "sourceSystem" TEXT NOT NULL DEFAULT 'github',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QtDevCommit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quiktrack"."QtDevPullRequest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "repoId" TEXT NOT NULL,
    "repoFullName" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "url" TEXT,
    "authorName" TEXT,
    "updatedAtGh" TIMESTAMP(3),
    "sourceSystem" TEXT NOT NULL DEFAULT 'github',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QtDevPullRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QtGithubInstallation_orgId_idx" ON "app_quiktrack"."QtGithubInstallation"("orgId");

-- CreateIndex
CREATE INDEX "QtGithubInstallation_githubAccountLogin_idx" ON "app_quiktrack"."QtGithubInstallation"("githubAccountLogin");

-- CreateIndex
CREATE UNIQUE INDEX "QtGithubInstallation_orgId_installationId_key" ON "app_quiktrack"."QtGithubInstallation"("orgId", "installationId");

-- CreateIndex
CREATE INDEX "QtGithubRepo_orgId_idx" ON "app_quiktrack"."QtGithubRepo"("orgId");

-- CreateIndex
CREATE INDEX "QtGithubRepo_installationId_idx" ON "app_quiktrack"."QtGithubRepo"("installationId");

-- CreateIndex
CREATE INDEX "QtGithubRepo_projectId_idx" ON "app_quiktrack"."QtGithubRepo"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "QtGithubRepo_orgId_repoId_key" ON "app_quiktrack"."QtGithubRepo"("orgId", "repoId");

-- CreateIndex
CREATE INDEX "QtDevBranch_orgId_idx" ON "app_quiktrack"."QtDevBranch"("orgId");

-- CreateIndex
CREATE INDEX "QtDevBranch_issueId_idx" ON "app_quiktrack"."QtDevBranch"("issueId");

-- CreateIndex
CREATE INDEX "QtDevBranch_repoId_idx" ON "app_quiktrack"."QtDevBranch"("repoId");

-- CreateIndex
CREATE UNIQUE INDEX "QtDevBranch_issueId_repoId_name_key" ON "app_quiktrack"."QtDevBranch"("issueId", "repoId", "name");

-- CreateIndex
CREATE INDEX "QtDevCommit_orgId_idx" ON "app_quiktrack"."QtDevCommit"("orgId");

-- CreateIndex
CREATE INDEX "QtDevCommit_issueId_idx" ON "app_quiktrack"."QtDevCommit"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "QtDevCommit_repoId_sha_key" ON "app_quiktrack"."QtDevCommit"("repoId", "sha");

-- CreateIndex
CREATE INDEX "QtDevPullRequest_orgId_idx" ON "app_quiktrack"."QtDevPullRequest"("orgId");

-- CreateIndex
CREATE INDEX "QtDevPullRequest_issueId_idx" ON "app_quiktrack"."QtDevPullRequest"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "QtDevPullRequest_repoId_number_key" ON "app_quiktrack"."QtDevPullRequest"("repoId", "number");

-- AddForeignKey
ALTER TABLE "app_quiktrack"."QtGithubRepo" ADD CONSTRAINT "QtGithubRepo_installationId_fkey" FOREIGN KEY ("installationId") REFERENCES "app_quiktrack"."QtGithubInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quiktrack"."QtDevBranch" ADD CONSTRAINT "QtDevBranch_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "app_quiktrack"."QtIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quiktrack"."QtDevCommit" ADD CONSTRAINT "QtDevCommit_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "app_quiktrack"."QtIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quiktrack"."QtDevPullRequest" ADD CONSTRAINT "QtDevPullRequest_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "app_quiktrack"."QtIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

