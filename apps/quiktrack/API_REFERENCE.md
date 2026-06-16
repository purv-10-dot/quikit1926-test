# QuikTrack — API Reference

Complete API documentation for every user-facing endpoint, grouped by feature/resource.

## Conventions

- **Base URL (prod):** `https://quikit-quiktrack.vercel.app`
- **Auth:** Session cookie (set by `/auth-handoff` after launcher SSO). Server uses NextAuth JWT cookie + Redis-backed validation.
- **Tenant scoping:** Every endpoint scopes data to the caller's active `orgId` (taken from session). Cross-tenant access returns `404`.
- **Response envelope:** All endpoints return either `{ "success": true, "data": ... }` or `{ "success": false, "error": "..." }`.
- **HTTP status codes:** `200` OK, `201` Created, `204` No Content, `400` Validation, `401` Unauthenticated, `403` Forbidden, `404` Not Found, `409` Conflict, `422` Semantic Error, `500` Server Error.
- **Auth guards:**
  - `withOrgAuth` — requires session + active OrgMember in current org.
  - `withProjectAccess` — additionally requires project membership.
  - `requireAdmin` — additionally requires `admin` app role.
  - `requirePerm(resource, action)` — checks fine-grained permission.

---

# 1. Authentication & Session

## 1.1 `GET /api/auth/[...nextauth]`
NextAuth handler — login, callback, session, signout. Internal. Not documented further.

## 1.2 `GET /api/session/validate`
Background session validation.

| Field | Value |
|---|---|
| Auth | Session cookie required |
| Response | `{ valid: true, hasTenant: true }` if active; `{ valid: false, reason: "unauthenticated" \| "deactivated" \| "app_access_revoked" }` |
| Side effects | None |

## 1.3 `GET /auth-handoff?token=<jwt>`
Cross-domain handoff endpoint. Verifies INTERNAL_SECRET-signed token, mints a NextAuth session cookie on this domain, redirects to `to` claim.

---

# 2. Current User (Me)

## 2.1 `GET /api/me/permissions`
Returns the caller's resolved permission set for QuikTrack in current org.

| Field | Value |
|---|---|
| Auth | `withOrgAuth` |
| Response | `{ success: true, data: { permissions: { Issue: ["view","create",...], ... }, navigation: [...], appRole: { id, name }, ... } }` |
| Side effects | **Seeds default `admin` + `Member` app roles on first call** (cached 5min/process/org). |

## 2.2 `GET /api/me/access`
Returns access summary: org, app role, projects, admin flags.

| Field | Value |
|---|---|
| Auth | `withOrgAuth` |
| Response | `{ success: true, data: { isOrgAdmin, isAppAdmin, isAdmin, hasProjects, projectCount, orgName, roleName, adminEmails } }` |

## 2.3 `GET /api/me/project-permissions`
Returns per-project permission overrides for current user.

| Field | Value |
|---|---|
| Auth | `withOrgAuth` |
| Response | `{ success: true, data: { [projectId]: { permissions, fieldPermissions } } }` |

## 2.4 `GET /api/me/tour-status` · `POST /api/me/tour-status`
Onboarding tour state.

| Field | Value |
|---|---|
| Auth | `withOrgAuth` |
| GET response | `{ success: true, data: { completed: boolean, step?: number } }` |
| POST body | `{ completed?: boolean, step?: number }` |
| POST response | `{ success: true }` |

---

# 3. Organization & Users

## 3.1 `GET /api/org/users`
List org members with QuikTrack app access.

| Field | Value |
|---|---|
| Auth | `withOrgAuth` |
| Response | `{ success: true, data: [{ membershipId, userId, firstName, lastName, email, avatar, role, status, joinedAt, appRoleId, appRoleName, teams }] }` |
| Notes | Filtered by `UserAppAccess(quiktrack)` rows in current org. |

## 3.2 `POST /api/org/users`
Invite or create a user.

