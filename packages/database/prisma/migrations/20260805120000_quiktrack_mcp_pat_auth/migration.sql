-- CreateTable
CREATE TABLE "app_quiktrack"."QtPersonalAccessToken" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QtPersonalAccessToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quiktrack"."QtRemoteLink" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QtRemoteLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QtPersonalAccessToken_orgId_projectId_idx" ON "app_quiktrack"."QtPersonalAccessToken"("orgId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "QtPersonalAccessToken_tokenHash_key" ON "app_quiktrack"."QtPersonalAccessToken"("tokenHash");

-- CreateIndex
CREATE INDEX "QtRemoteLink_orgId_projectId_idx" ON "app_quiktrack"."QtRemoteLink"("orgId", "projectId");

-- CreateIndex
CREATE INDEX "QtRemoteLink_issueId_createdAt_idx" ON "app_quiktrack"."QtRemoteLink"("issueId", "createdAt");

-- AddForeignKey
ALTER TABLE "app_quiktrack"."QtPersonalAccessToken" ADD CONSTRAINT "QtPersonalAccessToken_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "app_quiktrack"."QtProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quiktrack"."QtRemoteLink" ADD CONSTRAINT "QtRemoteLink_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "app_quiktrack"."QtIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
