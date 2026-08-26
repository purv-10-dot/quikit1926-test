-- AlterTable
ALTER TABLE "app_quiktrack"."QtIssueComment" ADD COLUMN     "actorType" TEXT NOT NULL DEFAULT 'user';

-- AlterTable
ALTER TABLE "app_quiktrack"."QtIssueHistory" ADD COLUMN     "actorType" TEXT NOT NULL DEFAULT 'user';

-- AlterTable
ALTER TABLE "app_quiktrack"."QtIssueTransitionLog" ADD COLUMN     "actorType" TEXT NOT NULL DEFAULT 'user';
