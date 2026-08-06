-- CreateEnum
CREATE TYPE "app_quikcrm"."CrmFormTabVisibility" AS ENUM ('always', 'rule_driven');

-- CreateEnum
CREATE TYPE "app_quikcrm"."CrmFormRuleMatchType" AS ENUM ('all', 'any');

-- CreateEnum
CREATE TYPE "app_quikcrm"."CrmFormRuleSubjectKind" AS ENUM ('field', 'stage', 'status', 'sub_stage');

-- CreateEnum
CREATE TYPE "app_quikcrm"."CrmFormRuleOperator" AS ENUM ('is', 'is_not', 'is_any_of', 'is_none_of', 'is_empty', 'is_not_empty');

-- CreateEnum
CREATE TYPE "app_quikcrm"."CrmFormRuleActionType" AS ENUM ('show_field', 'hide_field', 'make_mandatory', 'make_optional', 'show_tab', 'set_stage');

-- CreateEnum
CREATE TYPE "app_quikcrm"."CrmFormRuleTargetKind" AS ENUM ('field', 'section', 'tab', 'stage');

-- CreateEnum
CREATE TYPE "app_quikcrm"."CrmUserPickerMode" AS ENUM ('single', 'multi');

-- CreateEnum
CREATE TYPE "app_quikcrm"."CrmUserPickerScope" AS ENUM ('all_users', 'team', 'role');

-- CreateEnum
CREATE TYPE "app_quikcrm"."CrmFieldVisibility" AS ENUM ('visible', 'hidden');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "app_quikcrm"."CrmFormFieldType" ADD VALUE 'user_picker';
ALTER TYPE "app_quikcrm"."CrmFormFieldType" ADD VALUE 'file_upload';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "app_quikcrm"."CrmFieldValueType" ADD VALUE 'user_picker';
ALTER TYPE "app_quikcrm"."CrmFieldValueType" ADD VALUE 'file_upload';

-- AlterTable
ALTER TABLE "app_quikcrm"."CrmFormField" ADD COLUMN     "defaultVisibility" "app_quikcrm"."CrmFieldVisibility" NOT NULL DEFAULT 'visible',
ADD COLUMN     "formSectionId" TEXT,
ADD COLUMN     "formTabId" TEXT,
ADD COLUMN     "userPickerMode" "app_quikcrm"."CrmUserPickerMode",
ADD COLUMN     "userPickerScope" "app_quikcrm"."CrmUserPickerScope";

-- AlterTable
ALTER TABLE "app_quikcrm"."CrmFieldValue" ADD COLUMN     "valueFileId" TEXT,
ADD COLUMN     "valueUserIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "app_quikcrm"."CrmFormTab" (
    "id" TEXT NOT NULL,
    "formSetVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "visibility" "app_quikcrm"."CrmFormTabVisibility" NOT NULL DEFAULT 'always',
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormTab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikcrm"."CrmFormSection" (
    "id" TEXT NOT NULL,
    "formTabId" TEXT NOT NULL,
    "name" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikcrm"."CrmFormRule" (
    "id" TEXT NOT NULL,
    "formSetVersionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "matchType" "app_quikcrm"."CrmFormRuleMatchType" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikcrm"."CrmFormRuleCondition" (
    "id" TEXT NOT NULL,
    "formRuleId" TEXT NOT NULL,
    "subjectKind" "app_quikcrm"."CrmFormRuleSubjectKind" NOT NULL,
    "subjectFieldKey" TEXT,
    "operator" "app_quikcrm"."CrmFormRuleOperator" NOT NULL,
    "valueKeys" JSONB,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormRuleCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikcrm"."CrmFormRuleAction" (
    "id" TEXT NOT NULL,
    "formRuleId" TEXT NOT NULL,
    "actionType" "app_quikcrm"."CrmFormRuleActionType" NOT NULL,
    "targetKind" "app_quikcrm"."CrmFormRuleTargetKind" NOT NULL,
    "targetFieldKey" TEXT,
    "targetTabId" TEXT,
    "setStatusId" TEXT,
    "setSubStatusId" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmFormRuleAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_quikcrm"."CrmFileAttachment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmFileAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmFormTab_formSetVersionId_sortOrder_idx" ON "app_quikcrm"."CrmFormTab"("formSetVersionId", "sortOrder");

-- CreateIndex
CREATE INDEX "CrmFormSection_formTabId_sortOrder_idx" ON "app_quikcrm"."CrmFormSection"("formTabId", "sortOrder");

-- CreateIndex
CREATE INDEX "CrmFormRule_formSetVersionId_isActive_sortOrder_idx" ON "app_quikcrm"."CrmFormRule"("formSetVersionId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "CrmFormRuleCondition_formRuleId_sortOrder_idx" ON "app_quikcrm"."CrmFormRuleCondition"("formRuleId", "sortOrder");

-- CreateIndex
CREATE INDEX "CrmFormRuleAction_formRuleId_sortOrder_idx" ON "app_quikcrm"."CrmFormRuleAction"("formRuleId", "sortOrder");

-- CreateIndex
CREATE INDEX "CrmFileAttachment_tenantId_activityId_idx" ON "app_quikcrm"."CrmFileAttachment"("tenantId", "activityId");

-- CreateIndex
CREATE INDEX "CrmFieldValue_valueUserIds_idx" ON "app_quikcrm"."CrmFieldValue" USING GIN ("valueUserIds");

-- AddForeignKey
ALTER TABLE "app_quikcrm"."CrmFormField" ADD CONSTRAINT "CrmFormField_formTabId_fkey" FOREIGN KEY ("formTabId") REFERENCES "app_quikcrm"."CrmFormTab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcrm"."CrmFormField" ADD CONSTRAINT "CrmFormField_formSectionId_fkey" FOREIGN KEY ("formSectionId") REFERENCES "app_quikcrm"."CrmFormSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcrm"."CrmFieldValue" ADD CONSTRAINT "CrmFieldValue_valueFileId_fkey" FOREIGN KEY ("valueFileId") REFERENCES "app_quikcrm"."CrmFileAttachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcrm"."CrmFormTab" ADD CONSTRAINT "CrmFormTab_formSetVersionId_fkey" FOREIGN KEY ("formSetVersionId") REFERENCES "app_quikcrm"."CrmFormSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcrm"."CrmFormSection" ADD CONSTRAINT "CrmFormSection_formTabId_fkey" FOREIGN KEY ("formTabId") REFERENCES "app_quikcrm"."CrmFormTab"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcrm"."CrmFormRule" ADD CONSTRAINT "CrmFormRule_formSetVersionId_fkey" FOREIGN KEY ("formSetVersionId") REFERENCES "app_quikcrm"."CrmFormSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcrm"."CrmFormRuleCondition" ADD CONSTRAINT "CrmFormRuleCondition_formRuleId_fkey" FOREIGN KEY ("formRuleId") REFERENCES "app_quikcrm"."CrmFormRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcrm"."CrmFormRuleAction" ADD CONSTRAINT "CrmFormRuleAction_formRuleId_fkey" FOREIGN KEY ("formRuleId") REFERENCES "app_quikcrm"."CrmFormRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcrm"."CrmFormRuleAction" ADD CONSTRAINT "CrmFormRuleAction_targetTabId_fkey" FOREIGN KEY ("targetTabId") REFERENCES "app_quikcrm"."CrmFormTab"("id") ON DELETE SET NULL ON UPDATE CASCADE;

