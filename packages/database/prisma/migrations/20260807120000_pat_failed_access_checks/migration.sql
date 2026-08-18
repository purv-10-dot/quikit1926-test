-- AlterTable
ALTER TABLE "app_quiktrack"."QtPersonalAccessToken" ADD COLUMN "failedAccessChecks" INTEGER NOT NULL DEFAULT 0;
