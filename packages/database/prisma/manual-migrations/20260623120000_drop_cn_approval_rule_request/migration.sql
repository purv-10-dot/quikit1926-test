-- Drop the orphaned threshold-based approval system (CnApprovalRule / CnApprovalRequest).
-- These were never wired into any document flow (checkApprovalGate was never called);
-- live approvals run on the workflow engine (CnApprovalInstance / CnApprovalHistory).

DROP TABLE IF EXISTS "app_quikinfra"."CnApprovalRequest";
DROP TABLE IF EXISTS "app_quikinfra"."CnApprovalRule";
