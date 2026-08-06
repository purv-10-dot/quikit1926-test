-- Add dedicated lead description field (app_quikcrm)

ALTER TABLE "app_quikcrm"."CrmLead"
  ADD COLUMN IF NOT EXISTS "descriptionInformation" TEXT;