| Field | Value |
|---|---|
| Auth | `withOrgAuth` |
| Body | `firstName, lastName, email, password?, role? (owner\|admin\|member), appRoleId?, teamIds?[], projectIds?[], projects?[{projectId, projectRoleId?}], linkExistingUserId?, invitationMethod? (native\|sso)` |
| Response | `{ success: true, data: { user, tempPassword? }, meta: { usedDefaultPassword, newUserCreated } }` (201) |
| Side effects | Sends invitation email; creates `OrgMember`, `UserAppAccess`, role assignments. |

## 3.3 `GET /api/org/users/[id]`
| Auth | `withOrgAuth` |
| Path params | `id` (userId) |
| Response | `{ success: true, data: { ...user, projects, teams, roles } }` |

## 3.4 `PATCH /api/org/users/[id]`
| Auth | `withOrgAuth` |
| Body | `firstName?, lastName?, role?, status?` |
| Response | `{ success: true, data: updated }` |

## 3.5 `DELETE /api/org/users/[id]`
Soft-deletes membership (preserves history).
| Auth | `withOrgAuth` |
| Response | `{ success: true, data: { id } }` |

## 3.6 `PATCH /api/org/users/[id]/role`
Change user's app role.
| Auth | `requireAdmin` |
| Body | `{ roleId }` |
| Response | `{ success: true, data: { userId, roleId, roleName } }` |

## 3.7 `PATCH /api/org/users/[id]/status`
Activate / deactivate user.
| Auth | `requireAdmin` |
| Body | `{ status: "active" \| "inactive" }` |
| Response | `{ success: true, data: { id, status } }` |
| Side effects | Deactivated user's session terminates within 5min. |

## 3.8 `PATCH /api/org/users/[id]/permissions`
Set per-user permission overrides.
| Auth | `requireAdmin` |
| Body | `{ extras: [{ resource, action, allow }] }` |
| Response | `{ success: true, data: { count } }` |

---

# 4. Roles & Permissions

## 4.1 `GET /api/org/roles`
| Auth | `requireAdmin` |
| Response | `{ success: true, data: [{ id, name, description, isDefault, isSystem, memberCount }] }` |

## 4.2 `POST /api/org/roles`
| Auth | `requireAdmin` |
| Body | `{ name, description?, isDefault? }` |
| Response | `{ success: true, data: role }` (201) |

## 4.3 `GET /api/org/roles/[id]`
| Auth | `requireAdmin` |
| Response | `{ success: true, data: { ...role, permissions, navigation, fieldPermissions, members } }` |

## 4.4 `PATCH /api/org/roles/[id]`
| Body | `{ name?, description?, isDefault? }` |
| Response | `{ success: true, data: updated }` |

## 4.5 `DELETE /api/org/roles/[id]`
| Response | `{ success: true, data: { id } }` |
| Errors | `409` if role has members. |

## 4.6 `PATCH /api/org/roles/[id]/permissions`
Set resource-action grants for a role.
| Body | `{ grants: [{ resource, action }] }` |
| Response | `{ success: true, data: { count } }` |

## 4.7 `PATCH /api/org/roles/[id]/navigation`
Toggle nav keys visible to role.
| Body | `{ navKeys: string[] }` |
| Response | `{ success: true, data: { count } }` |

## 4.8 `PATCH /api/org/roles/[id]/field-permissions`
Set field-level access (`editable` \| `readonly` \| `hidden` \| `required`).
| Body | `{ rows: [{ entity, field, level }] }` |
| Response | `{ success: true, data: { count } }` |

## 4.9 `GET /api/org/roles/[id]/members`
| Response | `{ success: true, data: [{ userId, firstName, lastName, email, assignedAt }] }` |

---

# 5. Projects

## 5.1 `GET /api/projects`
List projects visible to caller.

| Auth | `withOrgAuth` |
| Query | `search?, filter? (CSV), sort? (name\|updatedAt), order? (asc\|desc), page?, pageSize? (max 100)` |
| Response | `{ success: true, data: { projects: [...], total, page, pageSize, totalPages } }` |
| Notes | Non-admins see only projects they're members of. |

