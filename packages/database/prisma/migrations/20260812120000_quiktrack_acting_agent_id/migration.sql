-- AlterTable
ALTER TABLE "app_quiktrack"."QtIssueComment" ADD COLUMN     "actingAgentId" TEXT;

-- AlterTable
ALTER TABLE "app_quiktrack"."QtIssueHistory" ADD COLUMN     "actingAgentId" TEXT;

-- AlterTable
ALTER TABLE "app_quiktrack"."QtIssueTransitionLog" ADD COLUMN     "actingAgentId" TEXT;
