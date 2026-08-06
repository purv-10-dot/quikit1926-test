-- [P0.1] Seed fixtures for first_db_crm_autotest ONLY (AUTOMATION-BUILD-PLAN Task 0.1).
--
-- first_db_crm_autotest is a --no-owner pg_restore copy of first_db_crm. These
-- deterministic, clearly-labelled AUTOTEST leads let R19 and R1 be evaluated
-- end-to-end in Phase 1 without touching the protected first_db_crm.
--
-- Idempotent: deletes prior autotest fixtures (source='autotest-fixture'), re-inserts.
-- Tenant = cmpzc0bn70000a1xp642kgwmf (primary; = LEADSQUARED_DEFAULT_ORG_ID).
-- Canonical substatus spellings are taken verbatim from the tenant's live
-- leadPipelineConfig.dependentRules.statusToSubstatuses:
--   statusToSubstatuses["Disqualified"] == R1's 7 substatuses (exactly these strings)
--   statusToSubstatuses["Negotiation"]  == ["Negotiation"] (R19)
-- Both target stages ("Negotiation", "Disqualified") already exist in
-- leadPipelineConfig.stages, so stage-only transitions pass cascade validation.
--
-- Apply: psql -U postgres -d first_db_crm_autotest -v ON_ERROR_STOP=1 -f scripts/autotest-seed-fixtures.sql

BEGIN;

DELETE FROM app_quikcrm."CrmLead" WHERE source = 'autotest-fixture';

INSERT INTO app_quikcrm."CrmLead"
  (id, "tenantId", name, stage, status, substatus, source, "createdAt", "updatedAt")
VALUES
  -- R19: substatus IN ["Negotiation"] -> stage = "Negotiation"
  ('autotest-r19-match', 'cmpzc0bn70000a1xp642kgwmf', 'AUTOTEST R19 match', 'New Lead', 'Open', 'Negotiation', 'autotest-fixture', now(), now()),

  -- R1 full match: substatus IN [7] AND stage IN [15 incl. "New Lead"] -> stage = "Disqualified"
  ('autotest-r1-match-1', 'cmpzc0bn70000a1xp642kgwmf', 'AUTOTEST R1 match 1', 'New Lead', 'Open', 'Not using Tally/ Busy', 'autotest-fixture', now(), now()),
  ('autotest-r1-match-2', 'cmpzc0bn70000a1xp642kgwmf', 'AUTOTEST R1 match 2', 'New Lead', 'Open', 'Invalid client details ( number/email)', 'autotest-fixture', now(), now()),
  ('autotest-r1-match-3', 'cmpzc0bn70000a1xp642kgwmf', 'AUTOTEST R1 match 3', 'New Lead', 'Open', 'other ( self notes)', 'autotest-fixture', now(), now()),
  ('autotest-r1-match-4', 'cmpzc0bn70000a1xp642kgwmf', 'AUTOTEST R1 match 4', 'New Lead', 'Open', 'Student Lead', 'autotest-fixture', now(), now()),
  ('autotest-r1-match-5', 'cmpzc0bn70000a1xp642kgwmf', 'AUTOTEST R1 match 5', 'New Lead', 'Open', 'Language Barrier', 'autotest-fixture', now(), now()),
  ('autotest-r1-match-6', 'cmpzc0bn70000a1xp642kgwmf', 'AUTOTEST R1 match 6', 'New Lead', 'Open', 'Looking to buy Tally/ Busy', 'autotest-fixture', now(), now()),
  ('autotest-r1-match-7', 'cmpzc0bn70000a1xp642kgwmf', 'AUTOTEST R1 match 7', 'New Lead', 'Open', 'Unable to sync (Oracle user)', 'autotest-fixture', now(), now()),

  -- AND-negative: substatus in R1 list but stage NOT in the 15-list -> must NOT fire
  ('autotest-r1-substatus-only', 'cmpzc0bn70000a1xp642kgwmf', 'AUTOTEST R1 substatus-only (stage out of list)', 'Onboarding Done', 'Open', 'Student Lead', 'autotest-fixture', now(), now()),

  -- AND-negative: stage in the 15-list but substatus NOT in R1 list -> must NOT fire
  ('autotest-r1-stage-only', 'cmpzc0bn70000a1xp642kgwmf', 'AUTOTEST R1 stage-only (substatus out of list)', 'New Lead', 'Open', 'Support Issue', 'autotest-fixture', now(), now());

COMMIT;