## 5.2 `POST /api/projects`
| Auth | `withOrgAuth + Project:create` |
| Body | `{ projectKey, name, description?, projectType?, icon?, color?, startDate?, endDate?, leadUserId? }` |
| Response | `{ success: true, data: project }` (201) |
| Errors | `409` if `projectKey` duplicate. |
| Side effects | Seeds 5 default statuses, 4 issue types, 3 starter project roles, default task group. |

## 5.3 `GET /api/projects/[id]`
| Auth | `withProjectAccess` |
| Response | `{ success: true, data: { ...project, statuses, issueTypes } }` |

## 5.4 `PATCH /api/projects/[id]`
| Auth | `withProjectAccess + role: PROJECT_ADMIN` |
| Body | `{ name?, projectKey?, description?, status?, leadUserId?, color?, icon?, startDate?, endDate? }` |
| Errors | `409` if new key duplicates existing. |

## 5.5 `DELETE /api/projects/[id]`
Soft-delete. Retention 30 days.
| Auth | `withProjectAccess + role: PROJECT_ADMIN` |
| Response | `{ success: true, data: { id } }` |

## 5.6 `GET /api/projects/[id]/summary`
Aggregated project dashboard data.
| Response | `{ success: true, data: { totalIssues, byStatus, bySprintStatus, recentActivity } }` |

## 5.7 `GET /api/projects/[id]/grouped-board`
Board grouped by task groups.
| Response | `{ success: true, data: { groups: [{ id, name, color, issues: [...] }] } }` |

---

# 6. Project Members

## 6.1 `GET /api/projects/[id]/members`
| Auth | `withProjectAccess` |
| Response | `{ success: true, data: { members: [...], pendingInvites: [...] } }` |

## 6.2 `POST /api/projects/[id]/members`
| Auth | `withProjectAccess + role: PROJECT_ADMIN` |
| Body | `{ userId? \| email?, role: "MEMBER" \| "PROJECT_ADMIN" \| "VIEWER" }` |
| Response | `{ success: true, data: member \| invitation }` (201) |

## 6.3 `PATCH /api/projects/[id]/members/[userId]`
| Body | `{ role }` |
| Response | `{ success: true, data: updated }` |

## 6.4 `DELETE /api/projects/[id]/members/[userId]`
| Response | `{ success: true, data: { id } }` |
| Errors | `400` if removing last admin. |

## 6.5 `PATCH /api/projects/[id]/members/[userId]/role`
Change project role.
| Body | `{ projectRoleId }` |

## 6.6 `PATCH /api/projects/[id]/members/[userId]/permissions`
Per-member permission overrides.
| Body | `{ extras: [...] }` |

---

# 7. Project Roles

## 7.1 `GET /api/projects/[id]/roles`
| Response | `{ success: true, data: [{ id, name, description, isDefault, memberCount }] }` |

## 7.2 `POST /api/projects/[id]/roles`
| Body | `{ name, description?, isDefault? }` |
| Response | role (201) |

## 7.3 `GET /api/projects/[id]/roles/[roleId]`
| Response | role with permissions and field permissions |

## 7.4 `PATCH /api/projects/[id]/roles/[roleId]`
## 7.5 `DELETE /api/projects/[id]/roles/[roleId]`
## 7.6 `PATCH /api/projects/[id]/roles/[roleId]/permissions`
## 7.7 `PATCH /api/projects/[id]/roles/[roleId]/navigation`
## 7.8 `PATCH /api/projects/[id]/roles/[roleId]/field-permissions`
Same body shapes as org-role counterparts (§4).

---

# 8. Issues

## 8.1 `GET /api/issues`
Powerful list endpoint with filters.

