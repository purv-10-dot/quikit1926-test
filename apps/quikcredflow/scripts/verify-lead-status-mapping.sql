-- ─────────────────────────────────────────────────────────────────────────────
-- Verification queries — run after seed-lead-status-mapping.ts
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Count summary
SELECT
    (SELECT COUNT(*) FROM app_quikcrm."CrmLeadStatus")        AS total_statuses,
    (SELECT COUNT(*) FROM app_quikcrm."CrmLeadSubStatus")     AS total_sub_statuses,
    (SELECT COUNT(*) FROM app_quikcrm."CrmLeadStatusSubStatus") AS total_mappings;

-- 2. Full mapping tree: status → its sub-statuses
SELECT
    s.name                                     AS status,
    COUNT(m."leadSubStatusId")                 AS sub_status_count,
    STRING_AGG(ss.name, ', ' ORDER BY ss.name) AS sub_statuses
FROM app_quikcrm."CrmLeadStatus"          s
LEFT JOIN app_quikcrm."CrmLeadStatusSubStatus" m  ON m."leadStatusId"    = s.id
LEFT JOIN app_quikcrm."CrmLeadSubStatus"       ss ON ss.id               = m."leadSubStatusId"
GROUP BY s.id, s.name
ORDER BY s.name;

-- 3. Sub-statuses that map to more than one status (shared sub-statuses)
SELECT
    ss.name                                    AS sub_status,
    COUNT(m."leadStatusId")                    AS linked_to_n_statuses,
    STRING_AGG(s.name, ', ' ORDER BY s.name)   AS linked_statuses
FROM app_quikcrm."CrmLeadSubStatus"            ss
JOIN app_quikcrm."CrmLeadStatusSubStatus"      m  ON m."leadSubStatusId" = ss.id
JOIN app_quikcrm."CrmLeadStatus"               s  ON s.id                = m."leadStatusId"
GROUP BY ss.id, ss.name
HAVING COUNT(m."leadStatusId") > 1
ORDER BY linked_to_n_statuses DESC;

-- 4. Statuses with NO linked sub-statuses (should be 0 after full seed)
SELECT s.name AS status_without_sub_status
FROM app_quikcrm."CrmLeadStatus" s
WHERE NOT EXISTS (
    SELECT 1 FROM app_quikcrm."CrmLeadStatusSubStatus" m
    WHERE m."leadStatusId" = s.id
)
ORDER BY s.name;

-- 5. Specific spot-check: verify "Interested Followup Counselling" → "Interested for Demo"
SELECT
    s.name  AS status,
    ss.name AS sub_status
FROM app_quikcrm."CrmLeadStatus"              s
JOIN app_quikcrm."CrmLeadStatusSubStatus"     m  ON m."leadStatusId"    = s.id
JOIN app_quikcrm."CrmLeadSubStatus"           ss ON ss.id               = m."leadSubStatusId"
WHERE s.name = 'Interested Followup Counselling'
ORDER BY ss.name;
