-- QuikFlow → Microsoft Teams calendar integration.
-- Adds WfCalendarLink: maps a source-app record (+ kind) to the external
-- calendar event a workflow created for it, giving the calendar action
-- idempotency (re-run/edit updates instead of duplicating) and a record↔event
-- mapping for the calendar view. Purely additive.

-- CreateTable
CREATE TABLE "app_quikflow"."WfCalendarLink" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" "app_quikflow"."WfProvider" NOT NULL,
    "connectionId" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT '',
    "externalEventId" TEXT NOT NULL,
    "webLink" TEXT,
    "joinUrl" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WfCalendarLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WfCalendarLink_orgId_refType_refId_kind_key" ON "app_quikflow"."WfCalendarLink"("orgId", "refType", "refId", "kind");

-- CreateIndex
CREATE INDEX "WfCalendarLink_orgId_provider_idx" ON "app_quikflow"."WfCalendarLink"("orgId", "provider");