| Auth | `withOrgAuth` |
| Query | `projectId (required), type?, excludeType?, statusId?, statusCategory?, sprintId?, parentId?, epicId?, assigneeId?, priority?, search?, cursor?, limit?, page?, pageSize?, sort?, order?, expand?` |
| Response | `{ success: true, data: { issues: [...], nextCursor?, total, page?, pageSize?, totalPages? } }` |
| Notes | Supports cursor + offset pagination; rolls up ETA for parents; `expand=status,sprint,user` denormalizes. |

## 8.2 `POST /api/issues`
| Auth | `withOrgAuth + Issue:create` |
| Body | `{ projectId, title, description?, type, statusId?, priority, parentId?, epicId?, sprintId?, assigneeId?, startDate?, dueDate?, eta?, storyPoints? }` |
| Response | issue (201). Auto-assigns next `<KEY>-N`. |
| Side effects | Adds reporter as watcher; recalculates parent roll-up if subtask. |

## 8.3 `GET /api/issues/[id]`
| Response | `{ success: true, data: { ...issue, subtasks: [...], timeLogs: [...] } }` |

## 8.4 `PATCH /api/issues/[id]`
| Body | Any updatable issue fields (filtered by `RoleFieldPermission`). |
| Side effects | Writes `QtIssueHistory` row per changed field; fires assignee/status-change emails fire-and-forget; recalculates parent roll-ups. |

## 8.5 `DELETE /api/issues/[id]`
| Query | `subtaskMode?: "detach"` (else cascade) |
| Response | `{ success: true, data: { id, deletedChildCount, detachedChildCount } }` |

## 8.6 `PATCH /api/issues/[id]/move`
Drag-drop move (board/swimlane).
| Body | `{ statusId, sprintId?, parentId?, orderInColumn }` |
| Side effects | Writes history entry. |

## 8.7 `POST /api/issues/bulk-delete`
| Body | `{ projectId, ids: string[] }` (max 500) |
| Response | `{ success: true, deleted: count }` |

## 8.8 `POST /api/issues/bulk-import`
| Body | `{ projectId, rows: [{ title, type?, priority?, status?, assigneeEmail?, storyPoints?, eta?, dueDate?, description? }] }` |
| Response | `{ success: true, created: count, errors?: [{ row, field, message }] }` |
| Notes | All-or-nothing; CSV-style import. |

---

# 9. Issue Comments

## 9.1 `GET /api/issues/[id]/comments`
| Response | `{ success: true, data: [{ id, userId, body, createdAt, editedAt, user }] }` |

## 9.2 `POST /api/issues/[id]/comments`
| Auth | `withOrgAuth + IssueComment:create` |
| Body | `{ body: string }` (1–20000 chars) |
| Response | comment (201) |
| Side effects | Parses `@mentions`, notifies mentioned users in-app + email; adds author to watchers. |

## 9.3 `PATCH /api/issues/[id]/comments/[commentId]`
Edit own comment.
| Body | `{ body }` |
| Response | `{ id, body, editedAt }` |
| Errors | `403` if not author and not admin. |

## 9.4 `DELETE /api/issues/[id]/comments/[commentId]`
Soft-delete own comment.

---

# 10. Issue History & Links

## 10.1 `GET /api/issues/[id]/history`
| Response | `[{ id, userId, field, oldValue, newValue, createdAt, user }]` |

## 10.2 `GET /api/issues/[id]/links`
| Response | `[{ id, type, createdAt, targetIssue }]` (outgoing) |

## 10.3 `POST /api/issues/[id]/links`
| Body | `{ targetIssueId, type? = "RELATES_TO" }` |
| Response | link (201) |

## 10.4 `DELETE /api/issues/[id]/links/[linkId]`
| Response | `{ success: true, data: { id } }` |

---

# 11. Issue Attachments

## 11.1 `GET /api/issues/[id]/attachments`
| Response | `[{ id, fileName, mimeType, sizeBytes, sourceSystem, uploadedBy, createdAt }]` |

