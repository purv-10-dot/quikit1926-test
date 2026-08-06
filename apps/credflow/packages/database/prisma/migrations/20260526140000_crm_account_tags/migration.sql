-- Account filter labels (VIP, High Risk, …)
ALTER TABLE "app_quikcrm"."CrmAccount"
ADD COLUMN IF NOT EXISTS "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
