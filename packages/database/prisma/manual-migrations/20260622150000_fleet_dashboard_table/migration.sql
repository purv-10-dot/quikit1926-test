-- Fleet Dashboard — 6th Machinery & Equipment module table (one per sidebar item)

CREATE TABLE IF NOT EXISTS "app_quikinfra"."Fleet_dashboard" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "cacheKey" TEXT NOT NULL,
  "projectId" TEXT,
  "periodFrom" TIMESTAMP(3),
  "periodTo" TIMESTAMP(3),
  "payload" JSONB NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Fleet_dashboard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Fleet_dashboard_orgId_cacheKey_key"
  ON "app_quikinfra"."Fleet_dashboard"("orgId", "cacheKey");
CREATE INDEX IF NOT EXISTS "Fleet_dashboard_orgId_idx" ON "app_quikinfra"."Fleet_dashboard"("orgId");
CREATE INDEX IF NOT EXISTS "Fleet_dashboard_projectId_idx" ON "app_quikinfra"."Fleet_dashboard"("projectId");
CREATE INDEX IF NOT EXISTS "Fleet_dashboard_computedAt_idx" ON "app_quikinfra"."Fleet_dashboard"("computedAt");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Fleet_dashboard_orgId_fkey') THEN
    ALTER TABLE "app_quikinfra"."Fleet_dashboard"
      ADD CONSTRAINT "Fleet_dashboard_orgId_fkey"
      FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Fleet_dashboard_projectId_fkey') THEN
    ALTER TABLE "app_quikinfra"."Fleet_dashboard"
      ADD CONSTRAINT "Fleet_dashboard_projectId_fkey"
      FOREIGN KEY ("projectId") REFERENCES "app_quikinfra"."Projects"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