## 11.2 `POST /api/issues/[id]/attachments`
Multipart upload.
| Auth | `withOrgAuth` |
| Body (multipart) | `file: File` |
| Response | attachment (201) with pre-signed download URL |
| Errors | `413` if >25MB; `415` if blocked mime type. |

## 11.3 `DELETE /api/issues/[id]/attachments/[attachmentId]`
| Auth | Owner or project admin |
| Response | `{ success: true, data: { id } }` |
| Side effects | S3 object purged. |

---

# 12. Sprints

## 12.1 `GET /api/sprints`
| Auth | `withOrgAuth` |
| Query | `projectId (required), cursor?, limit? (max 50)` |
| Response | `{ success: true, data: [{ ...sprint, counts: { todo, inProgress, done } }], nextCursor? }` |

## 12.2 `POST /api/sprints`
| Auth | `withOrgAuth + Sprint:create` |
| Body | `{ projectId, name, goal?, startDate?, endDate? }` |
| Response | sprint (201) — status `PLANNED` |

## 12.3 `GET /api/sprints/[id]` · `PATCH /api/sprints/[id]` · `DELETE /api/sprints/[id]`
Standard CRUD. DELETE returns `409` if sprint is `ACTIVE`.

## 12.4 `PATCH /api/sprints/[id]/start`
Transition `PLANNED → ACTIVE`.

## 12.5 `POST /api/sprints/[id]/complete`
| Body | `{ moveOpenTo?: null \| "backlog" \| "new" \| <sprintId>, newSprintName? }` |
| Response | updated sprint (status `COMPLETED`) |

---

# 13. Backlog & Statuses

## 13.1 `GET /api/backlog/issues`
Ranked backlog issues (no sprint assignment).
| Auth | `withOrgAuth` |
| Query | `projectId, cursor?, limit?` |
| Response | `[issues...]` |

## 13.2 `GET /api/projects/[id]/statuses` · `POST /api/projects/[id]/statuses`
List / create custom statuses.
| POST body | `{ name, color?, category: "BACKLOG" \| "IN_PROGRESS" \| "DONE" }` |

## 13.3 `PATCH /api/projects/[id]/statuses/[statusId]` · `DELETE /api/projects/[id]/statuses/[statusId]` · `POST /api/projects/[id]/statuses/reorder`
Standard ops; reorder takes `{ statusIds: string[] }`.

## 13.4 `PATCH /api/statuses/[id]` · `DELETE /api/statuses/[id]`
Direct status update by id (no project scoping in path).

---

# 14. Task Groups

## 14.1 `GET /api/projects/[id]/groups` · `POST /api/projects/[id]/groups`
| POST body | `{ name, color?, icon? }` |

## 14.2 `POST /api/projects/[id]/groups/reorder`
| Body | `{ groups: [{ id, order }] }` |

## 14.3 `GET /api/groups/[id]` · `PATCH /api/groups/[id]` · `DELETE /api/groups/[id]`
| PATCH body | `{ name?, color?, icon?, isCollapsed? }` |
| DELETE errors | `400` if group is default (Ungrouped). |

## 14.4 `POST /api/groups/move-task`
| Body | `{ taskId, groupId, orderInGroup }` |

---

# 15. Docs (Wiki)

## 15.1 `GET /api/projects/[id]/docs`
| Response | `[{ id, title, parentId, order, createdAt, updatedAt }]` |

## 15.2 `GET /api/docs/[id]`
| Response | `{ id, orgId, projectId, title, content, templateKey, createdBy, updatedBy, createdAt, updatedAt }` |

## 15.3 `PATCH /api/docs/[id]`
| Body | `{ title?, content? }` |

## 15.4 `DELETE /api/docs/[id]`
Soft-delete.

## 15.5 `POST /api/docs/upload`
Multipart upload for doc images/files. Returns S3 pre-signed URL.

## 15.6 `POST /api/docs/asset`
Inline asset reference (URL → DocAsset record).

---

# 16. Timesheets

