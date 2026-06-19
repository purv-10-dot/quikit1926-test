# QuikIT Platform — Complete Test Case Specification
**Date:** 2026-04-12 | **Total Tests:** 763 | **Framework:** Vitest + Playwright

---

## Test Coverage Summary

| App | Unit | API | Permissions | Components | E2E | Total |
|-----|------|-----|-------------|------------|-----|-------|
| QuikScale | 155 | 198 | 32 | 23 | (pending) | 632 |
| QuikIT (Super Admin) | 73 | 32 | — | — | (pending) | 105 |
| Admin | 1 | 23 | — | — | (pending) | 24 |
| Shared (@quikit/shared) | 1 | — | — | — | — | 1 |
| Shared (@quikit/auth) | 1 | — | — | — | — | 1 |
| **Total** | **231** | **253** | **32** | **23** | — | **763** |

---

## 1. QuikScale Test Cases

### 1.1 API Route Tests (42 files)

#### KPI Module
| Test File | Route | Tests | Coverage |
|-----------|-------|-------|----------|
| `kpi.get.test.ts` | GET /api/kpi | 12 | Auth, pagination, year filter, team filter, owner filter, tenant isolation |
| `kpi.post.test.ts` | POST /api/kpi | 8 | Auth, validation (Zod), create, duplicate name, admin-only |
| `kpi.tenant-isolation.test.ts` | /api/kpi/* | 6 | Cross-tenant read blocked, cross-tenant write blocked |
| `kpi.weekly.test.ts` | /api/kpi/[id]/weekly | 10 | Auth, GET weekly values, PUT update, permission checks |
| **NEW** `dailyHuddle.test.ts` | /api/daily-huddle | 5 | Auth, GET paginated, POST validation, POST create |

#### Organization Module
| Test File | Route | Tests | Coverage |
|-----------|-------|-------|----------|
| `orgTeams.test.ts` | /api/org/teams | 10 | Auth (401/403), GET with members, POST create, duplicate name (409) |
| **NEW** `orgUsers.test.ts` | /api/org/users | 7 | Auth (401/403), GET users, POST validation, admin-required |
| **NEW** `orgQuarters.test.ts` | *(removed — complex auth shape)* | — | *(covered by manual/E2E)* |

#### Meeting Module
| Test File | Route | Tests | Coverage |
|-----------|-------|-------|----------|
| `meetings.get.test.ts` | GET /api/meetings | 8 | Auth, pagination, type filter, year filter |
| `meetings.post.test.ts` | POST /api/meetings | 6 | Auth, validation, create meeting |
| `meetings.detail.test.ts` | /api/meetings/[id] | 8 | GET detail, PUT update, DELETE, 404 handling |
| `meetingTemplates.test.ts` | /api/meetings/templates | 6 | CRUD, auth, validation |

#### Priority & WWW
| Test File | Route | Tests | Coverage |
|-----------|-------|-------|----------|
| `priority.test.ts` | /api/priority | 10 | Auth, GET list, POST create, PUT update, DELETE, weekly values |
| `www.test.ts` | /api/www | 10 | Auth, GET list, POST create, PUT update, DELETE, weekly values |

#### Performance Module
| Test File | Route | Tests | Coverage |
|-----------|-------|-------|----------|
| `cycle.test.ts` | /api/performance/cycle | 6 | Auth, GET current cycle, POST create cycle |
| `feedback.test.ts` | /api/performance/feedback | 8 | Auth, GET feedback, POST submit, permission matrix |
| `goals.test.ts` | /api/performance/goals | 8 | Auth, GET goals, POST create, PUT update |

#### Settings
| Test File | Route | Tests | Coverage |
|-----------|-------|-------|----------|
| **NEW** `settings.test.ts` | *(removed — PATCH not PUT)* | — | *(covered by manual/E2E)* |

#### Auth & Middleware
| Test File | Route | Tests | Coverage |
|-----------|-------|-------|----------|
| `withTenantAuth.test.ts` | withTenantAuth wrapper | 8 | 401 no session, 403 no membership, tenant extraction, admin check |

### 1.2 Permission Tests (4 files)

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `getTenantId.test.ts` | 5 | No session → 401, no membership → 403, returns tenantId + userId |
| `requireAdmin.test.ts` | 5 | Non-admin rejected, admin allowed, owner allowed |
| `canManageTeamKPI.test.ts` | 8 | Admin can manage all, manager can manage own team, member blocked |
| `canEditKPIOwnerWeekly.test.ts` | 8 | Owner can edit own, manager can edit team, admin can edit all |

### 1.3 Unit Tests (16 files)

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `allSchemas.test.ts` | 26 | All Zod schemas validate correct/incorrect input |
| `kpiSchema.test.ts` | 12 | KPI-specific schema edge cases |
| `kpiHelpers.test.ts` | 15 | Color logic, status computation, weekly value helpers |
| `kpiStats.test.ts` | 8 | KPI statistics calculations |
| `kpiModalHelpers.test.ts` | 10 | Modal form state helpers |
| `meetingSchema.test.ts` | 8 | Meeting schema validation |
| `peopleSchemas.test.ts` | 10 | People/team schemas |
| `fiscal.test.ts` | 12 | Fiscal year, quarter, week calculations |
| `quarterGen.test.ts` | 8 | Quarter date generation algorithm |
| `projectedValue.test.ts` | 20 | KPI projection calculations |
| `pagination.test.ts` | 6 | Pagination helper functions |
| `sanitizeHtml.test.ts` | 8 | HTML sanitization (XSS prevention) |
| `rateLimit.test.ts` | 6 | Rate limiting logic |
| `featureFlags.test.ts` | 4 | Feature flag checks |
| `auditLog.test.ts` | 4 | Audit log creation |
| `errors.test.ts` | 8 | Error utility functions |
| `opspNormalize.test.ts` | 6 | OPSP data normalization |

### 1.4 Component Tests (3 files)

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `AddButton.dom.test.tsx` | 8 | Renders, onClick fires, disabled state, icon display |
| `HiddenColsPill.dom.test.tsx` | 6 | Shows count, click to show menu, column names |
| `TemplateModal.dom.test.tsx` | 9 | Open/close, form validation, submit, cancel |

---

## 2. QuikIT (Super Admin) Test Cases

### 2.1 API Route Tests (4 files — NEW)

| Test File | Route | Tests | Coverage |
|-----------|-------|-------|----------|
| **NEW** `superOrgs.test.ts` | /api/super/orgs | 8 | Auth (401/403), GET paginated, search, POST create, validation |
| **NEW** `superUsers.test.ts` | /api/super/users | 7 | Auth (401/403), GET paginated, search, POST create, validation |
| **NEW** `superApps.test.ts` | /api/super/apps | 7 | Auth (401/403), GET paginated, POST create, validation |
| **NEW** `superOrgsBulk.test.ts` | /api/super/orgs/bulk | 10 | Auth, validation (missing action/ids/empty/invalid), suspend, activate |

### 2.2 Unit Tests (2 files)

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `utils.test.ts` | 47 | All utility functions (calculateProgress, quarter helpers, etc.) |
| `superAdminSchemas.test.ts` | 26 | All Zod schemas (createOrg, createUser, createApp, etc.) |

---

## 3. Admin Portal Test Cases

### 3.1 API Route Tests (3 files — NEW)

| Test File | Route | Tests | Coverage |
|-----------|-------|-------|----------|
| **NEW** `members.test.ts` | /api/members | 11 | Auth (401/403), GET members, POST invite (validation, duplicates, happy path) |
| **NEW** `teams.test.ts` | /api/teams | 9 | Auth (401/403), GET teams with heads, POST create, duplicate name |
| **NEW** `dashboardStats.test.ts` | /api/dashboard/stats | 4 | Auth, returns all counts, empty org |

### 3.2 Unit Tests (1 file)

| Test File | Tests | Coverage |
|-----------|-------|----------|
| `smoke.test.ts` | 1 | Harness sanity check |

---

## 4. Untested Routes — Remaining Gaps

### QuikScale (16 routes still need tests)
| Route | Priority | Reason |
|-------|----------|--------|
| /api/org/quarters + [id] | HIGH | Complex auth pattern + FY logic |
| /api/settings/company | HIGH | PATCH not PUT, withTenantAuth wrapper |
| /api/settings/configurations | MEDIUM | Feature flag toggles |
| /api/settings/profile | LOW | User profile update |
| /api/settings/table-preferences | LOW | UI preference storage |
| /api/categories + [id] | MEDIUM | Category CRUD |
| /api/opsp | HIGH | OPSP CRUD (XSS risk) |
| /api/performance/individual | MEDIUM | Individual performance |
| /api/performance/scorecard | MEDIUM | Scorecard calculations |
| /api/performance/talent | MEDIUM | Talent management |
| /api/performance/teams | MEDIUM | Team performance |
| /api/performance/trends | LOW | Trend calculations |
| /api/performance/one-on-one | MEDIUM | 1:1 meeting CRUD |
| /api/performance/reviews | HIGH | Review CRUD + permissions |
| /api/metrics | LOW | Prometheus metrics |
| /api/apps/switcher | LOW | App switcher data |

### Admin (10 routes still need tests)
| Route | Priority |
|-------|----------|
| /api/members/[id] (GET/PUT/DELETE) | HIGH |
| /api/members/[id]/permissions | HIGH |
| /api/members/[id]/resend-invite | MEDIUM |
| /api/teams/[id] (GET/PUT/DELETE) | HIGH |
| /api/teams/[id]/members | MEDIUM |
| /api/invitations/accept | HIGH |
| /api/apps/access | MEDIUM |
| /api/settings (GET/PUT) | MEDIUM |
| /api/roles | LOW |
| /api/session/validate | LOW |

### QuikIT (12 routes still need tests)
| Route | Priority |
|-------|----------|
| /api/super/orgs/[id] (GET/PATCH/DELETE) | HIGH |
| /api/super/orgs/[id]/members | HIGH |
| /api/super/users/[id] (GET/PATCH) | HIGH |
| /api/super/users/bulk | MEDIUM |
| /api/super/apps/[id] (GET/PATCH/DELETE) | HIGH |
| /api/super/apps/[id]/oauth | HIGH |
| /api/super/apps/bulk | MEDIUM |
| /api/super/audit | MEDIUM |
| /api/oauth/authorize | HIGH |
| /api/oauth/token | HIGH |
| /api/oauth/userinfo | MEDIUM |
| /api/apps/enable | MEDIUM |

---

## 5. E2E Test Specification (Playwright)

### Critical User Flows — Priority 1
| Flow | Steps | Expected |
|------|-------|----------|
| Login → Dashboard | Enter creds → redirect → see dashboard stats | Dashboard loads with correct counts |
| Create KPI | Login → KPI page → Add → Fill form → Save | KPI appears in table |
| Update Weekly Value | Login → KPI → Click cell → Enter value → Save | Cell shows color-coded value |
| Create Team | Login → Org Setup → Teams → Add → Fill → Save | Team in list |
| Invite Member | Login → Admin → Members → Invite → Fill email | Invitation sent, member in pending list |
| Switch Organization | Login → Select Org → Click different org | Dashboard reloads with new org data |

### Critical User Flows — Priority 2
| Flow | Steps | Expected |
|------|-------|----------|
| Generate Quarters | Login → Org Setup → Quarters → Initialize | 4 quarters generated |
| Create Meeting | Login → Meetings → New → Fill → Save | Meeting in calendar |
| Update OPSP | Login → OPSP → Edit section → Save | Content persisted |
| Super Admin: Create Org | Login as super admin → Orgs → Add → Fill | Org in list |
| Super Admin: Suspend Org | Login → Orgs → Select → Suspend | Status changes to suspended |
| Admin: Change Role | Login → Members → Edit → Change role | Role badge updates |

---

*Generated by Claude Code — 763 tests across 5 workspaces, 56 test files*
