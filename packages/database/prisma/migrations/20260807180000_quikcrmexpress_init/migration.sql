-- QuikCRMExpress (app_quikcrmexpress) — schema init.
--
-- The 101 CrmExpress tables were de-vendored into schema.prisma from the app's
-- private fork, but no migration ever created them: they only existed on the
-- original developer's local Postgres via `prisma db push`. A fresh clone (and
-- every CI run) therefore could not build this app's schema, and
-- 20260807190000_crmexpress_tenantid_to_orgid — which ALTERs these tables —
-- had nothing to alter.
--
-- This migration closes that gap. It is emitted from schema.prisma, so the
-- tables are created in their POST-rename (orgId) shape; the tenantId->orgId
-- migration that follows is guarded and no-ops here. Every statement is
-- re-runnable so installs that already carry the tables are left untouched.
--
-- Ordering note: sequenced immediately BEFORE the tenantId->orgId migration so
-- legacy databases (tables present, still tenantId) skip these CREATEs and go
-- straight to the rename, while fresh databases get the final shape here and
-- skip the rename.

CREATE SCHEMA IF NOT EXISTS "app_quikcrmexpress";

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmOpportunityStage" AS ENUM ('Prospecting', 'Qualification', 'Proposal', 'Negotiation', 'ClosedWon', 'ClosedLost')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmTaskStatus" AS ENUM ('Open', 'InProgress', 'Completed', 'Cancelled')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmTaskPriority" AS ENUM ('Low', 'Medium', 'High')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmAccountSegment" AS ENUM ('Enterprise', 'MidMarket', 'SMB')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmImportJobStatus" AS ENUM ('queued', 'processing', 'completed', 'completed_with_errors', 'dead_letter')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmImportEntityType" AS ENUM ('leads', 'activities', 'workflows', 'sla')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmAutomationStepStatus" AS ENUM ('pending', 'processing', 'completed', 'failed')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmWorkflowStatus" AS ENUM ('Draft', 'Active', 'Paused', 'Archived', 'Draining', 'Stopped', 'Deleted')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmQuoteStatus" AS ENUM ('Draft', 'Active', 'Won', 'Lost', 'Revised')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmQuotePricingMode" AS ENUM ('Exclusive', 'Inclusive')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmQuoteApprovalStatus" AS ENUM ('None', 'Pending', 'Approved', 'Rejected')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmQuoteEngagementStatus" AS ENUM ('NotSent', 'Sent', 'Viewed', 'Signed', 'Accepted', 'Rejected')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmInvoiceStatus" AS ENUM ('Draft', 'Sent', 'Paid', 'Void')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmProductType" AS ENUM ('Product', 'Service', 'Bundle')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmProductTaxonomyKind" AS ENUM ('Category', 'Subcategory', 'Brand', 'Family')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmStockMovementType" AS ENUM ('Receipt', 'Issue', 'Adjustment', 'Reserve', 'Release', 'Transfer')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmOrderStatus" AS ENUM ('Open', 'Confirmed', 'Fulfilled', 'Closed', 'Cancelled')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmFormSurface" AS ENUM ('call_disposition')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmFormSetVersionStatus" AS ENUM ('draft', 'published', 'retired')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmFormFieldTab" AS ENUM ('contact_details', 'call_disposition')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmFormFieldType" AS ENUM ('text', 'datetime', 'dropdown', 'number', 'user_picker', 'file_upload')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmFormFieldRequiredLevel" AS ENUM ('none', 'soft', 'hard')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmFieldValueType" AS ENUM ('text', 'datetime', 'dropdown', 'number', 'user_picker', 'file_upload')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmFormTabVisibility" AS ENUM ('always', 'rule_driven')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmFormRuleMatchType" AS ENUM ('all', 'any')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmFormRuleSubjectKind" AS ENUM ('field', 'stage', 'status', 'sub_stage')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmFormRuleOperator" AS ENUM ('is', 'is_not', 'is_any_of', 'is_none_of', 'is_empty', 'is_not_empty')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmFormRuleActionType" AS ENUM ('show_field', 'hide_field', 'make_mandatory', 'make_optional', 'show_tab', 'set_stage')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmFormRuleTargetKind" AS ENUM ('field', 'section', 'tab', 'stage')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmUserPickerMode" AS ENUM ('single', 'multi')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmUserPickerScope" AS ENUM ('all_users', 'team', 'role')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$CREATE TYPE "app_quikcrmexpress"."CrmFieldVisibility" AS ENUM ('visible', 'hidden')$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmPermissionTemplate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matrix" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPermissionTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmUserPermissionTemplate" (
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "CrmUserPermissionTemplate_pkey" PRIMARY KEY ("userId","templateId")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmUserAccountAccess" (
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "CrmUserAccountAccess_pkey" PRIMARY KEY ("userId","accountId")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmAccount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" TEXT,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "city" TEXT,
    "status" TEXT DEFAULT 'Active',
    "annualRevenueDisplay" TEXT,
    "annualRevenueAmount" DECIMAL(18,2),
    "annualRevenueCurrency" TEXT DEFAULT 'INR',
    "segmentEnum" "app_quikcrmexpress"."CrmAccountSegment",
    "industryKey" TEXT,
    "countryCode" TEXT,
    "state" TEXT,
    "postalCode" TEXT,
    "parentAccountId" TEXT,
    "healthScore" INTEGER,
    "contractStart" TIMESTAMP(3),
    "contractEnd" TIMESTAMP(3),
    "renewalDate" TIMESTAMP(3),
    "npsScore" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultPriceListId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmContact" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "accountId" TEXT,
    "leadId" TEXT,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "city" TEXT,
    "contactStage" TEXT,
    "source" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmContact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmLead" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "company" TEXT,
    "jobTitle" TEXT,
    "source" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'New',
    "status" TEXT NOT NULL DEFAULT 'Open',
    "substatus" TEXT,
    "score" INTEGER NOT NULL DEFAULT 0,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "accountId" TEXT,
    "linkedContactId" TEXT,
    "externalId" TEXT,
    "sourceSystem" TEXT,
    "country" TEXT,
    "industry" TEXT,
    "secondaryEmail" TEXT,
    "website" TEXT,
    "linkedinUrl" TEXT,
    "annualRevenueDisplay" TEXT,
    "descriptionInformation" TEXT,
    "leadQuality" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "leadType" TEXT,
    "contactLinkedinUrl" TEXT,
    "requirementDetails" JSONB,
    "isDisengaged" BOOLEAN NOT NULL DEFAULT false,
    "isStarred" BOOLEAN NOT NULL DEFAULT false,
    "followupPriority" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "area" TEXT,
    "cityName" TEXT,
    "stateName" TEXT,
    "postalCode" TEXT,
    "lat" DOUBLE PRECISION,
    "long" DOUBLE PRECISION,
    "convertedAt" TIMESTAMP(3),
    "dynamicFields" JSONB,
    "doNotEmail" BOOLEAN,
    "unsubscribed" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."LeadSquaredSyncMap" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "crmLeadId" TEXT NOT NULL,
    "lsqProspectId" TEXT,
    "syncOrigin" TEXT NOT NULL,
    "lastPayloadHash" TEXT,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSquaredSyncMap_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmLeadAttachment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmLeadAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmLeadListView" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLeadListView_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmLeadSavedList" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filters" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLeadSavedList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmLeadSource" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLeadSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmOpportunity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" "app_quikcrmexpress"."CrmOpportunityStage" NOT NULL DEFAULT 'Prospecting',
    "probability" INTEGER NOT NULL DEFAULT 10,
    "amount" DECIMAL(18,2),
    "currency" TEXT DEFAULT 'INR',
    "closeDate" TIMESTAMP(3),
    "accountId" TEXT,
    "leadId" TEXT,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "weightedAmount" DECIMAL(18,2),
    "closeReason" TEXT,
    "closeReasonCategory" TEXT,
    "competitorName" TEXT,
    "lastStageChangeAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "priceListId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmOpportunity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmOpportunityClientMeeting" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "meetingAt" TIMESTAMP(3) NOT NULL,
    "meetingType" TEXT,
    "competitorName" TEXT,
    "outcome" TEXT,
    "attendees" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmOpportunityClientMeeting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmOpportunityProduct" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountPct" INTEGER NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmOpportunityProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmOpportunityStageTransition" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "fromStage" "app_quikcrmexpress"."CrmOpportunityStage" NOT NULL,
    "toStage" "app_quikcrmexpress"."CrmOpportunityStage" NOT NULL,
    "changedByUserId" TEXT,
    "changedByName" TEXT,
    "closeReason" TEXT,
    "closeReasonCategory" TEXT,
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmOpportunityStageTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmActivity" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "relatedKind" TEXT NOT NULL,
    "relatedObjectId" TEXT NOT NULL,
    "subject" TEXT,
    "outcome" TEXT,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "externalId" TEXT,
    "sourceSystem" TEXT,
    "occurredAt" TIMESTAMP(3),
    "outreach" JSONB,
    "activityCode" TEXT,
    "logOutcome" TEXT,
    "detailNotes" TEXT,
    "followUpAt" TIMESTAMP(3),
    "opportunityId" TEXT,
    "linkedCallLogId" TEXT,
    "leadId" TEXT,
    "relatedOrphanedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmActivity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmTask" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "taskType" TEXT,
    "priority" "app_quikcrmexpress"."CrmTaskPriority" NOT NULL DEFAULT 'Medium',
    "dueDate" TIMESTAMP(3),
    "status" "app_quikcrmexpress"."CrmTaskStatus" NOT NULL DEFAULT 'Open',
    "assignedToUserId" TEXT,
    "createdByUserId" TEXT,
    "relatedKind" TEXT,
    "relatedObjectId" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmNote" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "relatedKind" TEXT NOT NULL,
    "relatedObjectId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmCompanyProfile" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "logoUrl" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "industry" TEXT,
    "employees" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCompanyProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmOrgWorkspaceSettings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "settings" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmOrgWorkspaceSettings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmQuickFilter" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "filterConfig" JSONB NOT NULL,
    "isLastApplied" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmQuickFilter_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmDashboardPin" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmDashboardPin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmCampaign" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "type" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmLandingPage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLandingPage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmWebWidget" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmWebWidget_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmFormDefinition" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "config" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmAutomationRule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmAutomationRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmWorkflowDefinition" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "app_quikcrmexpress"."CrmWorkflowStatus" NOT NULL DEFAULT 'Draft',
    "triggerSummary" TEXT,
    "triggerType" TEXT,
    "scope" TEXT,
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "externalId" TEXT,
    "sourceSystem" TEXT,
    "lastPublishedOn" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "graphNodes" JSONB NOT NULL,
    "graphEdges" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmWorkflowDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmAutomationPendingStep" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "resumeNodeId" TEXT NOT NULL,
    "resumeAt" TIMESTAMP(3) NOT NULL,
    "status" "app_quikcrmexpress"."CrmAutomationStepStatus" NOT NULL DEFAULT 'pending',
    "ownerSnapshot" TEXT,
    "bullJobId" TEXT,
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmAutomationPendingStep_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmAutomationDistributionState" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "lastIndex" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmAutomationDistributionState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmAutomationLeadDayCount" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "terminated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmAutomationLeadDayCount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmAutomationAttribution" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "engineSource" TEXT NOT NULL,
    "workflowId" TEXT,
    "nodeId" TEXT,
    "ruleId" TEXT,
    "triggerEventId" TEXT,
    "triggerType" TEXT,
    "field" TEXT NOT NULL,
    "beforeValue" TEXT,
    "afterValue" TEXT,
    "triggerSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmAutomationAttribution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmProcessDefinition" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmProcessDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmSlaRule" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetHours" INTEGER NOT NULL,
    "appliesTo" TEXT,
    "externalId" TEXT,
    "sourceSystem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSlaRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmSlaLeadTracking" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "breachAtLabel" TEXT,
    "breachAt" TIMESTAMP(3),
    "externalId" TEXT,
    "sourceSystem" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSlaLeadTracking_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmTelephonyProvider" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmTelephonyProvider_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmVirtualNumber" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "label" TEXT,
    "providerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmVirtualNumber_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmCallLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT,
    "agentUserId" TEXT,
    "callSid" TEXT,
    "sourceNumber" TEXT,
    "destinationNumber" TEXT,
    "direction" TEXT,
    "status" TEXT,
    "durationSec" INTEGER,
    "talkSec" INTEGER,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "recordingUrl" TEXT,
    "disposition" TEXT,
    "notes" TEXT,
    "rawPayload" JSONB,
    "providerCallSid" TEXT,
    "dispositionName" TEXT,
    "callDispositionId" TEXT,
    "smbDispositionSnapshot" TEXT,
    "smbSubDispositionSnapshot" TEXT,
    "smbSubSubDispositionSnapshot" TEXT,
    "ownerName" TEXT,
    "linkedContactId" TEXT,
    "linkedPartyDisplay" TEXT,
    "webhookStatus" TEXT,
    "endedBy" TEXT,
    "followUpAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCallLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmCallDisposition" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "triggersPaymentVerification" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB,
    "name" TEXT,
    "smbDispositionValue" TEXT,
    "smbSubDispositionValue" TEXT,
    "smbSubSubDispositionValue" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "targetLeadStage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmCallDisposition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmCtcCallAudit" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "agentUserId" TEXT,
    "partyA" TEXT,
    "partyB" TEXT,
    "callSid" TEXT,
    "providerName" TEXT,
    "responseStatus" INTEGER,
    "providerType" TEXT,
    "message" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "httpStatus" INTEGER,
    "errorMessage" TEXT,
    "providerResponse" TEXT,
    "kind" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmCtcCallAudit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmIndiaVoiceWebhookLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "callSid" TEXT,
    "campid" TEXT,
    "vendorEventType" TEXT,
    "sourceNumber" TEXT,
    "destinationNumber" TEXT,
    "dialWhomNumber" TEXT,
    "status" TEXT,
    "callDurationSec" INTEGER,
    "talkDurationSec" INTEGER,
    "coins" INTEGER,
    "direction" TEXT,
    "callRecordingUrl" TEXT,
    "startTime" TIMESTAMP(3),
    "endTime" TIMESTAMP(3),
    "matchedCallLogId" TEXT,
    "rawPayload" JSONB NOT NULL,
    "processDedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmIndiaVoiceWebhookLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmLeadImportJob" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "fileName" TEXT,
    "status" "app_quikcrmexpress"."CrmImportJobStatus" NOT NULL DEFAULT 'queued',
    "entityType" "app_quikcrmexpress"."CrmImportEntityType" NOT NULL,
    "sourceType" TEXT,
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessages" JSONB,
    "rowErrors" JSONB,
    "payloadCsvText" TEXT,
    "payloadJsonText" TEXT,
    "sourceSystem" TEXT,
    "idempotencyKey" TEXT,
    "batchId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdByUserId" TEXT,
    "queuedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "deadLetteredAt" TIMESTAMP(3),
    "lastError" TEXT,
    "bullJobId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLeadImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmReportDefinition" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmReportDefinition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmNotification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "category" TEXT,
    "link" TEXT,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmOutboundMessageLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "to" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "metadata" JSONB,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmOutboundMessageLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmAttendanceLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "checkIn" TIMESTAMP(3) NOT NULL,
    "checkOut" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmAttendanceLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmSalesTeam" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSalesTeam_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmSalesGroup" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSalesGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmSalesGroupMember" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CrmSalesGroupMember_pkey" PRIMARY KEY ("groupId","userId")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmSalesGroupManager" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CrmSalesGroupManager_pkey" PRIMARY KEY ("groupId","userId")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmSalesGroupAccount" (
    "groupId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "CrmSalesGroupAccount_pkey" PRIMARY KEY ("groupId","accountId")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmAuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "resourceId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmIntegrationConfig" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "credentialsEncrypted" TEXT,
    "config" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmIntegrationConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmPaymentVerification" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT,
    "callLogId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "externalId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPaymentVerification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmDocumentFolder" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentFolderId" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CrmDocumentFolder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmDocument" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "folderId" TEXT,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmDocumentLink" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "targetFolderId" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CrmDocumentLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmProductTaxonomy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "kind" "app_quikcrmexpress"."CrmProductTaxonomyKind" NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmProductTaxonomy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmProduct" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "category" TEXT,
    "categoryId" TEXT,
    "subcategoryId" TEXT,
    "brandId" TEXT,
    "familyId" TEXT,
    "barcode" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hsnCode" TEXT,
    "sacCode" TEXT,
    "unitGroup" TEXT NOT NULL DEFAULT 'Each',
    "defaultUnit" TEXT NOT NULL DEFAULT 'Each',
    "standardCost" DECIMAL(18,2),
    "listPrice" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "gstRate" DECIMAL(5,2) NOT NULL,
    "cgstRate" DECIMAL(5,2),
    "sgstRate" DECIMAL(5,2),
    "igstRate" DECIMAL(5,2),
    "manufacturer" TEXT,
    "warrantyMonths" INTEGER,
    "weightKg" DECIMAL(10,3),
    "lengthCm" DECIMAL(10,2),
    "widthCm" DECIMAL(10,2),
    "heightCm" DECIMAL(10,2),
    "serialTracked" BOOLEAN NOT NULL DEFAULT false,
    "dynamicFields" JSONB,
    "description" TEXT,
    "imageUrl" TEXT,
    "productType" "app_quikcrmexpress"."CrmProductType" NOT NULL DEFAULT 'Product',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deletedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmProduct_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmProductVariant" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT,
    "attributes" JSONB,
    "barcode" TEXT,
    "listPrice" DECIMAL(18,2),
    "standardCost" DECIMAL(18,2),
    "gstRate" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmWarehouse" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmWarehouse_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmProductInventory" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "quantityOnHand" INTEGER NOT NULL DEFAULT 0,
    "quantityReserved" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmProductInventory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmStockMovement" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "movementType" "app_quikcrmexpress"."CrmStockMovementType" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmStockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmProductImage" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmProductImage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmPriceList" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "regionCode" TEXT,
    "customerTier" TEXT,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "sourcePriceListId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPriceList_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmPriceListItem" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "floorPrice" DECIMAL(18,2),
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPriceListItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmPriceListAuditLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "priceListId" TEXT NOT NULL,
    "itemId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "changes" JSONB,
    "userId" TEXT,
    "userName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmPriceListAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmQuote" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "parentQuoteId" TEXT,
    "accountId" TEXT NOT NULL,
    "contactId" TEXT,
    "opportunityId" TEXT,
    "priceListId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "status" "app_quikcrmexpress"."CrmQuoteStatus" NOT NULL DEFAULT 'Draft',
    "pricingMode" "app_quikcrmexpress"."CrmQuotePricingMode" NOT NULL DEFAULT 'Exclusive',
    "companyState" TEXT,
    "billingState" TEXT,
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalLineDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "overallDiscountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "freightAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "roundOffAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grandTotalInWords" TEXT,
    "termsText" TEXT,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "sentAt" TIMESTAMP(3),
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "lostReason" TEXT,
    "lostNotes" TEXT,
    "templateKey" TEXT NOT NULL DEFAULT 'b2b-standard',
    "approvalStatus" "app_quikcrmexpress"."CrmQuoteApprovalStatus" NOT NULL DEFAULT 'None',
    "engagementStatus" "app_quikcrmexpress"."CrmQuoteEngagementStatus" NOT NULL DEFAULT 'NotSent',
    "portalTokenHash" TEXT,
    "portalExpiresAt" TIMESTAMP(3),
    "firstViewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "lastViewedIp" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "customerComment" TEXT,
    "signedAt" TIMESTAMP(3),
    "signatureJson" JSONB,
    "signatureOtpVerified" BOOLEAN NOT NULL DEFAULT false,
    "watermarkText" TEXT,
    "bankDetailsJson" JSONB,
    "lockedSnapshotAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmQuote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmQuoteLine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "hsnCode" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Each',
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmQuoteLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmQuoteStatusTransition" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "fromStatus" "app_quikcrmexpress"."CrmQuoteStatus" NOT NULL,
    "toStatus" "app_quikcrmexpress"."CrmQuoteStatus" NOT NULL,
    "changedByUserId" TEXT,
    "changedByName" TEXT,
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmQuoteStatusTransition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmQuoteTemplate" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "layout" TEXT NOT NULL DEFAULT 'b2b',
    "themeColor" TEXT NOT NULL DEFAULT '#1d4ed8',
    "headerHtml" TEXT,
    "footerHtml" TEXT,
    "termsDefault" TEXT,
    "bankDetailsJson" JSONB,
    "watermarkText" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmQuoteTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmQuoteApproval" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "status" "app_quikcrmexpress"."CrmQuoteApprovalStatus" NOT NULL DEFAULT 'Pending',
    "triggerReason" TEXT NOT NULL,
    "requestedById" TEXT,
    "requestedByName" TEXT,
    "decidedById" TEXT,
    "decidedByName" TEXT,
    "decisionNotes" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),

    CONSTRAINT "CrmQuoteApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmQuotePdfSnapshot" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "templateKey" TEXT NOT NULL,
    "documentId" TEXT,
    "storageKey" TEXT,
    "contentHash" TEXT,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL DEFAULT 'application/pdf',
    "size" INTEGER NOT NULL DEFAULT 0,
    "isLocked" BOOLEAN NOT NULL DEFAULT true,
    "generatedById" TEXT,
    "generatedByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmQuotePdfSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmQuoteComment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "mentions" JSONB,
    "authorId" TEXT,
    "authorName" TEXT,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmQuoteComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmQuoteEngagementEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmQuoteEngagementEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmQuotePortalAccess" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "CrmQuotePortalAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmInvoice" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "quoteId" TEXT,
    "orderId" TEXT,
    "accountId" TEXT,
    "contactId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "app_quikcrmexpress"."CrmInvoiceStatus" NOT NULL DEFAULT 'Draft',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "freightAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grandTotalInWords" TEXT,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "termsText" TEXT,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmInvoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmSequence" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmSequence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmOrder" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "quoteId" TEXT,
    "opportunityId" TEXT,
    "accountId" TEXT,
    "contactId" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "status" "app_quikcrmexpress"."CrmOrderStatus" NOT NULL DEFAULT 'Open',
    "subtotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "totalDiscount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "freightAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "grandTotalInWords" TEXT,
    "orderDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expectedDeliveryDate" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "internalNotes" TEXT,
    "termsText" TEXT,
    "ownerId" TEXT,
    "ownerName" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmOrderLine" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "sku" TEXT,
    "hsnCode" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'Each',
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountPct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxableAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "gstRate" DECIMAL(5,2) NOT NULL,
    "cgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmLeadStatus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "CrmLeadStatus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmLeadSubStatus" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "CrmLeadSubStatus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmLeadStatusSubStatus" (
    "id" TEXT NOT NULL,
    "leadStatusId" TEXT NOT NULL,
    "leadSubStatusId" TEXT NOT NULL,

    CONSTRAINT "CrmLeadStatusSubStatus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmFormSet" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "surface" "app_quikcrmexpress"."CrmFormSurface" NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "currentVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmFormSetVersion" (
    "id" TEXT NOT NULL,
    "formSetId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "status" "app_quikcrmexpress"."CrmFormSetVersionStatus" NOT NULL DEFAULT 'draft',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormSetVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmFormField" (
    "id" TEXT NOT NULL,
    "formSetVersionId" TEXT NOT NULL,
    "tab" "app_quikcrmexpress"."CrmFormFieldTab" NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" "app_quikcrmexpress"."CrmFormFieldType" NOT NULL,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "requiredLevel" "app_quikcrmexpress"."CrmFormFieldRequiredLevel" NOT NULL DEFAULT 'soft',
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "formTabId" TEXT,
    "formSectionId" TEXT,
    "userPickerMode" "app_quikcrmexpress"."CrmUserPickerMode",
    "userPickerScope" "app_quikcrmexpress"."CrmUserPickerScope",
    "defaultVisibility" "app_quikcrmexpress"."CrmFieldVisibility" NOT NULL DEFAULT 'visible',

    CONSTRAINT "CrmFormField_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmFormFieldOption" (
    "id" TEXT NOT NULL,
    "formFieldId" TEXT NOT NULL,
    "valueKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormFieldOption_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmFieldValue" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "formSetVersionId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "valueType" "app_quikcrmexpress"."CrmFieldValueType" NOT NULL,
    "valueText" TEXT,
    "valueNumber" DECIMAL(18,4),
    "valueDatetime" TIMESTAMP(3),
    "valueFileId" TEXT,
    "valueUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmFieldValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmSetSelectionLog" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "activityId" TEXT,
    "defaultSetId" TEXT NOT NULL,
    "chosenSetId" TEXT NOT NULL,
    "formSetVersionId" TEXT NOT NULL,
    "wasOverridden" BOOLEAN NOT NULL,
    "chosenBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmSetSelectionLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmFormSetMappingRule" (
    "id" TEXT NOT NULL,
    "formSetVersionId" TEXT NOT NULL,
    "trigger" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormSetMappingRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmFormTab" (
    "id" TEXT NOT NULL,
    "formSetVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "visibility" "app_quikcrmexpress"."CrmFormTabVisibility" NOT NULL DEFAULT 'always',
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormTab_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmFormSection" (
    "id" TEXT NOT NULL,
    "formTabId" TEXT NOT NULL,
    "name" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmFormRule" (
    "id" TEXT NOT NULL,
    "formSetVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchType" "app_quikcrmexpress"."CrmFormRuleMatchType" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormRule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmFormRuleCondition" (
    "id" TEXT NOT NULL,
    "formRuleId" TEXT NOT NULL,
    "subjectKind" "app_quikcrmexpress"."CrmFormRuleSubjectKind" NOT NULL,
    "subjectFieldKey" TEXT,
    "operator" "app_quikcrmexpress"."CrmFormRuleOperator" NOT NULL,
    "valueKeys" JSONB,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormRuleCondition_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmFormRuleAction" (
    "id" TEXT NOT NULL,
    "formRuleId" TEXT NOT NULL,
    "actionType" "app_quikcrmexpress"."CrmFormRuleActionType" NOT NULL,
    "targetKind" "app_quikcrmexpress"."CrmFormRuleTargetKind" NOT NULL,
    "targetFieldKey" TEXT,
    "targetTabId" TEXT,
    "setStatusId" TEXT,
    "setSubStatusId" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormRuleAction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."CrmFileAttachment" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmFileAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."AppRole" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,

    CONSTRAINT "AppRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."RolePermission" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."RoleNavigation" (
    "id" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "navKey" TEXT NOT NULL,

    CONSTRAINT "RoleNavigation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."UserAppRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assignedBy" TEXT,

    CONSTRAINT "UserAppRole_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "app_quikcrmexpress"."UserPermissionExtra" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "grantedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPermissionExtra_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CrmPermissionTemplate_orgId_idx" ON "app_quikcrmexpress"."CrmPermissionTemplate"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmPermissionTemplate_orgId_name_key" ON "app_quikcrmexpress"."CrmPermissionTemplate"("orgId", "name");

CREATE INDEX IF NOT EXISTS "CrmAccount_orgId_idx" ON "app_quikcrmexpress"."CrmAccount"("orgId");

CREATE INDEX IF NOT EXISTS "CrmAccount_orgId_name_idx" ON "app_quikcrmexpress"."CrmAccount"("orgId", "name");

CREATE INDEX IF NOT EXISTS "CrmAccount_orgId_ownerId_idx" ON "app_quikcrmexpress"."CrmAccount"("orgId", "ownerId");

CREATE INDEX IF NOT EXISTS "CrmAccount_orgId_status_idx" ON "app_quikcrmexpress"."CrmAccount"("orgId", "status");

CREATE INDEX IF NOT EXISTS "CrmAccount_orgId_deletedAt_idx" ON "app_quikcrmexpress"."CrmAccount"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "CrmAccount_orgId_parentAccountId_idx" ON "app_quikcrmexpress"."CrmAccount"("orgId", "parentAccountId");

CREATE INDEX IF NOT EXISTS "CrmAccount_orgId_industryKey_idx" ON "app_quikcrmexpress"."CrmAccount"("orgId", "industryKey");

CREATE INDEX IF NOT EXISTS "CrmAccount_orgId_segmentEnum_idx" ON "app_quikcrmexpress"."CrmAccount"("orgId", "segmentEnum");

CREATE INDEX IF NOT EXISTS "CrmAccount_orgId_defaultPriceListId_idx" ON "app_quikcrmexpress"."CrmAccount"("orgId", "defaultPriceListId");

CREATE INDEX IF NOT EXISTS "CrmContact_orgId_idx" ON "app_quikcrmexpress"."CrmContact"("orgId");

CREATE INDEX IF NOT EXISTS "CrmContact_orgId_email_idx" ON "app_quikcrmexpress"."CrmContact"("orgId", "email");

CREATE INDEX IF NOT EXISTS "CrmContact_orgId_accountId_idx" ON "app_quikcrmexpress"."CrmContact"("orgId", "accountId");

CREATE INDEX IF NOT EXISTS "CrmContact_orgId_ownerId_idx" ON "app_quikcrmexpress"."CrmContact"("orgId", "ownerId");

CREATE INDEX IF NOT EXISTS "CrmContact_orgId_phone_idx" ON "app_quikcrmexpress"."CrmContact"("orgId", "phone");

CREATE INDEX IF NOT EXISTS "CrmContact_orgId_deletedAt_idx" ON "app_quikcrmexpress"."CrmContact"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "CrmLead_orgId_idx" ON "app_quikcrmexpress"."CrmLead"("orgId");

CREATE INDEX IF NOT EXISTS "CrmLead_orgId_stage_idx" ON "app_quikcrmexpress"."CrmLead"("orgId", "stage");

CREATE INDEX IF NOT EXISTS "CrmLead_orgId_ownerId_idx" ON "app_quikcrmexpress"."CrmLead"("orgId", "ownerId");

CREATE INDEX IF NOT EXISTS "CrmLead_orgId_accountId_idx" ON "app_quikcrmexpress"."CrmLead"("orgId", "accountId");

CREATE INDEX IF NOT EXISTS "CrmLead_orgId_isStarred_idx" ON "app_quikcrmexpress"."CrmLead"("orgId", "isStarred");

CREATE INDEX IF NOT EXISTS "CrmLead_orgId_deletedAt_idx" ON "app_quikcrmexpress"."CrmLead"("orgId", "deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmLead_orgId_sourceSystem_externalId_key" ON "app_quikcrmexpress"."CrmLead"("orgId", "sourceSystem", "externalId");

CREATE UNIQUE INDEX IF NOT EXISTS "LeadSquaredSyncMap_crmLeadId_key" ON "app_quikcrmexpress"."LeadSquaredSyncMap"("crmLeadId");

CREATE INDEX IF NOT EXISTS "LeadSquaredSyncMap_orgId_idx" ON "app_quikcrmexpress"."LeadSquaredSyncMap"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "LeadSquaredSyncMap_orgId_lsqProspectId_key" ON "app_quikcrmexpress"."LeadSquaredSyncMap"("orgId", "lsqProspectId");

CREATE INDEX IF NOT EXISTS "CrmLeadAttachment_orgId_leadId_idx" ON "app_quikcrmexpress"."CrmLeadAttachment"("orgId", "leadId");

CREATE INDEX IF NOT EXISTS "CrmLeadAttachment_orgId_idx" ON "app_quikcrmexpress"."CrmLeadAttachment"("orgId");

CREATE INDEX IF NOT EXISTS "CrmLeadListView_orgId_userId_idx" ON "app_quikcrmexpress"."CrmLeadListView"("orgId", "userId");

CREATE INDEX IF NOT EXISTS "CrmLeadListView_orgId_idx" ON "app_quikcrmexpress"."CrmLeadListView"("orgId");

CREATE INDEX IF NOT EXISTS "CrmLeadSavedList_orgId_userId_idx" ON "app_quikcrmexpress"."CrmLeadSavedList"("orgId", "userId");

CREATE INDEX IF NOT EXISTS "CrmLeadSavedList_orgId_idx" ON "app_quikcrmexpress"."CrmLeadSavedList"("orgId");

CREATE INDEX IF NOT EXISTS "CrmLeadSource_orgId_idx" ON "app_quikcrmexpress"."CrmLeadSource"("orgId");

CREATE INDEX IF NOT EXISTS "CrmLeadSource_orgId_active_idx" ON "app_quikcrmexpress"."CrmLeadSource"("orgId", "active");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmLeadSource_orgId_name_key" ON "app_quikcrmexpress"."CrmLeadSource"("orgId", "name");

CREATE INDEX IF NOT EXISTS "CrmOpportunity_orgId_idx" ON "app_quikcrmexpress"."CrmOpportunity"("orgId");

CREATE INDEX IF NOT EXISTS "CrmOpportunity_orgId_stage_idx" ON "app_quikcrmexpress"."CrmOpportunity"("orgId", "stage");

CREATE INDEX IF NOT EXISTS "CrmOpportunity_orgId_accountId_idx" ON "app_quikcrmexpress"."CrmOpportunity"("orgId", "accountId");

CREATE INDEX IF NOT EXISTS "CrmOpportunity_orgId_ownerId_idx" ON "app_quikcrmexpress"."CrmOpportunity"("orgId", "ownerId");

CREATE INDEX IF NOT EXISTS "CrmOpportunity_orgId_deletedAt_idx" ON "app_quikcrmexpress"."CrmOpportunity"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "CrmOpportunity_orgId_priceListId_idx" ON "app_quikcrmexpress"."CrmOpportunity"("orgId", "priceListId");

CREATE INDEX IF NOT EXISTS "CrmOpportunityClientMeeting_orgId_opportunityId_idx" ON "app_quikcrmexpress"."CrmOpportunityClientMeeting"("orgId", "opportunityId");

CREATE INDEX IF NOT EXISTS "CrmOpportunityClientMeeting_orgId_idx" ON "app_quikcrmexpress"."CrmOpportunityClientMeeting"("orgId");

CREATE INDEX IF NOT EXISTS "CrmOpportunityProduct_orgId_opportunityId_idx" ON "app_quikcrmexpress"."CrmOpportunityProduct"("orgId", "opportunityId");

CREATE INDEX IF NOT EXISTS "CrmOpportunityProduct_orgId_idx" ON "app_quikcrmexpress"."CrmOpportunityProduct"("orgId");

CREATE INDEX IF NOT EXISTS "CrmOpportunityStageTransition_orgId_opportunityId_occurredA_idx" ON "app_quikcrmexpress"."CrmOpportunityStageTransition"("orgId", "opportunityId", "occurredAt");

CREATE INDEX IF NOT EXISTS "CrmOpportunityStageTransition_orgId_idx" ON "app_quikcrmexpress"."CrmOpportunityStageTransition"("orgId");

CREATE INDEX IF NOT EXISTS "CrmActivity_orgId_idx" ON "app_quikcrmexpress"."CrmActivity"("orgId");

CREATE INDEX IF NOT EXISTS "CrmActivity_orgId_relatedKind_relatedObjectId_idx" ON "app_quikcrmexpress"."CrmActivity"("orgId", "relatedKind", "relatedObjectId");

CREATE INDEX IF NOT EXISTS "CrmActivity_orgId_ownerId_occurredAt_idx" ON "app_quikcrmexpress"."CrmActivity"("orgId", "ownerId", "occurredAt");

CREATE INDEX IF NOT EXISTS "CrmActivity_orgId_relatedOrphanedAt_idx" ON "app_quikcrmexpress"."CrmActivity"("orgId", "relatedOrphanedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmActivity_orgId_sourceSystem_externalId_key" ON "app_quikcrmexpress"."CrmActivity"("orgId", "sourceSystem", "externalId");

CREATE INDEX IF NOT EXISTS "CrmTask_orgId_idx" ON "app_quikcrmexpress"."CrmTask"("orgId");

CREATE INDEX IF NOT EXISTS "CrmTask_orgId_assignedToUserId_idx" ON "app_quikcrmexpress"."CrmTask"("orgId", "assignedToUserId");

CREATE INDEX IF NOT EXISTS "CrmTask_orgId_status_idx" ON "app_quikcrmexpress"."CrmTask"("orgId", "status");

CREATE INDEX IF NOT EXISTS "CrmNote_orgId_relatedKind_relatedObjectId_idx" ON "app_quikcrmexpress"."CrmNote"("orgId", "relatedKind", "relatedObjectId");

CREATE INDEX IF NOT EXISTS "CrmNote_orgId_idx" ON "app_quikcrmexpress"."CrmNote"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmCompanyProfile_orgId_key" ON "app_quikcrmexpress"."CrmCompanyProfile"("orgId");

CREATE INDEX IF NOT EXISTS "CrmCompanyProfile_orgId_idx" ON "app_quikcrmexpress"."CrmCompanyProfile"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmOrgWorkspaceSettings_orgId_key" ON "app_quikcrmexpress"."CrmOrgWorkspaceSettings"("orgId");

CREATE INDEX IF NOT EXISTS "CrmOrgWorkspaceSettings_orgId_idx" ON "app_quikcrmexpress"."CrmOrgWorkspaceSettings"("orgId");

CREATE INDEX IF NOT EXISTS "CrmQuickFilter_orgId_userId_module_idx" ON "app_quikcrmexpress"."CrmQuickFilter"("orgId", "userId", "module");

CREATE INDEX IF NOT EXISTS "CrmQuickFilter_orgId_idx" ON "app_quikcrmexpress"."CrmQuickFilter"("orgId");

CREATE INDEX IF NOT EXISTS "CrmDashboardPin_orgId_userId_idx" ON "app_quikcrmexpress"."CrmDashboardPin"("orgId", "userId");

CREATE INDEX IF NOT EXISTS "CrmDashboardPin_orgId_idx" ON "app_quikcrmexpress"."CrmDashboardPin"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmDashboardPin_orgId_userId_reportId_key" ON "app_quikcrmexpress"."CrmDashboardPin"("orgId", "userId", "reportId");

CREATE INDEX IF NOT EXISTS "CrmCampaign_orgId_idx" ON "app_quikcrmexpress"."CrmCampaign"("orgId");

CREATE INDEX IF NOT EXISTS "CrmLandingPage_orgId_idx" ON "app_quikcrmexpress"."CrmLandingPage"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmLandingPage_orgId_slug_key" ON "app_quikcrmexpress"."CrmLandingPage"("orgId", "slug");

CREATE INDEX IF NOT EXISTS "CrmWebWidget_orgId_idx" ON "app_quikcrmexpress"."CrmWebWidget"("orgId");

CREATE INDEX IF NOT EXISTS "CrmFormDefinition_orgId_idx" ON "app_quikcrmexpress"."CrmFormDefinition"("orgId");

CREATE INDEX IF NOT EXISTS "CrmAutomationRule_orgId_isActive_sortOrder_idx" ON "app_quikcrmexpress"."CrmAutomationRule"("orgId", "isActive", "sortOrder");

CREATE INDEX IF NOT EXISTS "CrmAutomationRule_orgId_idx" ON "app_quikcrmexpress"."CrmAutomationRule"("orgId");

CREATE INDEX IF NOT EXISTS "CrmWorkflowDefinition_orgId_idx" ON "app_quikcrmexpress"."CrmWorkflowDefinition"("orgId");

CREATE INDEX IF NOT EXISTS "CrmWorkflowDefinition_orgId_status_idx" ON "app_quikcrmexpress"."CrmWorkflowDefinition"("orgId", "status");

CREATE INDEX IF NOT EXISTS "CrmWorkflowDefinition_orgId_deletedAt_idx" ON "app_quikcrmexpress"."CrmWorkflowDefinition"("orgId", "deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmWorkflowDefinition_orgId_sourceSystem_externalId_key" ON "app_quikcrmexpress"."CrmWorkflowDefinition"("orgId", "sourceSystem", "externalId");

CREATE INDEX IF NOT EXISTS "CrmAutomationPendingStep_orgId_status_resumeAt_idx" ON "app_quikcrmexpress"."CrmAutomationPendingStep"("orgId", "status", "resumeAt");

CREATE INDEX IF NOT EXISTS "CrmAutomationPendingStep_orgId_workflowId_leadId_idx" ON "app_quikcrmexpress"."CrmAutomationPendingStep"("orgId", "workflowId", "leadId");

CREATE INDEX IF NOT EXISTS "CrmAutomationPendingStep_orgId_idx" ON "app_quikcrmexpress"."CrmAutomationPendingStep"("orgId");

CREATE INDEX IF NOT EXISTS "CrmAutomationDistributionState_orgId_idx" ON "app_quikcrmexpress"."CrmAutomationDistributionState"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmAutomationDistributionState_orgId_workflowId_nodeId_key" ON "app_quikcrmexpress"."CrmAutomationDistributionState"("orgId", "workflowId", "nodeId");

CREATE INDEX IF NOT EXISTS "CrmAutomationLeadDayCount_orgId_terminated_idx" ON "app_quikcrmexpress"."CrmAutomationLeadDayCount"("orgId", "terminated");

CREATE INDEX IF NOT EXISTS "CrmAutomationLeadDayCount_orgId_idx" ON "app_quikcrmexpress"."CrmAutomationLeadDayCount"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmAutomationLeadDayCount_orgId_leadId_day_key" ON "app_quikcrmexpress"."CrmAutomationLeadDayCount"("orgId", "leadId", "day");

CREATE INDEX IF NOT EXISTS "CrmAutomationAttribution_orgId_leadId_createdAt_idx" ON "app_quikcrmexpress"."CrmAutomationAttribution"("orgId", "leadId", "createdAt");

CREATE INDEX IF NOT EXISTS "CrmAutomationAttribution_orgId_engineSource_idx" ON "app_quikcrmexpress"."CrmAutomationAttribution"("orgId", "engineSource");

CREATE INDEX IF NOT EXISTS "CrmAutomationAttribution_orgId_idx" ON "app_quikcrmexpress"."CrmAutomationAttribution"("orgId");

CREATE INDEX IF NOT EXISTS "CrmProcessDefinition_orgId_idx" ON "app_quikcrmexpress"."CrmProcessDefinition"("orgId");

CREATE INDEX IF NOT EXISTS "CrmSlaRule_orgId_idx" ON "app_quikcrmexpress"."CrmSlaRule"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmSlaRule_orgId_sourceSystem_externalId_key" ON "app_quikcrmexpress"."CrmSlaRule"("orgId", "sourceSystem", "externalId");

CREATE INDEX IF NOT EXISTS "CrmSlaLeadTracking_orgId_leadId_idx" ON "app_quikcrmexpress"."CrmSlaLeadTracking"("orgId", "leadId");

CREATE INDEX IF NOT EXISTS "CrmSlaLeadTracking_orgId_status_idx" ON "app_quikcrmexpress"."CrmSlaLeadTracking"("orgId", "status");

CREATE INDEX IF NOT EXISTS "CrmSlaLeadTracking_orgId_idx" ON "app_quikcrmexpress"."CrmSlaLeadTracking"("orgId");

CREATE INDEX IF NOT EXISTS "CrmTelephonyProvider_orgId_idx" ON "app_quikcrmexpress"."CrmTelephonyProvider"("orgId");

CREATE INDEX IF NOT EXISTS "CrmVirtualNumber_orgId_idx" ON "app_quikcrmexpress"."CrmVirtualNumber"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmVirtualNumber_orgId_number_key" ON "app_quikcrmexpress"."CrmVirtualNumber"("orgId", "number");

CREATE INDEX IF NOT EXISTS "CrmCallLog_orgId_idx" ON "app_quikcrmexpress"."CrmCallLog"("orgId");

CREATE INDEX IF NOT EXISTS "CrmCallLog_orgId_leadId_idx" ON "app_quikcrmexpress"."CrmCallLog"("orgId", "leadId");

CREATE INDEX IF NOT EXISTS "CrmCallLog_orgId_providerCallSid_createdAt_idx" ON "app_quikcrmexpress"."CrmCallLog"("orgId", "providerCallSid", "createdAt");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmCallLog_orgId_callSid_key" ON "app_quikcrmexpress"."CrmCallLog"("orgId", "callSid");

CREATE INDEX IF NOT EXISTS "CrmCallDisposition_orgId_idx" ON "app_quikcrmexpress"."CrmCallDisposition"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmCallDisposition_orgId_code_key" ON "app_quikcrmexpress"."CrmCallDisposition"("orgId", "code");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmCallDisposition_orgId_name_key" ON "app_quikcrmexpress"."CrmCallDisposition"("orgId", "name");

CREATE INDEX IF NOT EXISTS "CrmCtcCallAudit_orgId_idx" ON "app_quikcrmexpress"."CrmCtcCallAudit"("orgId");

CREATE INDEX IF NOT EXISTS "CrmCtcCallAudit_orgId_agentUserId_createdAt_idx" ON "app_quikcrmexpress"."CrmCtcCallAudit"("orgId", "agentUserId", "createdAt");

CREATE INDEX IF NOT EXISTS "CrmIndiaVoiceWebhookLog_orgId_idx" ON "app_quikcrmexpress"."CrmIndiaVoiceWebhookLog"("orgId");

CREATE INDEX IF NOT EXISTS "CrmIndiaVoiceWebhookLog_orgId_callSid_idx" ON "app_quikcrmexpress"."CrmIndiaVoiceWebhookLog"("orgId", "callSid");

CREATE INDEX IF NOT EXISTS "CrmIndiaVoiceWebhookLog_orgId_campid_idx" ON "app_quikcrmexpress"."CrmIndiaVoiceWebhookLog"("orgId", "campid");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmIndiaVoiceWebhookLog_orgId_processDedupeKey_key" ON "app_quikcrmexpress"."CrmIndiaVoiceWebhookLog"("orgId", "processDedupeKey");

CREATE INDEX IF NOT EXISTS "CrmLeadImportJob_orgId_idx" ON "app_quikcrmexpress"."CrmLeadImportJob"("orgId");

CREATE INDEX IF NOT EXISTS "CrmLeadImportJob_orgId_status_idx" ON "app_quikcrmexpress"."CrmLeadImportJob"("orgId", "status");

CREATE INDEX IF NOT EXISTS "CrmLeadImportJob_orgId_batchId_idx" ON "app_quikcrmexpress"."CrmLeadImportJob"("orgId", "batchId");

CREATE INDEX IF NOT EXISTS "CrmLeadImportJob_orgId_entityType_status_nextRetryAt_idx" ON "app_quikcrmexpress"."CrmLeadImportJob"("orgId", "entityType", "status", "nextRetryAt");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmLeadImportJob_orgId_entityType_sourceSystem_idempotencyK_key" ON "app_quikcrmexpress"."CrmLeadImportJob"("orgId", "entityType", "sourceSystem", "idempotencyKey");

CREATE INDEX IF NOT EXISTS "CrmReportDefinition_orgId_idx" ON "app_quikcrmexpress"."CrmReportDefinition"("orgId");

CREATE INDEX IF NOT EXISTS "CrmNotification_orgId_userId_readAt_idx" ON "app_quikcrmexpress"."CrmNotification"("orgId", "userId", "readAt");

CREATE INDEX IF NOT EXISTS "CrmNotification_orgId_idx" ON "app_quikcrmexpress"."CrmNotification"("orgId");

CREATE INDEX IF NOT EXISTS "CrmOutboundMessageLog_orgId_idx" ON "app_quikcrmexpress"."CrmOutboundMessageLog"("orgId");

CREATE INDEX IF NOT EXISTS "CrmAttendanceLog_orgId_userId_idx" ON "app_quikcrmexpress"."CrmAttendanceLog"("orgId", "userId");

CREATE INDEX IF NOT EXISTS "CrmAttendanceLog_orgId_idx" ON "app_quikcrmexpress"."CrmAttendanceLog"("orgId");

CREATE INDEX IF NOT EXISTS "CrmSalesTeam_orgId_idx" ON "app_quikcrmexpress"."CrmSalesTeam"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmSalesTeam_orgId_name_key" ON "app_quikcrmexpress"."CrmSalesTeam"("orgId", "name");

CREATE INDEX IF NOT EXISTS "CrmSalesGroup_orgId_idx" ON "app_quikcrmexpress"."CrmSalesGroup"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmSalesGroup_orgId_name_key" ON "app_quikcrmexpress"."CrmSalesGroup"("orgId", "name");

CREATE INDEX IF NOT EXISTS "CrmAuditLog_orgId_createdAt_idx" ON "app_quikcrmexpress"."CrmAuditLog"("orgId", "createdAt");

CREATE INDEX IF NOT EXISTS "CrmAuditLog_orgId_module_resourceId_idx" ON "app_quikcrmexpress"."CrmAuditLog"("orgId", "module", "resourceId");

CREATE INDEX IF NOT EXISTS "CrmAuditLog_orgId_userId_createdAt_idx" ON "app_quikcrmexpress"."CrmAuditLog"("orgId", "userId", "createdAt");

CREATE INDEX IF NOT EXISTS "CrmAuditLog_orgId_idx" ON "app_quikcrmexpress"."CrmAuditLog"("orgId");

CREATE INDEX IF NOT EXISTS "CrmIntegrationConfig_orgId_status_idx" ON "app_quikcrmexpress"."CrmIntegrationConfig"("orgId", "status");

CREATE INDEX IF NOT EXISTS "CrmIntegrationConfig_orgId_idx" ON "app_quikcrmexpress"."CrmIntegrationConfig"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmIntegrationConfig_orgId_name_key" ON "app_quikcrmexpress"."CrmIntegrationConfig"("orgId", "name");

CREATE INDEX IF NOT EXISTS "CrmPaymentVerification_orgId_status_idx" ON "app_quikcrmexpress"."CrmPaymentVerification"("orgId", "status");

CREATE INDEX IF NOT EXISTS "CrmPaymentVerification_orgId_idx" ON "app_quikcrmexpress"."CrmPaymentVerification"("orgId");

CREATE INDEX IF NOT EXISTS "CrmDocumentFolder_orgId_idx" ON "app_quikcrmexpress"."CrmDocumentFolder"("orgId");

CREATE INDEX IF NOT EXISTS "CrmDocumentFolder_orgId_parentFolderId_idx" ON "app_quikcrmexpress"."CrmDocumentFolder"("orgId", "parentFolderId");

CREATE INDEX IF NOT EXISTS "CrmDocumentFolder_orgId_refType_refId_idx" ON "app_quikcrmexpress"."CrmDocumentFolder"("orgId", "refType", "refId");

CREATE INDEX IF NOT EXISTS "CrmDocumentFolder_orgId_deletedAt_idx" ON "app_quikcrmexpress"."CrmDocumentFolder"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "CrmDocument_orgId_refType_refId_idx" ON "app_quikcrmexpress"."CrmDocument"("orgId", "refType", "refId");

CREATE INDEX IF NOT EXISTS "CrmDocument_orgId_deletedAt_idx" ON "app_quikcrmexpress"."CrmDocument"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "CrmDocument_folderId_idx" ON "app_quikcrmexpress"."CrmDocument"("folderId");

CREATE INDEX IF NOT EXISTS "CrmDocument_orgId_idx" ON "app_quikcrmexpress"."CrmDocument"("orgId");

CREATE INDEX IF NOT EXISTS "CrmDocumentLink_orgId_targetFolderId_idx" ON "app_quikcrmexpress"."CrmDocumentLink"("orgId", "targetFolderId");

CREATE INDEX IF NOT EXISTS "CrmDocumentLink_orgId_sourceDocumentId_idx" ON "app_quikcrmexpress"."CrmDocumentLink"("orgId", "sourceDocumentId");

CREATE INDEX IF NOT EXISTS "CrmDocumentLink_orgId_refType_refId_idx" ON "app_quikcrmexpress"."CrmDocumentLink"("orgId", "refType", "refId");

CREATE INDEX IF NOT EXISTS "CrmDocumentLink_orgId_deletedAt_idx" ON "app_quikcrmexpress"."CrmDocumentLink"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "CrmDocumentLink_orgId_idx" ON "app_quikcrmexpress"."CrmDocumentLink"("orgId");

CREATE INDEX IF NOT EXISTS "CrmProductTaxonomy_orgId_kind_idx" ON "app_quikcrmexpress"."CrmProductTaxonomy"("orgId", "kind");

CREATE INDEX IF NOT EXISTS "CrmProductTaxonomy_orgId_parentId_idx" ON "app_quikcrmexpress"."CrmProductTaxonomy"("orgId", "parentId");

CREATE INDEX IF NOT EXISTS "CrmProductTaxonomy_orgId_idx" ON "app_quikcrmexpress"."CrmProductTaxonomy"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmProductTaxonomy_orgId_kind_name_parentId_key" ON "app_quikcrmexpress"."CrmProductTaxonomy"("orgId", "kind", "name", "parentId");

CREATE INDEX IF NOT EXISTS "CrmProduct_orgId_idx" ON "app_quikcrmexpress"."CrmProduct"("orgId");

CREATE INDEX IF NOT EXISTS "CrmProduct_orgId_deletedAt_idx" ON "app_quikcrmexpress"."CrmProduct"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "CrmProduct_orgId_isActive_idx" ON "app_quikcrmexpress"."CrmProduct"("orgId", "isActive");

CREATE INDEX IF NOT EXISTS "CrmProduct_orgId_categoryId_idx" ON "app_quikcrmexpress"."CrmProduct"("orgId", "categoryId");

CREATE INDEX IF NOT EXISTS "CrmProduct_orgId_brandId_idx" ON "app_quikcrmexpress"."CrmProduct"("orgId", "brandId");

CREATE INDEX IF NOT EXISTS "CrmProduct_orgId_barcode_idx" ON "app_quikcrmexpress"."CrmProduct"("orgId", "barcode");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmProduct_orgId_sku_key" ON "app_quikcrmexpress"."CrmProduct"("orgId", "sku");

CREATE INDEX IF NOT EXISTS "CrmProductVariant_orgId_productId_idx" ON "app_quikcrmexpress"."CrmProductVariant"("orgId", "productId");

CREATE INDEX IF NOT EXISTS "CrmProductVariant_orgId_idx" ON "app_quikcrmexpress"."CrmProductVariant"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmProductVariant_orgId_sku_key" ON "app_quikcrmexpress"."CrmProductVariant"("orgId", "sku");

CREATE INDEX IF NOT EXISTS "CrmWarehouse_orgId_idx" ON "app_quikcrmexpress"."CrmWarehouse"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmWarehouse_orgId_code_key" ON "app_quikcrmexpress"."CrmWarehouse"("orgId", "code");

CREATE INDEX IF NOT EXISTS "CrmProductInventory_orgId_productId_idx" ON "app_quikcrmexpress"."CrmProductInventory"("orgId", "productId");

CREATE INDEX IF NOT EXISTS "CrmProductInventory_orgId_warehouseId_idx" ON "app_quikcrmexpress"."CrmProductInventory"("orgId", "warehouseId");

CREATE INDEX IF NOT EXISTS "CrmProductInventory_orgId_idx" ON "app_quikcrmexpress"."CrmProductInventory"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmProductInventory_orgId_productId_variantId_warehouseId_key" ON "app_quikcrmexpress"."CrmProductInventory"("orgId", "productId", "variantId", "warehouseId");

CREATE INDEX IF NOT EXISTS "CrmStockMovement_orgId_productId_createdAt_idx" ON "app_quikcrmexpress"."CrmStockMovement"("orgId", "productId", "createdAt");

CREATE INDEX IF NOT EXISTS "CrmStockMovement_orgId_warehouseId_idx" ON "app_quikcrmexpress"."CrmStockMovement"("orgId", "warehouseId");

CREATE INDEX IF NOT EXISTS "CrmStockMovement_orgId_idx" ON "app_quikcrmexpress"."CrmStockMovement"("orgId");

CREATE INDEX IF NOT EXISTS "CrmProductImage_orgId_productId_idx" ON "app_quikcrmexpress"."CrmProductImage"("orgId", "productId");

CREATE INDEX IF NOT EXISTS "CrmProductImage_orgId_idx" ON "app_quikcrmexpress"."CrmProductImage"("orgId");

CREATE INDEX IF NOT EXISTS "CrmPriceList_orgId_idx" ON "app_quikcrmexpress"."CrmPriceList"("orgId");

CREATE INDEX IF NOT EXISTS "CrmPriceList_orgId_deletedAt_idx" ON "app_quikcrmexpress"."CrmPriceList"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "CrmPriceList_orgId_isActive_idx" ON "app_quikcrmexpress"."CrmPriceList"("orgId", "isActive");

CREATE INDEX IF NOT EXISTS "CrmPriceList_orgId_regionCode_idx" ON "app_quikcrmexpress"."CrmPriceList"("orgId", "regionCode");

CREATE INDEX IF NOT EXISTS "CrmPriceList_orgId_customerTier_idx" ON "app_quikcrmexpress"."CrmPriceList"("orgId", "customerTier");

CREATE INDEX IF NOT EXISTS "CrmPriceListItem_orgId_priceListId_idx" ON "app_quikcrmexpress"."CrmPriceListItem"("orgId", "priceListId");

CREATE INDEX IF NOT EXISTS "CrmPriceListItem_orgId_priceListId_deletedAt_idx" ON "app_quikcrmexpress"."CrmPriceListItem"("orgId", "priceListId", "deletedAt");

CREATE INDEX IF NOT EXISTS "CrmPriceListItem_orgId_productId_idx" ON "app_quikcrmexpress"."CrmPriceListItem"("orgId", "productId");

CREATE INDEX IF NOT EXISTS "CrmPriceListItem_orgId_idx" ON "app_quikcrmexpress"."CrmPriceListItem"("orgId");

CREATE INDEX IF NOT EXISTS "CrmPriceListAuditLog_orgId_priceListId_createdAt_idx" ON "app_quikcrmexpress"."CrmPriceListAuditLog"("orgId", "priceListId", "createdAt");

CREATE INDEX IF NOT EXISTS "CrmPriceListAuditLog_orgId_idx" ON "app_quikcrmexpress"."CrmPriceListAuditLog"("orgId");

CREATE INDEX IF NOT EXISTS "CrmQuote_orgId_idx" ON "app_quikcrmexpress"."CrmQuote"("orgId");

CREATE INDEX IF NOT EXISTS "CrmQuote_orgId_status_idx" ON "app_quikcrmexpress"."CrmQuote"("orgId", "status");

CREATE INDEX IF NOT EXISTS "CrmQuote_orgId_accountId_idx" ON "app_quikcrmexpress"."CrmQuote"("orgId", "accountId");

CREATE INDEX IF NOT EXISTS "CrmQuote_orgId_opportunityId_idx" ON "app_quikcrmexpress"."CrmQuote"("orgId", "opportunityId");

CREATE INDEX IF NOT EXISTS "CrmQuote_orgId_ownerId_idx" ON "app_quikcrmexpress"."CrmQuote"("orgId", "ownerId");

CREATE INDEX IF NOT EXISTS "CrmQuote_orgId_parentQuoteId_idx" ON "app_quikcrmexpress"."CrmQuote"("orgId", "parentQuoteId");

CREATE INDEX IF NOT EXISTS "CrmQuote_orgId_deletedAt_idx" ON "app_quikcrmexpress"."CrmQuote"("orgId", "deletedAt");

CREATE INDEX IF NOT EXISTS "CrmQuote_orgId_approvalStatus_idx" ON "app_quikcrmexpress"."CrmQuote"("orgId", "approvalStatus");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmQuote_orgId_quoteNumber_key" ON "app_quikcrmexpress"."CrmQuote"("orgId", "quoteNumber");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmQuote_orgId_portalTokenHash_key" ON "app_quikcrmexpress"."CrmQuote"("orgId", "portalTokenHash");

CREATE INDEX IF NOT EXISTS "CrmQuoteLine_orgId_quoteId_idx" ON "app_quikcrmexpress"."CrmQuoteLine"("orgId", "quoteId");

CREATE INDEX IF NOT EXISTS "CrmQuoteLine_orgId_idx" ON "app_quikcrmexpress"."CrmQuoteLine"("orgId");

CREATE INDEX IF NOT EXISTS "CrmQuoteStatusTransition_orgId_quoteId_idx" ON "app_quikcrmexpress"."CrmQuoteStatusTransition"("orgId", "quoteId");

CREATE INDEX IF NOT EXISTS "CrmQuoteStatusTransition_orgId_idx" ON "app_quikcrmexpress"."CrmQuoteStatusTransition"("orgId");

CREATE INDEX IF NOT EXISTS "CrmQuoteTemplate_orgId_isActive_idx" ON "app_quikcrmexpress"."CrmQuoteTemplate"("orgId", "isActive");

CREATE INDEX IF NOT EXISTS "CrmQuoteTemplate_orgId_idx" ON "app_quikcrmexpress"."CrmQuoteTemplate"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmQuoteTemplate_orgId_key_key" ON "app_quikcrmexpress"."CrmQuoteTemplate"("orgId", "key");

CREATE INDEX IF NOT EXISTS "CrmQuoteApproval_orgId_quoteId_idx" ON "app_quikcrmexpress"."CrmQuoteApproval"("orgId", "quoteId");

CREATE INDEX IF NOT EXISTS "CrmQuoteApproval_orgId_status_idx" ON "app_quikcrmexpress"."CrmQuoteApproval"("orgId", "status");

CREATE INDEX IF NOT EXISTS "CrmQuoteApproval_orgId_idx" ON "app_quikcrmexpress"."CrmQuoteApproval"("orgId");

CREATE INDEX IF NOT EXISTS "CrmQuotePdfSnapshot_orgId_quoteId_createdAt_idx" ON "app_quikcrmexpress"."CrmQuotePdfSnapshot"("orgId", "quoteId", "createdAt");

CREATE INDEX IF NOT EXISTS "CrmQuotePdfSnapshot_orgId_idx" ON "app_quikcrmexpress"."CrmQuotePdfSnapshot"("orgId");

CREATE INDEX IF NOT EXISTS "CrmQuoteComment_orgId_quoteId_createdAt_idx" ON "app_quikcrmexpress"."CrmQuoteComment"("orgId", "quoteId", "createdAt");

CREATE INDEX IF NOT EXISTS "CrmQuoteComment_orgId_idx" ON "app_quikcrmexpress"."CrmQuoteComment"("orgId");

CREATE INDEX IF NOT EXISTS "CrmQuoteEngagementEvent_orgId_quoteId_createdAt_idx" ON "app_quikcrmexpress"."CrmQuoteEngagementEvent"("orgId", "quoteId", "createdAt");

CREATE INDEX IF NOT EXISTS "CrmQuoteEngagementEvent_orgId_eventType_idx" ON "app_quikcrmexpress"."CrmQuoteEngagementEvent"("orgId", "eventType");

CREATE INDEX IF NOT EXISTS "CrmQuoteEngagementEvent_orgId_idx" ON "app_quikcrmexpress"."CrmQuoteEngagementEvent"("orgId");

CREATE INDEX IF NOT EXISTS "CrmQuotePortalAccess_orgId_quoteId_idx" ON "app_quikcrmexpress"."CrmQuotePortalAccess"("orgId", "quoteId");

CREATE INDEX IF NOT EXISTS "CrmQuotePortalAccess_orgId_idx" ON "app_quikcrmexpress"."CrmQuotePortalAccess"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmQuotePortalAccess_tokenHash_key" ON "app_quikcrmexpress"."CrmQuotePortalAccess"("tokenHash");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmInvoice_quoteId_key" ON "app_quikcrmexpress"."CrmInvoice"("quoteId");

CREATE INDEX IF NOT EXISTS "CrmInvoice_orgId_status_idx" ON "app_quikcrmexpress"."CrmInvoice"("orgId", "status");

CREATE INDEX IF NOT EXISTS "CrmInvoice_orgId_accountId_idx" ON "app_quikcrmexpress"."CrmInvoice"("orgId", "accountId");

CREATE INDEX IF NOT EXISTS "CrmInvoice_orgId_idx" ON "app_quikcrmexpress"."CrmInvoice"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmInvoice_orgId_invoiceNumber_key" ON "app_quikcrmexpress"."CrmInvoice"("orgId", "invoiceNumber");

CREATE INDEX IF NOT EXISTS "CrmSequence_orgId_idx" ON "app_quikcrmexpress"."CrmSequence"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmSequence_orgId_name_key" ON "app_quikcrmexpress"."CrmSequence"("orgId", "name");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmOrder_quoteId_key" ON "app_quikcrmexpress"."CrmOrder"("quoteId");

CREATE INDEX IF NOT EXISTS "CrmOrder_orgId_idx" ON "app_quikcrmexpress"."CrmOrder"("orgId");

CREATE INDEX IF NOT EXISTS "CrmOrder_orgId_status_idx" ON "app_quikcrmexpress"."CrmOrder"("orgId", "status");

CREATE INDEX IF NOT EXISTS "CrmOrder_orgId_accountId_idx" ON "app_quikcrmexpress"."CrmOrder"("orgId", "accountId");

CREATE INDEX IF NOT EXISTS "CrmOrder_orgId_deletedAt_idx" ON "app_quikcrmexpress"."CrmOrder"("orgId", "deletedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmOrder_orgId_orderNumber_key" ON "app_quikcrmexpress"."CrmOrder"("orgId", "orderNumber");

CREATE INDEX IF NOT EXISTS "CrmOrderLine_orgId_orderId_idx" ON "app_quikcrmexpress"."CrmOrderLine"("orgId", "orderId");

CREATE INDEX IF NOT EXISTS "CrmOrderLine_orgId_idx" ON "app_quikcrmexpress"."CrmOrderLine"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmLeadStatus_name_key" ON "app_quikcrmexpress"."CrmLeadStatus"("name");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmLeadSubStatus_name_key" ON "app_quikcrmexpress"."CrmLeadSubStatus"("name");

CREATE INDEX IF NOT EXISTS "CrmLeadStatusSubStatus_leadStatusId_idx" ON "app_quikcrmexpress"."CrmLeadStatusSubStatus"("leadStatusId");

CREATE INDEX IF NOT EXISTS "CrmLeadStatusSubStatus_leadSubStatusId_idx" ON "app_quikcrmexpress"."CrmLeadStatusSubStatus"("leadSubStatusId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmLeadStatusSubStatus_leadStatusId_leadSubStatusId_key" ON "app_quikcrmexpress"."CrmLeadStatusSubStatus"("leadStatusId", "leadSubStatusId");

CREATE INDEX IF NOT EXISTS "CrmFormSet_orgId_surface_isDefault_idx" ON "app_quikcrmexpress"."CrmFormSet"("orgId", "surface", "isDefault");

CREATE INDEX IF NOT EXISTS "CrmFormSet_orgId_idx" ON "app_quikcrmexpress"."CrmFormSet"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmFormSet_orgId_surface_name_key" ON "app_quikcrmexpress"."CrmFormSet"("orgId", "surface", "name");

CREATE INDEX IF NOT EXISTS "CrmFormSetVersion_formSetId_status_idx" ON "app_quikcrmexpress"."CrmFormSetVersion"("formSetId", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmFormSetVersion_formSetId_versionNumber_key" ON "app_quikcrmexpress"."CrmFormSetVersion"("formSetId", "versionNumber");

CREATE INDEX IF NOT EXISTS "CrmFormField_formSetVersionId_tab_sortOrder_idx" ON "app_quikcrmexpress"."CrmFormField"("formSetVersionId", "tab", "sortOrder");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmFormField_formSetVersionId_tab_fieldKey_key" ON "app_quikcrmexpress"."CrmFormField"("formSetVersionId", "tab", "fieldKey");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmFormField_formSetVersionId_tab_label_key" ON "app_quikcrmexpress"."CrmFormField"("formSetVersionId", "tab", "label");

CREATE INDEX IF NOT EXISTS "CrmFormFieldOption_formFieldId_isActive_sortOrder_idx" ON "app_quikcrmexpress"."CrmFormFieldOption"("formFieldId", "isActive", "sortOrder");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmFormFieldOption_formFieldId_valueKey_key" ON "app_quikcrmexpress"."CrmFormFieldOption"("formFieldId", "valueKey");

CREATE INDEX IF NOT EXISTS "CrmFieldValue_orgId_fieldKey_valueText_idx" ON "app_quikcrmexpress"."CrmFieldValue"("orgId", "fieldKey", "valueText");

CREATE INDEX IF NOT EXISTS "CrmFieldValue_orgId_fieldKey_valueNumber_idx" ON "app_quikcrmexpress"."CrmFieldValue"("orgId", "fieldKey", "valueNumber");

CREATE INDEX IF NOT EXISTS "CrmFieldValue_orgId_fieldKey_valueDatetime_idx" ON "app_quikcrmexpress"."CrmFieldValue"("orgId", "fieldKey", "valueDatetime");

CREATE INDEX IF NOT EXISTS "CrmFieldValue_valueUserIds_idx" ON "app_quikcrmexpress"."CrmFieldValue" USING GIN ("valueUserIds");

CREATE INDEX IF NOT EXISTS "CrmFieldValue_orgId_idx" ON "app_quikcrmexpress"."CrmFieldValue"("orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "CrmFieldValue_activityId_fieldKey_key" ON "app_quikcrmexpress"."CrmFieldValue"("activityId", "fieldKey");

CREATE INDEX IF NOT EXISTS "CrmSetSelectionLog_orgId_leadId_idx" ON "app_quikcrmexpress"."CrmSetSelectionLog"("orgId", "leadId");

CREATE INDEX IF NOT EXISTS "CrmSetSelectionLog_orgId_wasOverridden_idx" ON "app_quikcrmexpress"."CrmSetSelectionLog"("orgId", "wasOverridden");

CREATE INDEX IF NOT EXISTS "CrmSetSelectionLog_orgId_idx" ON "app_quikcrmexpress"."CrmSetSelectionLog"("orgId");

CREATE INDEX IF NOT EXISTS "CrmFormSetMappingRule_formSetVersionId_isActive_sortOrder_idx" ON "app_quikcrmexpress"."CrmFormSetMappingRule"("formSetVersionId", "isActive", "sortOrder");

CREATE INDEX IF NOT EXISTS "CrmFormTab_formSetVersionId_sortOrder_idx" ON "app_quikcrmexpress"."CrmFormTab"("formSetVersionId", "sortOrder");

CREATE INDEX IF NOT EXISTS "CrmFormSection_formTabId_sortOrder_idx" ON "app_quikcrmexpress"."CrmFormSection"("formTabId", "sortOrder");

CREATE INDEX IF NOT EXISTS "CrmFormRule_formSetVersionId_isActive_sortOrder_idx" ON "app_quikcrmexpress"."CrmFormRule"("formSetVersionId", "isActive", "sortOrder");

CREATE INDEX IF NOT EXISTS "CrmFormRuleCondition_formRuleId_sortOrder_idx" ON "app_quikcrmexpress"."CrmFormRuleCondition"("formRuleId", "sortOrder");

CREATE INDEX IF NOT EXISTS "CrmFormRuleAction_formRuleId_sortOrder_idx" ON "app_quikcrmexpress"."CrmFormRuleAction"("formRuleId", "sortOrder");

CREATE INDEX IF NOT EXISTS "CrmFileAttachment_orgId_activityId_idx" ON "app_quikcrmexpress"."CrmFileAttachment"("orgId", "activityId");

CREATE INDEX IF NOT EXISTS "CrmFileAttachment_orgId_idx" ON "app_quikcrmexpress"."CrmFileAttachment"("orgId");

CREATE INDEX IF NOT EXISTS "AppRole_orgId_appId_idx" ON "app_quikcrmexpress"."AppRole"("orgId", "appId");

CREATE UNIQUE INDEX IF NOT EXISTS "AppRole_orgId_appId_name_key" ON "app_quikcrmexpress"."AppRole"("orgId", "appId", "name");

CREATE INDEX IF NOT EXISTS "RolePermission_roleId_idx" ON "app_quikcrmexpress"."RolePermission"("roleId");

CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_resource_action_key" ON "app_quikcrmexpress"."RolePermission"("roleId", "resource", "action");

CREATE INDEX IF NOT EXISTS "RoleNavigation_roleId_idx" ON "app_quikcrmexpress"."RoleNavigation"("roleId");

CREATE UNIQUE INDEX IF NOT EXISTS "RoleNavigation_roleId_navKey_key" ON "app_quikcrmexpress"."RoleNavigation"("roleId", "navKey");

CREATE INDEX IF NOT EXISTS "UserAppRole_roleId_idx" ON "app_quikcrmexpress"."UserAppRole"("roleId");

CREATE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_idx" ON "app_quikcrmexpress"."UserAppRole"("userId", "orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "UserAppRole_userId_orgId_roleId_key" ON "app_quikcrmexpress"."UserAppRole"("userId", "orgId", "roleId");

CREATE INDEX IF NOT EXISTS "UserPermissionExtra_userId_orgId_idx" ON "app_quikcrmexpress"."UserPermissionExtra"("userId", "orgId");

CREATE UNIQUE INDEX IF NOT EXISTS "UserPermissionExtra_orgId_userId_resource_action_key" ON "app_quikcrmexpress"."UserPermissionExtra"("orgId", "userId", "resource", "action");

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmPermissionTemplate" ADD CONSTRAINT "CrmPermissionTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmUserPermissionTemplate" ADD CONSTRAINT "CrmUserPermissionTemplate_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "app_quikcrmexpress"."CrmPermissionTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmUserAccountAccess" ADD CONSTRAINT "CrmUserAccountAccess_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "app_quikcrmexpress"."CrmAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmAccount" ADD CONSTRAINT "CrmAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmAccount" ADD CONSTRAINT "CrmAccount_parentAccountId_fkey" FOREIGN KEY ("parentAccountId") REFERENCES "app_quikcrmexpress"."CrmAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmAccount" ADD CONSTRAINT "CrmAccount_defaultPriceListId_fkey" FOREIGN KEY ("defaultPriceListId") REFERENCES "app_quikcrmexpress"."CrmPriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmContact" ADD CONSTRAINT "CrmContact_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmContact" ADD CONSTRAINT "CrmContact_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "app_quikcrmexpress"."CrmAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmContact" ADD CONSTRAINT "CrmContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "app_quikcrmexpress"."CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmLead" ADD CONSTRAINT "CrmLead_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmLead" ADD CONSTRAINT "CrmLead_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "app_quikcrmexpress"."CrmAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."LeadSquaredSyncMap" ADD CONSTRAINT "LeadSquaredSyncMap_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."LeadSquaredSyncMap" ADD CONSTRAINT "LeadSquaredSyncMap_crmLeadId_fkey" FOREIGN KEY ("crmLeadId") REFERENCES "app_quikcrmexpress"."CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmLeadAttachment" ADD CONSTRAINT "CrmLeadAttachment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmLeadAttachment" ADD CONSTRAINT "CrmLeadAttachment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "app_quikcrmexpress"."CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmLeadListView" ADD CONSTRAINT "CrmLeadListView_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmLeadSavedList" ADD CONSTRAINT "CrmLeadSavedList_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmLeadSource" ADD CONSTRAINT "CrmLeadSource_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "app_quikcrmexpress"."CrmAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "app_quikcrmexpress"."CrmPriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOpportunityClientMeeting" ADD CONSTRAINT "CrmOpportunityClientMeeting_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOpportunityClientMeeting" ADD CONSTRAINT "CrmOpportunityClientMeeting_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "app_quikcrmexpress"."CrmOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOpportunityProduct" ADD CONSTRAINT "CrmOpportunityProduct_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOpportunityProduct" ADD CONSTRAINT "CrmOpportunityProduct_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "app_quikcrmexpress"."CrmOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOpportunityStageTransition" ADD CONSTRAINT "CrmOpportunityStageTransition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOpportunityStageTransition" ADD CONSTRAINT "CrmOpportunityStageTransition_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "app_quikcrmexpress"."CrmOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmActivity" ADD CONSTRAINT "CrmActivity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmActivity" ADD CONSTRAINT "CrmActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "app_quikcrmexpress"."CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmTask" ADD CONSTRAINT "CrmTask_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmTask" ADD CONSTRAINT "CrmTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "app_quikcrmexpress"."CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmNote" ADD CONSTRAINT "CrmNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmNote" ADD CONSTRAINT "CrmNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "app_quikcrmexpress"."CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmCompanyProfile" ADD CONSTRAINT "CrmCompanyProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOrgWorkspaceSettings" ADD CONSTRAINT "CrmOrgWorkspaceSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuickFilter" ADD CONSTRAINT "CrmQuickFilter_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmDashboardPin" ADD CONSTRAINT "CrmDashboardPin_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmCampaign" ADD CONSTRAINT "CrmCampaign_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmLandingPage" ADD CONSTRAINT "CrmLandingPage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmWebWidget" ADD CONSTRAINT "CrmWebWidget_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormDefinition" ADD CONSTRAINT "CrmFormDefinition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmAutomationRule" ADD CONSTRAINT "CrmAutomationRule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmWorkflowDefinition" ADD CONSTRAINT "CrmWorkflowDefinition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmAutomationPendingStep" ADD CONSTRAINT "CrmAutomationPendingStep_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmAutomationPendingStep" ADD CONSTRAINT "CrmAutomationPendingStep_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "app_quikcrmexpress"."CrmWorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmAutomationDistributionState" ADD CONSTRAINT "CrmAutomationDistributionState_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmAutomationDistributionState" ADD CONSTRAINT "CrmAutomationDistributionState_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "app_quikcrmexpress"."CrmWorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmAutomationLeadDayCount" ADD CONSTRAINT "CrmAutomationLeadDayCount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmAutomationAttribution" ADD CONSTRAINT "CrmAutomationAttribution_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProcessDefinition" ADD CONSTRAINT "CrmProcessDefinition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmSlaRule" ADD CONSTRAINT "CrmSlaRule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmSlaLeadTracking" ADD CONSTRAINT "CrmSlaLeadTracking_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmSlaLeadTracking" ADD CONSTRAINT "CrmSlaLeadTracking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "app_quikcrmexpress"."CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmTelephonyProvider" ADD CONSTRAINT "CrmTelephonyProvider_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmVirtualNumber" ADD CONSTRAINT "CrmVirtualNumber_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmCallLog" ADD CONSTRAINT "CrmCallLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmCallLog" ADD CONSTRAINT "CrmCallLog_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "app_quikcrmexpress"."CrmLead"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmCallDisposition" ADD CONSTRAINT "CrmCallDisposition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmCtcCallAudit" ADD CONSTRAINT "CrmCtcCallAudit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmIndiaVoiceWebhookLog" ADD CONSTRAINT "CrmIndiaVoiceWebhookLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmLeadImportJob" ADD CONSTRAINT "CrmLeadImportJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmReportDefinition" ADD CONSTRAINT "CrmReportDefinition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmNotification" ADD CONSTRAINT "CrmNotification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOutboundMessageLog" ADD CONSTRAINT "CrmOutboundMessageLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmAttendanceLog" ADD CONSTRAINT "CrmAttendanceLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmSalesTeam" ADD CONSTRAINT "CrmSalesTeam_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmSalesGroup" ADD CONSTRAINT "CrmSalesGroup_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmSalesGroupMember" ADD CONSTRAINT "CrmSalesGroupMember_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "app_quikcrmexpress"."CrmSalesGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmSalesGroupManager" ADD CONSTRAINT "CrmSalesGroupManager_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "app_quikcrmexpress"."CrmSalesGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmSalesGroupAccount" ADD CONSTRAINT "CrmSalesGroupAccount_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "app_quikcrmexpress"."CrmSalesGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmSalesGroupAccount" ADD CONSTRAINT "CrmSalesGroupAccount_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "app_quikcrmexpress"."CrmAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmAuditLog" ADD CONSTRAINT "CrmAuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmIntegrationConfig" ADD CONSTRAINT "CrmIntegrationConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmPaymentVerification" ADD CONSTRAINT "CrmPaymentVerification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmDocumentFolder" ADD CONSTRAINT "CrmDocumentFolder_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmDocumentFolder" ADD CONSTRAINT "CrmDocumentFolder_parentFolderId_fkey" FOREIGN KEY ("parentFolderId") REFERENCES "app_quikcrmexpress"."CrmDocumentFolder"("id") ON DELETE RESTRICT ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmDocument" ADD CONSTRAINT "CrmDocument_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmDocument" ADD CONSTRAINT "CrmDocument_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "app_quikcrmexpress"."CrmDocumentFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmDocumentLink" ADD CONSTRAINT "CrmDocumentLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmDocumentLink" ADD CONSTRAINT "CrmDocumentLink_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "app_quikcrmexpress"."CrmDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProductTaxonomy" ADD CONSTRAINT "CrmProductTaxonomy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProductTaxonomy" ADD CONSTRAINT "CrmProductTaxonomy_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "app_quikcrmexpress"."CrmProductTaxonomy"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProduct" ADD CONSTRAINT "CrmProduct_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProduct" ADD CONSTRAINT "CrmProduct_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "app_quikcrmexpress"."CrmProductTaxonomy"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProduct" ADD CONSTRAINT "CrmProduct_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "app_quikcrmexpress"."CrmProductTaxonomy"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProduct" ADD CONSTRAINT "CrmProduct_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "app_quikcrmexpress"."CrmProductTaxonomy"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProduct" ADD CONSTRAINT "CrmProduct_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "app_quikcrmexpress"."CrmProductTaxonomy"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProductVariant" ADD CONSTRAINT "CrmProductVariant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProductVariant" ADD CONSTRAINT "CrmProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "app_quikcrmexpress"."CrmProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmWarehouse" ADD CONSTRAINT "CrmWarehouse_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProductInventory" ADD CONSTRAINT "CrmProductInventory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProductInventory" ADD CONSTRAINT "CrmProductInventory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "app_quikcrmexpress"."CrmProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProductInventory" ADD CONSTRAINT "CrmProductInventory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "app_quikcrmexpress"."CrmProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProductInventory" ADD CONSTRAINT "CrmProductInventory_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "app_quikcrmexpress"."CrmWarehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmStockMovement" ADD CONSTRAINT "CrmStockMovement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmStockMovement" ADD CONSTRAINT "CrmStockMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "app_quikcrmexpress"."CrmProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmStockMovement" ADD CONSTRAINT "CrmStockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "app_quikcrmexpress"."CrmProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmStockMovement" ADD CONSTRAINT "CrmStockMovement_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "app_quikcrmexpress"."CrmWarehouse"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProductImage" ADD CONSTRAINT "CrmProductImage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmProductImage" ADD CONSTRAINT "CrmProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "app_quikcrmexpress"."CrmProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmPriceList" ADD CONSTRAINT "CrmPriceList_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmPriceList" ADD CONSTRAINT "CrmPriceList_sourcePriceListId_fkey" FOREIGN KEY ("sourcePriceListId") REFERENCES "app_quikcrmexpress"."CrmPriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmPriceListItem" ADD CONSTRAINT "CrmPriceListItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmPriceListItem" ADD CONSTRAINT "CrmPriceListItem_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "app_quikcrmexpress"."CrmPriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmPriceListItem" ADD CONSTRAINT "CrmPriceListItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "app_quikcrmexpress"."CrmProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmPriceListAuditLog" ADD CONSTRAINT "CrmPriceListAuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmPriceListAuditLog" ADD CONSTRAINT "CrmPriceListAuditLog_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "app_quikcrmexpress"."CrmPriceList"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuote" ADD CONSTRAINT "CrmQuote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuote" ADD CONSTRAINT "CrmQuote_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "app_quikcrmexpress"."CrmPriceList"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuoteLine" ADD CONSTRAINT "CrmQuoteLine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuoteLine" ADD CONSTRAINT "CrmQuoteLine_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "app_quikcrmexpress"."CrmQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuoteStatusTransition" ADD CONSTRAINT "CrmQuoteStatusTransition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuoteStatusTransition" ADD CONSTRAINT "CrmQuoteStatusTransition_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "app_quikcrmexpress"."CrmQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuoteTemplate" ADD CONSTRAINT "CrmQuoteTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuoteApproval" ADD CONSTRAINT "CrmQuoteApproval_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuoteApproval" ADD CONSTRAINT "CrmQuoteApproval_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "app_quikcrmexpress"."CrmQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuotePdfSnapshot" ADD CONSTRAINT "CrmQuotePdfSnapshot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuotePdfSnapshot" ADD CONSTRAINT "CrmQuotePdfSnapshot_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "app_quikcrmexpress"."CrmQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuoteComment" ADD CONSTRAINT "CrmQuoteComment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuoteComment" ADD CONSTRAINT "CrmQuoteComment_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "app_quikcrmexpress"."CrmQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuoteEngagementEvent" ADD CONSTRAINT "CrmQuoteEngagementEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuoteEngagementEvent" ADD CONSTRAINT "CrmQuoteEngagementEvent_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "app_quikcrmexpress"."CrmQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuotePortalAccess" ADD CONSTRAINT "CrmQuotePortalAccess_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmQuotePortalAccess" ADD CONSTRAINT "CrmQuotePortalAccess_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "app_quikcrmexpress"."CrmQuote"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmInvoice" ADD CONSTRAINT "CrmInvoice_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmInvoice" ADD CONSTRAINT "CrmInvoice_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "app_quikcrmexpress"."CrmQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmSequence" ADD CONSTRAINT "CrmSequence_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOrder" ADD CONSTRAINT "CrmOrder_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOrder" ADD CONSTRAINT "CrmOrder_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "app_quikcrmexpress"."CrmQuote"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOrderLine" ADD CONSTRAINT "CrmOrderLine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmOrderLine" ADD CONSTRAINT "CrmOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "app_quikcrmexpress"."CrmOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmLeadStatusSubStatus" ADD CONSTRAINT "CrmLeadStatusSubStatus_leadStatusId_fkey" FOREIGN KEY ("leadStatusId") REFERENCES "app_quikcrmexpress"."CrmLeadStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmLeadStatusSubStatus" ADD CONSTRAINT "CrmLeadStatusSubStatus_leadSubStatusId_fkey" FOREIGN KEY ("leadSubStatusId") REFERENCES "app_quikcrmexpress"."CrmLeadSubStatus"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormSet" ADD CONSTRAINT "CrmFormSet_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormSet" ADD CONSTRAINT "CrmFormSet_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "app_quikcrmexpress"."CrmFormSetVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormSetVersion" ADD CONSTRAINT "CrmFormSetVersion_formSetId_fkey" FOREIGN KEY ("formSetId") REFERENCES "app_quikcrmexpress"."CrmFormSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormField" ADD CONSTRAINT "CrmFormField_formSetVersionId_fkey" FOREIGN KEY ("formSetVersionId") REFERENCES "app_quikcrmexpress"."CrmFormSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormField" ADD CONSTRAINT "CrmFormField_formTabId_fkey" FOREIGN KEY ("formTabId") REFERENCES "app_quikcrmexpress"."CrmFormTab"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormField" ADD CONSTRAINT "CrmFormField_formSectionId_fkey" FOREIGN KEY ("formSectionId") REFERENCES "app_quikcrmexpress"."CrmFormSection"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormFieldOption" ADD CONSTRAINT "CrmFormFieldOption_formFieldId_fkey" FOREIGN KEY ("formFieldId") REFERENCES "app_quikcrmexpress"."CrmFormField"("id") ON DELETE RESTRICT ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFieldValue" ADD CONSTRAINT "CrmFieldValue_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFieldValue" ADD CONSTRAINT "CrmFieldValue_formSetVersionId_fkey" FOREIGN KEY ("formSetVersionId") REFERENCES "app_quikcrmexpress"."CrmFormSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFieldValue" ADD CONSTRAINT "CrmFieldValue_valueFileId_fkey" FOREIGN KEY ("valueFileId") REFERENCES "app_quikcrmexpress"."CrmFileAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmSetSelectionLog" ADD CONSTRAINT "CrmSetSelectionLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmSetSelectionLog" ADD CONSTRAINT "CrmSetSelectionLog_defaultSetId_fkey" FOREIGN KEY ("defaultSetId") REFERENCES "app_quikcrmexpress"."CrmFormSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmSetSelectionLog" ADD CONSTRAINT "CrmSetSelectionLog_chosenSetId_fkey" FOREIGN KEY ("chosenSetId") REFERENCES "app_quikcrmexpress"."CrmFormSet"("id") ON DELETE RESTRICT ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmSetSelectionLog" ADD CONSTRAINT "CrmSetSelectionLog_formSetVersionId_fkey" FOREIGN KEY ("formSetVersionId") REFERENCES "app_quikcrmexpress"."CrmFormSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormSetMappingRule" ADD CONSTRAINT "CrmFormSetMappingRule_formSetVersionId_fkey" FOREIGN KEY ("formSetVersionId") REFERENCES "app_quikcrmexpress"."CrmFormSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormTab" ADD CONSTRAINT "CrmFormTab_formSetVersionId_fkey" FOREIGN KEY ("formSetVersionId") REFERENCES "app_quikcrmexpress"."CrmFormSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormSection" ADD CONSTRAINT "CrmFormSection_formTabId_fkey" FOREIGN KEY ("formTabId") REFERENCES "app_quikcrmexpress"."CrmFormTab"("id") ON DELETE RESTRICT ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormRule" ADD CONSTRAINT "CrmFormRule_formSetVersionId_fkey" FOREIGN KEY ("formSetVersionId") REFERENCES "app_quikcrmexpress"."CrmFormSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormRuleCondition" ADD CONSTRAINT "CrmFormRuleCondition_formRuleId_fkey" FOREIGN KEY ("formRuleId") REFERENCES "app_quikcrmexpress"."CrmFormRule"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormRuleAction" ADD CONSTRAINT "CrmFormRuleAction_formRuleId_fkey" FOREIGN KEY ("formRuleId") REFERENCES "app_quikcrmexpress"."CrmFormRule"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFormRuleAction" ADD CONSTRAINT "CrmFormRuleAction_targetTabId_fkey" FOREIGN KEY ("targetTabId") REFERENCES "app_quikcrmexpress"."CrmFormTab"("id") ON DELETE SET NULL ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."CrmFileAttachment" ADD CONSTRAINT "CrmFileAttachment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikcrmexpress"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."RoleNavigation" ADD CONSTRAINT "RoleNavigation_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikcrmexpress"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;

DO $mig$ BEGIN
  EXECUTE $stmt$ALTER TABLE "app_quikcrmexpress"."UserAppRole" ADD CONSTRAINT "UserAppRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "app_quikcrmexpress"."AppRole"("id") ON DELETE CASCADE ON UPDATE CASCADE$stmt$;
EXCEPTION WHEN duplicate_object THEN NULL;
END $mig$;