## 16.1 `GET /api/timesheets`
| Auth | `withOrgAuth` |
| Query | `userId?, from?, to?, projectId?, issueId?` |
| Response | `[entries...]` (max 500) |
| Notes | Non-admins only see their own entries. |

## 16.2 `POST /api/timesheets`
| Auth | `withOrgAuth + Timesheet:create` |
| Body | `{ issueId, entryDate, hours, description? }` |
| Side effects | Updates `QtTimesheetWeeklySummary`. |

## 16.3 `GET /api/timesheets/[id]` · `PATCH /api/timesheets/[id]` · `DELETE /api/timesheets/[id]`
| PATCH body | `{ hours?, description?, entryDate?, issueId? }` |
| Notes | Setting `hours=0` soft-deletes the entry. Owner-only edit. |

## 16.4 `GET /api/timesheets/grid`
Weekly grid view shaped for the timesheet UI.
| Query | `userId?, weekStart` |
| Response | `{ days: [...], rows: [{ issue, byDay: { [date]: hours } }] }` |

---

# 17. Reports

## 17.1 `GET /api/reports/tasks`
Status-breakdown report.
| Query | `projectId?, from?, to?, assigneeId?` |
| Response | `{ totals, byStatus, byPriority, byAssignee }` |

## 17.2 `GET /api/reports/resource`
Workload by team member.
| Query | `from?, to?, projectId?` |
| Response | `{ users: [{ userId, name, loadedHours, capacity, utilization }] }` |

## 17.3 `GET /api/reports/task-time/[id]`
Per-task time drill-down.
| Path | `id` (taskId) |
| Response | `[entries...]` |

## 17.4 `GET /api/reports/user-time/[id]`
Per-user time drill-down.
| Path | `id` (userId) |

---

# 18. Notifications

## 18.1 `GET /api/notifications`
| Auth | `withOrgAuth` |
| Query | `tab? (direct\|watching\|all), unread? (1), cursor?, limit? (max 100)` |
| Response | `{ success: true, data: [...], nextCursor?, unread: { direct, watching, total } }` |

## 18.2 `POST /api/notifications/mark-read`
| Body | `{ ids?: string[], all?: boolean, tab? }` |
| Response | `{ success: true, data: { updated: count } }` |

## 18.3 `GET /api/notifications/unread-count`
| Response | `{ direct, watching, total }` — used for the bell badge. |

---

# 19. Search

## 19.1 `GET /api/search`
Global search across issues + projects.

| Auth | `withOrgAuth` |
| Query | `q?, limit? (max 25, default 10), projectId?, projectIds? (CSV), assigneeId?, assigneeIds? (CSV), reporterId? ("me"), updatedSince?, statusCategory? (CSV)` |
| Response | `{ success: true, data: { issues: [...], projects: [...], totalIssues } }` |
| Notes | Tenant + project scoped; admin sees all, members only their projects. |

## 19.2 `GET /api/users/search`
User picker / mention autocomplete.
| Query | `q?, limit?` |
| Response | `[{ id, firstName, lastName, email, avatar }]` |

---

# 20. Activity Stream

## 20.1 `GET /api/activity`
| Query | `limit? (max 100, default 30)` |
| Response | `[{ id, projectId, kind, ref, title, meta, href, icon, color, viewedAt }]` |
| Notes | Returns only activities for projects user is still a member of. |

## 20.2 `POST /api/activity`
| Body | `{ projectId, kind: "project"\|"board"\|"list"\|"task"\|"epic"\|"dashboard", ref?, title, meta?, href, icon?, color? }` |
| Side effects | Upserts on `(userId, projectId, kind, ref)` with latest `viewedAt`. |

---

# 21. Teams

## 21.1 `GET /api/teams` · `POST /api/teams`
| POST body | `{ name, color?, leadUserId? }` |
| Response | team (201) |

## 21.2 `GET /api/teams/[id]/members`
| Response | `[{ userId, role, joinedAt }]` |

