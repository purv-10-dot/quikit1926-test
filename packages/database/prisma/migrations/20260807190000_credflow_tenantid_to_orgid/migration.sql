-- CredFlow: tenantId -> orgId (app_quikcredflow only).
-- Data-preserving: columns are RENAMED, not dropped/recreated, so existing
-- tenant values survive and satisfy the new FK to quikit."Org".
-- (Prisma's own migrate diff emits DROP+ADD here, which would destroy data.)

-- 1. rename the scoping column on all 79 CredFlow tables
ALTER TABLE "app_quikcredflow"."CrmPermissionTemplate" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmAccount" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmContact" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmLead" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."LeadSquaredSyncMap" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmLeadAttachment" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmLeadListView" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmLeadSavedList" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmLeadSource" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmOpportunity" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmOpportunityClientMeeting" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmOpportunityProduct" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmOpportunityStageTransition" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmActivity" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmTask" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmNote" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmCompanyProfile" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmOrgWorkspaceSettings" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmQuickFilter" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmDashboardPin" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmCampaign" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmLandingPage" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmWebWidget" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmFormDefinition" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmAutomationRule" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmWorkflowDefinition" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmAutomationPendingStep" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmAutomationDistributionState" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmAutomationLeadDayCount" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmAutomationAttribution" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmProcessDefinition" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmSlaRule" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmSlaLeadTracking" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmTelephonyProvider" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmVirtualNumber" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmCallLog" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmCallDisposition" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmCtcCallAudit" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmIndiaVoiceWebhookLog" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmLeadImportJob" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmReportDefinition" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmNotification" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmOutboundMessageLog" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmAttendanceLog" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmSalesTeam" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmSalesGroup" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmAuditLog" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmIntegrationConfig" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmPaymentVerification" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmDocumentFolder" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmDocument" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmDocumentLink" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmProductTaxonomy" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmProduct" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmProductVariant" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmWarehouse" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmProductInventory" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmStockMovement" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmProductImage" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmPriceList" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmPriceListItem" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmPriceListAuditLog" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmQuote" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmQuoteLine" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmQuoteStatusTransition" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmQuoteTemplate" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmQuoteApproval" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmQuotePdfSnapshot" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmQuoteComment" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmQuoteEngagementEvent" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmQuotePortalAccess" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmInvoice" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmSequence" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmOrder" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmOrderLine" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmFormSet" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmFieldValue" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmSetSelectionLog" RENAME COLUMN "tenantId" TO "orgId";
ALTER TABLE "app_quikcredflow"."CrmFileAttachment" RENAME COLUMN "tenantId" TO "orgId";

-- 2. indexes + FK to quikit.Org
-- CreateIndex
CREATE INDEX "CrmAttendanceLog_orgId_idx" ON "app_quikcredflow"."CrmAttendanceLog"("orgId");

-- CreateIndex
CREATE INDEX "CrmAuditLog_orgId_idx" ON "app_quikcredflow"."CrmAuditLog"("orgId");

-- CreateIndex
CREATE INDEX "CrmAutomationAttribution_orgId_idx" ON "app_quikcredflow"."CrmAutomationAttribution"("orgId");

-- CreateIndex
CREATE INDEX "CrmAutomationDistributionState_orgId_idx" ON "app_quikcredflow"."CrmAutomationDistributionState"("orgId");

-- CreateIndex
CREATE INDEX "CrmAutomationLeadDayCount_orgId_idx" ON "app_quikcredflow"."CrmAutomationLeadDayCount"("orgId");

-- CreateIndex
CREATE INDEX "CrmAutomationPendingStep_orgId_idx" ON "app_quikcredflow"."CrmAutomationPendingStep"("orgId");

-- CreateIndex
CREATE INDEX "CrmAutomationRule_orgId_idx" ON "app_quikcredflow"."CrmAutomationRule"("orgId");

-- CreateIndex
CREATE INDEX "CrmCompanyProfile_orgId_idx" ON "app_quikcredflow"."CrmCompanyProfile"("orgId");

-- CreateIndex
CREATE INDEX "CrmDashboardPin_orgId_idx" ON "app_quikcredflow"."CrmDashboardPin"("orgId");

-- CreateIndex
CREATE INDEX "CrmDocument_orgId_idx" ON "app_quikcredflow"."CrmDocument"("orgId");

-- CreateIndex
CREATE INDEX "CrmDocumentLink_orgId_idx" ON "app_quikcredflow"."CrmDocumentLink"("orgId");

-- CreateIndex
CREATE INDEX "CrmFieldValue_orgId_idx" ON "app_quikcredflow"."CrmFieldValue"("orgId");

-- CreateIndex
CREATE INDEX "CrmFileAttachment_orgId_idx" ON "app_quikcredflow"."CrmFileAttachment"("orgId");

-- CreateIndex
CREATE INDEX "CrmFormSet_orgId_idx" ON "app_quikcredflow"."CrmFormSet"("orgId");

-- CreateIndex
CREATE INDEX "CrmIntegrationConfig_orgId_idx" ON "app_quikcredflow"."CrmIntegrationConfig"("orgId");

-- CreateIndex
CREATE INDEX "CrmInvoice_orgId_idx" ON "app_quikcredflow"."CrmInvoice"("orgId");

-- CreateIndex
CREATE INDEX "CrmLeadAttachment_orgId_idx" ON "app_quikcredflow"."CrmLeadAttachment"("orgId");

-- CreateIndex
CREATE INDEX "CrmLeadListView_orgId_idx" ON "app_quikcredflow"."CrmLeadListView"("orgId");

-- CreateIndex
CREATE INDEX "CrmLeadSavedList_orgId_idx" ON "app_quikcredflow"."CrmLeadSavedList"("orgId");

-- CreateIndex
CREATE INDEX "CrmNote_orgId_idx" ON "app_quikcredflow"."CrmNote"("orgId");

-- CreateIndex
CREATE INDEX "CrmNotification_orgId_idx" ON "app_quikcredflow"."CrmNotification"("orgId");

-- CreateIndex
CREATE INDEX "CrmOpportunityClientMeeting_orgId_idx" ON "app_quikcredflow"."CrmOpportunityClientMeeting"("orgId");

-- CreateIndex
CREATE INDEX "CrmOpportunityProduct_orgId_idx" ON "app_quikcredflow"."CrmOpportunityProduct"("orgId");

-- CreateIndex
CREATE INDEX "CrmOpportunityStageTransition_orgId_idx" ON "app_quikcredflow"."CrmOpportunityStageTransition"("orgId");

-- CreateIndex
CREATE INDEX "CrmOrderLine_orgId_idx" ON "app_quikcredflow"."CrmOrderLine"("orgId");

-- CreateIndex
CREATE INDEX "CrmOrgWorkspaceSettings_orgId_idx" ON "app_quikcredflow"."CrmOrgWorkspaceSettings"("orgId");

-- CreateIndex
CREATE INDEX "CrmPaymentVerification_orgId_idx" ON "app_quikcredflow"."CrmPaymentVerification"("orgId");

-- CreateIndex
CREATE INDEX "CrmPriceListAuditLog_orgId_idx" ON "app_quikcredflow"."CrmPriceListAuditLog"("orgId");

-- CreateIndex
CREATE INDEX "CrmPriceListItem_orgId_idx" ON "app_quikcredflow"."CrmPriceListItem"("orgId");

-- CreateIndex
CREATE INDEX "CrmProductImage_orgId_idx" ON "app_quikcredflow"."CrmProductImage"("orgId");

-- CreateIndex
CREATE INDEX "CrmProductInventory_orgId_idx" ON "app_quikcredflow"."CrmProductInventory"("orgId");

-- CreateIndex
CREATE INDEX "CrmProductTaxonomy_orgId_idx" ON "app_quikcredflow"."CrmProductTaxonomy"("orgId");

-- CreateIndex
CREATE INDEX "CrmProductVariant_orgId_idx" ON "app_quikcredflow"."CrmProductVariant"("orgId");

-- CreateIndex
CREATE INDEX "CrmQuickFilter_orgId_idx" ON "app_quikcredflow"."CrmQuickFilter"("orgId");

-- CreateIndex
CREATE INDEX "CrmQuoteApproval_orgId_idx" ON "app_quikcredflow"."CrmQuoteApproval"("orgId");

-- CreateIndex
CREATE INDEX "CrmQuoteComment_orgId_idx" ON "app_quikcredflow"."CrmQuoteComment"("orgId");

-- CreateIndex
CREATE INDEX "CrmQuoteEngagementEvent_orgId_idx" ON "app_quikcredflow"."CrmQuoteEngagementEvent"("orgId");

-- CreateIndex
CREATE INDEX "CrmQuoteLine_orgId_idx" ON "app_quikcredflow"."CrmQuoteLine"("orgId");

-- CreateIndex
CREATE INDEX "CrmQuotePdfSnapshot_orgId_idx" ON "app_quikcredflow"."CrmQuotePdfSnapshot"("orgId");

-- CreateIndex
CREATE INDEX "CrmQuotePortalAccess_orgId_idx" ON "app_quikcredflow"."CrmQuotePortalAccess"("orgId");

-- CreateIndex
CREATE INDEX "CrmQuoteStatusTransition_orgId_idx" ON "app_quikcredflow"."CrmQuoteStatusTransition"("orgId");

-- CreateIndex
CREATE INDEX "CrmQuoteTemplate_orgId_idx" ON "app_quikcredflow"."CrmQuoteTemplate"("orgId");

-- CreateIndex
CREATE INDEX "CrmSequence_orgId_idx" ON "app_quikcredflow"."CrmSequence"("orgId");

-- CreateIndex
CREATE INDEX "CrmSetSelectionLog_orgId_idx" ON "app_quikcredflow"."CrmSetSelectionLog"("orgId");

-- CreateIndex
CREATE INDEX "CrmSlaLeadTracking_orgId_idx" ON "app_quikcredflow"."CrmSlaLeadTracking"("orgId");

-- CreateIndex
CREATE INDEX "CrmStockMovement_orgId_idx" ON "app_quikcredflow"."CrmStockMovement"("orgId");

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmPermissionTemplate" ADD CONSTRAINT "CrmPermissionTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmAccount" ADD CONSTRAINT "CrmAccount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmContact" ADD CONSTRAINT "CrmContact_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmLead" ADD CONSTRAINT "CrmLead_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."LeadSquaredSyncMap" ADD CONSTRAINT "LeadSquaredSyncMap_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmLeadAttachment" ADD CONSTRAINT "CrmLeadAttachment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmLeadListView" ADD CONSTRAINT "CrmLeadListView_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmLeadSavedList" ADD CONSTRAINT "CrmLeadSavedList_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmLeadSource" ADD CONSTRAINT "CrmLeadSource_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmOpportunity" ADD CONSTRAINT "CrmOpportunity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmOpportunityClientMeeting" ADD CONSTRAINT "CrmOpportunityClientMeeting_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmOpportunityProduct" ADD CONSTRAINT "CrmOpportunityProduct_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmOpportunityStageTransition" ADD CONSTRAINT "CrmOpportunityStageTransition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmActivity" ADD CONSTRAINT "CrmActivity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmTask" ADD CONSTRAINT "CrmTask_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmNote" ADD CONSTRAINT "CrmNote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmCompanyProfile" ADD CONSTRAINT "CrmCompanyProfile_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmOrgWorkspaceSettings" ADD CONSTRAINT "CrmOrgWorkspaceSettings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmQuickFilter" ADD CONSTRAINT "CrmQuickFilter_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmDashboardPin" ADD CONSTRAINT "CrmDashboardPin_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmCampaign" ADD CONSTRAINT "CrmCampaign_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmLandingPage" ADD CONSTRAINT "CrmLandingPage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmWebWidget" ADD CONSTRAINT "CrmWebWidget_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmFormDefinition" ADD CONSTRAINT "CrmFormDefinition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmAutomationRule" ADD CONSTRAINT "CrmAutomationRule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmWorkflowDefinition" ADD CONSTRAINT "CrmWorkflowDefinition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmAutomationPendingStep" ADD CONSTRAINT "CrmAutomationPendingStep_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmAutomationDistributionState" ADD CONSTRAINT "CrmAutomationDistributionState_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmAutomationLeadDayCount" ADD CONSTRAINT "CrmAutomationLeadDayCount_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmAutomationAttribution" ADD CONSTRAINT "CrmAutomationAttribution_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmProcessDefinition" ADD CONSTRAINT "CrmProcessDefinition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmSlaRule" ADD CONSTRAINT "CrmSlaRule_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmSlaLeadTracking" ADD CONSTRAINT "CrmSlaLeadTracking_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmTelephonyProvider" ADD CONSTRAINT "CrmTelephonyProvider_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmVirtualNumber" ADD CONSTRAINT "CrmVirtualNumber_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmCallLog" ADD CONSTRAINT "CrmCallLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmCallDisposition" ADD CONSTRAINT "CrmCallDisposition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmCtcCallAudit" ADD CONSTRAINT "CrmCtcCallAudit_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmIndiaVoiceWebhookLog" ADD CONSTRAINT "CrmIndiaVoiceWebhookLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmLeadImportJob" ADD CONSTRAINT "CrmLeadImportJob_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmReportDefinition" ADD CONSTRAINT "CrmReportDefinition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmNotification" ADD CONSTRAINT "CrmNotification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmOutboundMessageLog" ADD CONSTRAINT "CrmOutboundMessageLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmAttendanceLog" ADD CONSTRAINT "CrmAttendanceLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmSalesTeam" ADD CONSTRAINT "CrmSalesTeam_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmSalesGroup" ADD CONSTRAINT "CrmSalesGroup_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmAuditLog" ADD CONSTRAINT "CrmAuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmIntegrationConfig" ADD CONSTRAINT "CrmIntegrationConfig_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmPaymentVerification" ADD CONSTRAINT "CrmPaymentVerification_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmDocumentFolder" ADD CONSTRAINT "CrmDocumentFolder_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmDocument" ADD CONSTRAINT "CrmDocument_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmDocumentLink" ADD CONSTRAINT "CrmDocumentLink_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmProductTaxonomy" ADD CONSTRAINT "CrmProductTaxonomy_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmProduct" ADD CONSTRAINT "CrmProduct_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmProductVariant" ADD CONSTRAINT "CrmProductVariant_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmWarehouse" ADD CONSTRAINT "CrmWarehouse_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmProductInventory" ADD CONSTRAINT "CrmProductInventory_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmStockMovement" ADD CONSTRAINT "CrmStockMovement_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmProductImage" ADD CONSTRAINT "CrmProductImage_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmPriceList" ADD CONSTRAINT "CrmPriceList_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmPriceListItem" ADD CONSTRAINT "CrmPriceListItem_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmPriceListAuditLog" ADD CONSTRAINT "CrmPriceListAuditLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmQuote" ADD CONSTRAINT "CrmQuote_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmQuoteLine" ADD CONSTRAINT "CrmQuoteLine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmQuoteStatusTransition" ADD CONSTRAINT "CrmQuoteStatusTransition_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmQuoteTemplate" ADD CONSTRAINT "CrmQuoteTemplate_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmQuoteApproval" ADD CONSTRAINT "CrmQuoteApproval_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmQuotePdfSnapshot" ADD CONSTRAINT "CrmQuotePdfSnapshot_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmQuoteComment" ADD CONSTRAINT "CrmQuoteComment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmQuoteEngagementEvent" ADD CONSTRAINT "CrmQuoteEngagementEvent_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmQuotePortalAccess" ADD CONSTRAINT "CrmQuotePortalAccess_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmInvoice" ADD CONSTRAINT "CrmInvoice_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmSequence" ADD CONSTRAINT "CrmSequence_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmOrder" ADD CONSTRAINT "CrmOrder_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmOrderLine" ADD CONSTRAINT "CrmOrderLine_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmFormSet" ADD CONSTRAINT "CrmFormSet_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmFieldValue" ADD CONSTRAINT "CrmFieldValue_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmSetSelectionLog" ADD CONSTRAINT "CrmSetSelectionLog_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_quikcredflow"."CrmFileAttachment" ADD CONSTRAINT "CrmFileAttachment_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "quikit"."Org"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAccount_tenantId_defaultPriceListId_idx" RENAME TO "CrmAccount_orgId_defaultPriceListId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAccount_tenantId_deletedAt_idx" RENAME TO "CrmAccount_orgId_deletedAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAccount_tenantId_idx" RENAME TO "CrmAccount_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAccount_tenantId_industryKey_idx" RENAME TO "CrmAccount_orgId_industryKey_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAccount_tenantId_name_idx" RENAME TO "CrmAccount_orgId_name_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAccount_tenantId_ownerId_idx" RENAME TO "CrmAccount_orgId_ownerId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAccount_tenantId_parentAccountId_idx" RENAME TO "CrmAccount_orgId_parentAccountId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAccount_tenantId_segmentEnum_idx" RENAME TO "CrmAccount_orgId_segmentEnum_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAccount_tenantId_status_idx" RENAME TO "CrmAccount_orgId_status_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmActivity_tenantId_idx" RENAME TO "CrmActivity_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmActivity_tenantId_ownerId_occurredAt_idx" RENAME TO "CrmActivity_orgId_ownerId_occurredAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmActivity_tenantId_relatedKind_relatedObjectId_idx" RENAME TO "CrmActivity_orgId_relatedKind_relatedObjectId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmActivity_tenantId_relatedOrphanedAt_idx" RENAME TO "CrmActivity_orgId_relatedOrphanedAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmActivity_tenantId_sourceSystem_externalId_key" RENAME TO "CrmActivity_orgId_sourceSystem_externalId_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAttendanceLog_tenantId_userId_idx" RENAME TO "CrmAttendanceLog_orgId_userId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAuditLog_tenantId_createdAt_idx" RENAME TO "CrmAuditLog_orgId_createdAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAuditLog_tenantId_module_resourceId_idx" RENAME TO "CrmAuditLog_orgId_module_resourceId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAuditLog_tenantId_userId_createdAt_idx" RENAME TO "CrmAuditLog_orgId_userId_createdAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAutomationAttribution_tenantId_engineSource_idx" RENAME TO "CrmAutomationAttribution_orgId_engineSource_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAutomationAttribution_tenantId_leadId_createdAt_idx" RENAME TO "CrmAutomationAttribution_orgId_leadId_createdAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAutomationDistributionState_tenantId_workflowId_nodeId_key" RENAME TO "CrmAutomationDistributionState_orgId_workflowId_nodeId_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAutomationLeadDayCount_tenantId_leadId_day_key" RENAME TO "CrmAutomationLeadDayCount_orgId_leadId_day_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAutomationLeadDayCount_tenantId_terminated_idx" RENAME TO "CrmAutomationLeadDayCount_orgId_terminated_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAutomationPendingStep_tenantId_status_resumeAt_idx" RENAME TO "CrmAutomationPendingStep_orgId_status_resumeAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAutomationPendingStep_tenantId_workflowId_leadId_idx" RENAME TO "CrmAutomationPendingStep_orgId_workflowId_leadId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmAutomationRule_tenantId_isActive_sortOrder_idx" RENAME TO "CrmAutomationRule_orgId_isActive_sortOrder_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmCallDisposition_tenantId_code_key" RENAME TO "CrmCallDisposition_orgId_code_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmCallDisposition_tenantId_idx" RENAME TO "CrmCallDisposition_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmCallDisposition_tenantId_name_key" RENAME TO "CrmCallDisposition_orgId_name_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmCallLog_tenantId_callSid_key" RENAME TO "CrmCallLog_orgId_callSid_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmCallLog_tenantId_idx" RENAME TO "CrmCallLog_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmCallLog_tenantId_leadId_idx" RENAME TO "CrmCallLog_orgId_leadId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmCallLog_tenantId_providerCallSid_createdAt_idx" RENAME TO "CrmCallLog_orgId_providerCallSid_createdAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmCampaign_tenantId_idx" RENAME TO "CrmCampaign_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmCompanyProfile_tenantId_key" RENAME TO "CrmCompanyProfile_orgId_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmContact_tenantId_accountId_idx" RENAME TO "CrmContact_orgId_accountId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmContact_tenantId_deletedAt_idx" RENAME TO "CrmContact_orgId_deletedAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmContact_tenantId_email_idx" RENAME TO "CrmContact_orgId_email_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmContact_tenantId_idx" RENAME TO "CrmContact_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmContact_tenantId_ownerId_idx" RENAME TO "CrmContact_orgId_ownerId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmContact_tenantId_phone_idx" RENAME TO "CrmContact_orgId_phone_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmCtcCallAudit_tenantId_agentUserId_createdAt_idx" RENAME TO "CrmCtcCallAudit_orgId_agentUserId_createdAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmCtcCallAudit_tenantId_idx" RENAME TO "CrmCtcCallAudit_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmDashboardPin_tenantId_userId_idx" RENAME TO "CrmDashboardPin_orgId_userId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmDashboardPin_tenantId_userId_reportId_key" RENAME TO "CrmDashboardPin_orgId_userId_reportId_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmDocument_tenantId_deletedAt_idx" RENAME TO "CrmDocument_orgId_deletedAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmDocument_tenantId_refType_refId_idx" RENAME TO "CrmDocument_orgId_refType_refId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmDocumentFolder_tenantId_deletedAt_idx" RENAME TO "CrmDocumentFolder_orgId_deletedAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmDocumentFolder_tenantId_idx" RENAME TO "CrmDocumentFolder_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmDocumentFolder_tenantId_parentFolderId_idx" RENAME TO "CrmDocumentFolder_orgId_parentFolderId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmDocumentFolder_tenantId_refType_refId_idx" RENAME TO "CrmDocumentFolder_orgId_refType_refId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmDocumentLink_tenantId_deletedAt_idx" RENAME TO "CrmDocumentLink_orgId_deletedAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmDocumentLink_tenantId_refType_refId_idx" RENAME TO "CrmDocumentLink_orgId_refType_refId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmDocumentLink_tenantId_sourceDocumentId_idx" RENAME TO "CrmDocumentLink_orgId_sourceDocumentId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmDocumentLink_tenantId_targetFolderId_idx" RENAME TO "CrmDocumentLink_orgId_targetFolderId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmFieldValue_tenantId_fieldKey_valueDatetime_idx" RENAME TO "CrmFieldValue_orgId_fieldKey_valueDatetime_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmFieldValue_tenantId_fieldKey_valueNumber_idx" RENAME TO "CrmFieldValue_orgId_fieldKey_valueNumber_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmFieldValue_tenantId_fieldKey_valueText_idx" RENAME TO "CrmFieldValue_orgId_fieldKey_valueText_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmFileAttachment_tenantId_activityId_idx" RENAME TO "CrmFileAttachment_orgId_activityId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmFormDefinition_tenantId_idx" RENAME TO "CrmFormDefinition_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmFormSet_tenantId_surface_isDefault_idx" RENAME TO "CrmFormSet_orgId_surface_isDefault_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmFormSet_tenantId_surface_name_key" RENAME TO "CrmFormSet_orgId_surface_name_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmIndiaVoiceWebhookLog_tenantId_callSid_idx" RENAME TO "CrmIndiaVoiceWebhookLog_orgId_callSid_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmIndiaVoiceWebhookLog_tenantId_campid_idx" RENAME TO "CrmIndiaVoiceWebhookLog_orgId_campid_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmIndiaVoiceWebhookLog_tenantId_idx" RENAME TO "CrmIndiaVoiceWebhookLog_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmIndiaVoiceWebhookLog_tenantId_processDedupeKey_key" RENAME TO "CrmIndiaVoiceWebhookLog_orgId_processDedupeKey_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmIntegrationConfig_tenantId_name_key" RENAME TO "CrmIntegrationConfig_orgId_name_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmIntegrationConfig_tenantId_status_idx" RENAME TO "CrmIntegrationConfig_orgId_status_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmInvoice_tenantId_accountId_idx" RENAME TO "CrmInvoice_orgId_accountId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmInvoice_tenantId_invoiceNumber_key" RENAME TO "CrmInvoice_orgId_invoiceNumber_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmInvoice_tenantId_status_idx" RENAME TO "CrmInvoice_orgId_status_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLandingPage_tenantId_idx" RENAME TO "CrmLandingPage_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLandingPage_tenantId_slug_key" RENAME TO "CrmLandingPage_orgId_slug_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLead_tenantId_accountId_idx" RENAME TO "CrmLead_orgId_accountId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLead_tenantId_deletedAt_idx" RENAME TO "CrmLead_orgId_deletedAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLead_tenantId_idx" RENAME TO "CrmLead_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLead_tenantId_isStarred_idx" RENAME TO "CrmLead_orgId_isStarred_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLead_tenantId_ownerId_idx" RENAME TO "CrmLead_orgId_ownerId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLead_tenantId_sourceSystem_externalId_key" RENAME TO "CrmLead_orgId_sourceSystem_externalId_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLead_tenantId_stage_idx" RENAME TO "CrmLead_orgId_stage_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLeadAttachment_tenantId_leadId_idx" RENAME TO "CrmLeadAttachment_orgId_leadId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLeadImportJob_tenantId_batchId_idx" RENAME TO "CrmLeadImportJob_orgId_batchId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLeadImportJob_tenantId_entityType_sourceSystem_idempoten_key" RENAME TO "CrmLeadImportJob_orgId_entityType_sourceSystem_idempotencyK_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLeadImportJob_tenantId_entityType_status_nextRetryAt_idx" RENAME TO "CrmLeadImportJob_orgId_entityType_status_nextRetryAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLeadImportJob_tenantId_idx" RENAME TO "CrmLeadImportJob_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLeadImportJob_tenantId_status_idx" RENAME TO "CrmLeadImportJob_orgId_status_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLeadListView_tenantId_userId_idx" RENAME TO "CrmLeadListView_orgId_userId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLeadSavedList_tenantId_userId_idx" RENAME TO "CrmLeadSavedList_orgId_userId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLeadSource_tenantId_active_idx" RENAME TO "CrmLeadSource_orgId_active_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLeadSource_tenantId_idx" RENAME TO "CrmLeadSource_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmLeadSource_tenantId_name_key" RENAME TO "CrmLeadSource_orgId_name_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmNote_tenantId_relatedKind_relatedObjectId_idx" RENAME TO "CrmNote_orgId_relatedKind_relatedObjectId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmNotification_tenantId_userId_readAt_idx" RENAME TO "CrmNotification_orgId_userId_readAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOpportunity_tenantId_accountId_idx" RENAME TO "CrmOpportunity_orgId_accountId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOpportunity_tenantId_deletedAt_idx" RENAME TO "CrmOpportunity_orgId_deletedAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOpportunity_tenantId_idx" RENAME TO "CrmOpportunity_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOpportunity_tenantId_ownerId_idx" RENAME TO "CrmOpportunity_orgId_ownerId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOpportunity_tenantId_priceListId_idx" RENAME TO "CrmOpportunity_orgId_priceListId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOpportunity_tenantId_stage_idx" RENAME TO "CrmOpportunity_orgId_stage_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOpportunityClientMeeting_tenantId_opportunityId_idx" RENAME TO "CrmOpportunityClientMeeting_orgId_opportunityId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOpportunityProduct_tenantId_opportunityId_idx" RENAME TO "CrmOpportunityProduct_orgId_opportunityId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOpportunityStageTransition_tenantId_opportunityId_occurr_idx" RENAME TO "CrmOpportunityStageTransition_orgId_opportunityId_occurredA_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOrder_tenantId_accountId_idx" RENAME TO "CrmOrder_orgId_accountId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOrder_tenantId_deletedAt_idx" RENAME TO "CrmOrder_orgId_deletedAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOrder_tenantId_idx" RENAME TO "CrmOrder_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOrder_tenantId_orderNumber_key" RENAME TO "CrmOrder_orgId_orderNumber_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOrder_tenantId_status_idx" RENAME TO "CrmOrder_orgId_status_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOrderLine_tenantId_orderId_idx" RENAME TO "CrmOrderLine_orgId_orderId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOrgWorkspaceSettings_tenantId_key" RENAME TO "CrmOrgWorkspaceSettings_orgId_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmOutboundMessageLog_tenantId_idx" RENAME TO "CrmOutboundMessageLog_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmPaymentVerification_tenantId_status_idx" RENAME TO "CrmPaymentVerification_orgId_status_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmPermissionTemplate_tenantId_idx" RENAME TO "CrmPermissionTemplate_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmPermissionTemplate_tenantId_name_key" RENAME TO "CrmPermissionTemplate_orgId_name_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmPriceList_tenantId_customerTier_idx" RENAME TO "CrmPriceList_orgId_customerTier_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmPriceList_tenantId_deletedAt_idx" RENAME TO "CrmPriceList_orgId_deletedAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmPriceList_tenantId_idx" RENAME TO "CrmPriceList_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmPriceList_tenantId_isActive_idx" RENAME TO "CrmPriceList_orgId_isActive_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmPriceList_tenantId_regionCode_idx" RENAME TO "CrmPriceList_orgId_regionCode_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmPriceListAuditLog_tenantId_priceListId_createdAt_idx" RENAME TO "CrmPriceListAuditLog_orgId_priceListId_createdAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmPriceListItem_tenantId_priceListId_deletedAt_idx" RENAME TO "CrmPriceListItem_orgId_priceListId_deletedAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmPriceListItem_tenantId_priceListId_idx" RENAME TO "CrmPriceListItem_orgId_priceListId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmPriceListItem_tenantId_productId_idx" RENAME TO "CrmPriceListItem_orgId_productId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProcessDefinition_tenantId_idx" RENAME TO "CrmProcessDefinition_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProduct_tenantId_barcode_idx" RENAME TO "CrmProduct_orgId_barcode_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProduct_tenantId_brandId_idx" RENAME TO "CrmProduct_orgId_brandId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProduct_tenantId_categoryId_idx" RENAME TO "CrmProduct_orgId_categoryId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProduct_tenantId_deletedAt_idx" RENAME TO "CrmProduct_orgId_deletedAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProduct_tenantId_idx" RENAME TO "CrmProduct_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProduct_tenantId_isActive_idx" RENAME TO "CrmProduct_orgId_isActive_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProduct_tenantId_sku_key" RENAME TO "CrmProduct_orgId_sku_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProductImage_tenantId_productId_idx" RENAME TO "CrmProductImage_orgId_productId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProductInventory_tenantId_productId_idx" RENAME TO "CrmProductInventory_orgId_productId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProductInventory_tenantId_productId_variantId_warehouseI_key" RENAME TO "CrmProductInventory_orgId_productId_variantId_warehouseId_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProductInventory_tenantId_warehouseId_idx" RENAME TO "CrmProductInventory_orgId_warehouseId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProductTaxonomy_tenantId_kind_idx" RENAME TO "CrmProductTaxonomy_orgId_kind_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProductTaxonomy_tenantId_kind_name_parentId_key" RENAME TO "CrmProductTaxonomy_orgId_kind_name_parentId_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProductTaxonomy_tenantId_parentId_idx" RENAME TO "CrmProductTaxonomy_orgId_parentId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProductVariant_tenantId_productId_idx" RENAME TO "CrmProductVariant_orgId_productId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmProductVariant_tenantId_sku_key" RENAME TO "CrmProductVariant_orgId_sku_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuickFilter_tenantId_userId_module_idx" RENAME TO "CrmQuickFilter_orgId_userId_module_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuote_tenantId_accountId_idx" RENAME TO "CrmQuote_orgId_accountId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuote_tenantId_approvalStatus_idx" RENAME TO "CrmQuote_orgId_approvalStatus_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuote_tenantId_deletedAt_idx" RENAME TO "CrmQuote_orgId_deletedAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuote_tenantId_idx" RENAME TO "CrmQuote_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuote_tenantId_opportunityId_idx" RENAME TO "CrmQuote_orgId_opportunityId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuote_tenantId_ownerId_idx" RENAME TO "CrmQuote_orgId_ownerId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuote_tenantId_parentQuoteId_idx" RENAME TO "CrmQuote_orgId_parentQuoteId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuote_tenantId_portalTokenHash_key" RENAME TO "CrmQuote_orgId_portalTokenHash_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuote_tenantId_quoteNumber_key" RENAME TO "CrmQuote_orgId_quoteNumber_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuote_tenantId_status_idx" RENAME TO "CrmQuote_orgId_status_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuoteApproval_tenantId_quoteId_idx" RENAME TO "CrmQuoteApproval_orgId_quoteId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuoteApproval_tenantId_status_idx" RENAME TO "CrmQuoteApproval_orgId_status_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuoteComment_tenantId_quoteId_createdAt_idx" RENAME TO "CrmQuoteComment_orgId_quoteId_createdAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuoteEngagementEvent_tenantId_eventType_idx" RENAME TO "CrmQuoteEngagementEvent_orgId_eventType_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuoteEngagementEvent_tenantId_quoteId_createdAt_idx" RENAME TO "CrmQuoteEngagementEvent_orgId_quoteId_createdAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuoteLine_tenantId_quoteId_idx" RENAME TO "CrmQuoteLine_orgId_quoteId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuotePdfSnapshot_tenantId_quoteId_createdAt_idx" RENAME TO "CrmQuotePdfSnapshot_orgId_quoteId_createdAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuotePortalAccess_tenantId_quoteId_idx" RENAME TO "CrmQuotePortalAccess_orgId_quoteId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuoteStatusTransition_tenantId_quoteId_idx" RENAME TO "CrmQuoteStatusTransition_orgId_quoteId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuoteTemplate_tenantId_isActive_idx" RENAME TO "CrmQuoteTemplate_orgId_isActive_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmQuoteTemplate_tenantId_key_key" RENAME TO "CrmQuoteTemplate_orgId_key_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmReportDefinition_tenantId_idx" RENAME TO "CrmReportDefinition_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmSalesGroup_tenantId_idx" RENAME TO "CrmSalesGroup_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmSalesGroup_tenantId_name_key" RENAME TO "CrmSalesGroup_orgId_name_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmSalesTeam_tenantId_idx" RENAME TO "CrmSalesTeam_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmSalesTeam_tenantId_name_key" RENAME TO "CrmSalesTeam_orgId_name_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmSequence_tenantId_name_key" RENAME TO "CrmSequence_orgId_name_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmSetSelectionLog_tenantId_leadId_idx" RENAME TO "CrmSetSelectionLog_orgId_leadId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmSetSelectionLog_tenantId_wasOverridden_idx" RENAME TO "CrmSetSelectionLog_orgId_wasOverridden_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmSlaLeadTracking_tenantId_leadId_idx" RENAME TO "CrmSlaLeadTracking_orgId_leadId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmSlaLeadTracking_tenantId_status_idx" RENAME TO "CrmSlaLeadTracking_orgId_status_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmSlaRule_tenantId_idx" RENAME TO "CrmSlaRule_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmSlaRule_tenantId_sourceSystem_externalId_key" RENAME TO "CrmSlaRule_orgId_sourceSystem_externalId_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmStockMovement_tenantId_productId_createdAt_idx" RENAME TO "CrmStockMovement_orgId_productId_createdAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmStockMovement_tenantId_warehouseId_idx" RENAME TO "CrmStockMovement_orgId_warehouseId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmTask_tenantId_assignedToUserId_idx" RENAME TO "CrmTask_orgId_assignedToUserId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmTask_tenantId_idx" RENAME TO "CrmTask_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmTask_tenantId_status_idx" RENAME TO "CrmTask_orgId_status_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmTelephonyProvider_tenantId_idx" RENAME TO "CrmTelephonyProvider_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmVirtualNumber_tenantId_idx" RENAME TO "CrmVirtualNumber_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmVirtualNumber_tenantId_number_key" RENAME TO "CrmVirtualNumber_orgId_number_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmWarehouse_tenantId_code_key" RENAME TO "CrmWarehouse_orgId_code_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmWarehouse_tenantId_idx" RENAME TO "CrmWarehouse_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmWebWidget_tenantId_idx" RENAME TO "CrmWebWidget_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmWorkflowDefinition_tenantId_deletedAt_idx" RENAME TO "CrmWorkflowDefinition_orgId_deletedAt_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmWorkflowDefinition_tenantId_idx" RENAME TO "CrmWorkflowDefinition_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmWorkflowDefinition_tenantId_sourceSystem_externalId_key" RENAME TO "CrmWorkflowDefinition_orgId_sourceSystem_externalId_key";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."CrmWorkflowDefinition_tenantId_status_idx" RENAME TO "CrmWorkflowDefinition_orgId_status_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."LeadSquaredSyncMap_tenantId_idx" RENAME TO "LeadSquaredSyncMap_orgId_idx";

-- RenameIndex
ALTER INDEX "app_quikcredflow"."LeadSquaredSyncMap_tenantId_lsqProspectId_key" RENAME TO "LeadSquaredSyncMap_orgId_lsqProspectId_key";