---

# 22. Filters (Saved Views)

## 22.1 `GET /api/filters/[id]`
| Response | `{ id, name, scope, filters, sort, isShared }` |

## 22.2 `PATCH /api/filters/[id]`
| Body | `{ name?, filters?, sort?, isShared? }` |

## 22.3 `DELETE /api/filters/[id]`
Owner-only delete.

---

# 23. View Preferences

## 23.1 `GET /api/view-prefs` · `POST /api/view-prefs`
Per-user view preferences (hidden/frozen columns, sort, widths).
| GET query | `viewKey` (e.g. `"board:projectId"`) |
| POST body | `{ viewKey, prefs: {...} }` |

---

# 24. Settings

## 24.1 `GET /api/settings/company` · `PATCH /api/settings/company`
Org-level theming/config.
| PATCH body | `{ name?, slug?, logoUrl?, brandColor?, accentColor? }` |
| Auth | `requireAdmin` for PATCH |

---

# 25. App Switcher / Dashboard

## 25.1 `GET /api/apps/switcher`
Apps the current user can access.
| Response | `[{ slug, name, url, role }]` |

## 25.2 `GET /api/dashboard/for-you`
"For You" personalized data.
| Response | `{ assignedIssues, recentActivity, projects, mentions, sprints }` |

---

# 26. Feedback

## 26.1 `POST /api/feedback`
User feedback submission.
| Body | `{ category?, message, screenshotUrl? }` |
| Response | `{ success: true }` |
| Side effects | Row in `QtFeedback`; email to platform admins. |

---

# 27. Migration

## 27.1 `POST /api/migration/jira`
Jira → QuikTrack importer.
| Body | `{ apiToken, host, email, projectKey, fieldMap, dryRun? }` |
| Response | `{ success: true, data: { imported: { issues, comments, attachments }, errors?: [...] } }` |
| Side effects | Long-running; can be resumed from checkpoint. |

---

# Internal / System (Not for client use)

The following are internal endpoints, not part of the public API:

| Path | Purpose |
|---|---|
| `GET /api/health` | Health check (DB + SMTP probe) |
| `GET /api/debug/email-test` | Dev-only email send |
| `GET /api/cron/overdue-notifications` | Nightly cron, sends overdue alerts |
| `POST /api/internal/provision-roles` | Internal role bootstrap, gated by `INTERNAL_SECRET` |
| `GET /api/auth/[...nextauth]` | NextAuth handler |
| `GET /api/session/validate` | Background session check |

---

# Common Response Codes

| Code | Meaning | Example |
|---|---|---|
| 200 | OK | GET success |
| 201 | Created | POST success |
| 204 | No Content | DELETE success |
| 400 | Bad Request | Zod validation, invalid input |
| 401 | Unauthenticated | Missing/invalid session |
| 403 | Forbidden | Permission denied |
| 404 | Not Found | Resource missing or cross-tenant |
| 409 | Conflict | Duplicate key, sprint already active, etc. |
| 413 | Payload Too Large | Attachment >25MB |
| 415 | Unsupported Media Type | Blocked mime type |
| 422 | Unprocessable Entity | Semantic validation failed |
| 429 | Too Many Requests | Rate limited |
| 500 | Server Error | Unexpected; logged for monitoring |

---

# Standard Headers

| Header | Notes |
|---|---|
| `Cookie: __Secure-next-auth.session-token=...` | Session (prod) |
| `Content-Type: application/json` | Required on POST/PATCH |
| `x-internal-secret: <secret>` | Required on `/api/internal/*` |

---

*Generated from the current production codebase. Each endpoint here has a corresponding `app/api/.../route.ts` source file. For permission gates, see [`lib/api/permissions.ts`](lib/api/permissions.ts) and [`lib/api/withOrgAuth.ts`](lib/api/withOrgAuth.ts). For field-level enforcement, see [`lib/api/fieldLevels.ts`](lib/api/fieldLevels.ts).*
