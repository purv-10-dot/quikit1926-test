# QuikTrack — API Reference

Complete API documentation for every user-facing endpoint, grouped by feature/resource.

*Last updated 2026-06-19 — adds Custom Fields (§28), Docs folders/sharing/import (§15), Executive & saved-view reports (§17), the issue `/full` aggregate read (§8.3b), and the reworked three-layer permission model (§4).*

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
| Response | `{ success: true, data: { isAdmin, roleId, roleName, permissions: string[] (`"resource:action"` pairs), extras: string[], navigation: string[] (navKeys) } }` |
| Side effects | **Seeds default app roles on first call** (cached 5min/process/org). |

## 2.2 `GET /api/me/access`
Returns access summary: org, app role, projects, admin flags.

| Field | Value |
|---|---|
| Auth | `withOrgAuth` |
| Response | `{ success: true, data: { isOrgAdmin, isAppAdmin, isAdmin, hasProjects, projectCount, canCreateProject, orgName, roleName, adminEmails } }` |
| Notes | Powers the `NoAccessGate` shell that greets users with zero project access (shows status + admin contact emails). |

## 2.3 `GET /api/me/project-permissions`
Returns the caller's resolved grants **within one project** (using project-role-authoritative resolution).

| Field | Value |
|---|---|
| Auth | `withOrgAuth` |
| Query | `projectId` (required) |
| Response | `{ success: true, data: { projectId, permissions: string[] (`"resource:action"` pairs) } }` |
| Notes | Returns the full grant set when the caller holds the `Space Admin` project role. |

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

## 3.8 `GET` · `PUT /api/org/users/[id]/permissions`
Read or atomically replace per-user additive permission extras.
| Auth | `requireAdmin` |
| GET response | `{ userId, roles: [{ id, name }], roleGrants: [{ resource, action }], extras: [{ resource, action }], effective: [{ resource, action, source: "role" \| "extra" }] }` |
| PUT body | `{ extras: [{ resource, action }] }` |
| PUT response | `{ success: true, data: { userId, count } }` |
| Notes | Replaces all extras in one transaction; records `grantedBy`. Extras only add access. |

---

# 4. Roles & Permissions

> **Permission model (overhauled 2026-06).** Access resolves across three layers:
> 1. **Global (app-wide) role** — a `QtAppRole` assigned to the user. Grants like `Home:view`, `Dashboard:view`, `Report:view` are **global-only** and can only be set here.
> 2. **Project role** — a `QtProjectRole` assigned per project. **Project roles are authoritative inside their space and override the app-wide role** — absence of a grant means denied. The locked `Space Admin` project role implies full access within that project.
> 3. **Per-user extras** — additive `(resource, action)` grants for an individual user; they can only *add* access, never revoke a role grant.
>
> Valid actions: `view`, `create`, `update`, `delete`. App/tenant admins bypass all checks. Field-level permissions (below) further constrain individual fields.

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

## 4.6 `GET` · `PUT /api/org/roles/[id]/permissions`
Read or atomically replace the resource-action grants for a role.
| Auth | `requireAdmin` |
| GET response | `{ roleId, isSystem, permissions: [{ resource, action }] }` |
| PUT body | `{ permissions: [{ resource, action }] }` |
| PUT response | `{ success: true, data: { roleId, count } }` |
| Notes | PUT replaces all grants in one transaction; unknown/stale pairs are silently dropped rather than failing the save. |

> **Navigation is no longer a separate endpoint.** Sidebar visibility is now *derived* from entity `view` grants (e.g. `Project:view` → "Spaces" item, `Report:view` → "Reports"). The legacy `PATCH .../navigation` endpoint has been removed.

## 4.7 `GET` · `PUT /api/org/roles/[id]/field-permissions`
Read or atomically replace field-level access for a role. Levels: `hidden` \| `readonly` \| `editable` (default) \| `required` (most-restrictive wins when layers merge).
| Auth | `requireAdmin` |
| GET response | `{ roleId, permissions: [{ entity, field, level }] }` (missing rows default to `editable`) |
| PUT body | `{ permissions: [{ entity, field, level }] }` |
| PUT response | `{ success: true, data: { count } }` |
| Notes | Only rows differing from the `editable` default are persisted; catalog-invalid `(entity, field)` pairs are filtered. Controlled entities: Issue, Project, Sprint, Timesheet, IssueComment. |

## 4.8 `GET /api/org/roles/[id]/members`
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
| Body | `{ name?, description?, status?, leadUserId?, color?, icon?, startDate?, endDate? }` |
| Notes | The **project key is immutable after creation** (it's embedded in every work-item ID); the settings UI renders it read-only. |

## 5.5 `DELETE /api/projects/[id]`
Soft-delete. Retention 30 days.
| Auth | `withProjectAccess + role: PROJECT_ADMIN` |
| Response | `{ success: true, data: { id } }` |

## 5.6 `GET /api/projects/[id]/summary`
Aggregated project dashboard data.
| Response | `{ success: true, data: { totalIssues, byStatus, bySprintStatus, recentActivity, epicProgress: [{ id, done, inProgress, todo, total }] } }` |
| Notes | `epicProgress` drives the progress bars on the Epics list view. |

## 5.7 `GET /api/projects/[id]/grouped-board`
Grouped-kanban board data.
| Query | `sprintId?, assigneeId?, priority?, type?, search?` |
| Response | `{ success: true, data: { projectId, defaultGroupId, statuses: [{ id, name, color, category, orderIndex }], groups: [{ id, name, color, issues: [...] }] } }` |
| Notes | The board's grouping axis (manual / status / priority / assignee / type / epic) is applied client-side via `useFieldGrouping`; tasks within a group sort by `orderInGroup` then `createdAt`. |

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

## 6.6 `GET /api/projects/[id]/members/[userId]/permissions`
Resolve a member's effective project grants (from their assigned project role).
| Auth | `withProjectAccess` |
| Response | `{ userId, roleId, roleName, roleGrants: [{ resource, action }] }` (empty grants if no project role) |

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
## 7.6 `GET` · `PUT /api/projects/[id]/roles/[roleId]/permissions`
## 7.7 `GET` · `PUT /api/projects/[id]/roles/[roleId]/field-permissions`
Same shapes as the org-role counterparts (§4.6–4.7): `PUT` atomically replaces with `{ permissions: [...] }`. PUT additionally requires `ProjectMember:update` (unless app/tenant admin). Global-only resources (`Home`, `Dashboard`, `Report`) are dropped if submitted at project scope. There is **no** project-role navigation endpoint — nav is derived from `view` grants.

---

# 8. Issues

## 8.1 `GET /api/issues`
Powerful list endpoint with filters.

| Auth | `withOrgAuth` |
| Query | `projectId (required), type?, excludeType?, statusId?, statusCategory?, sprintId?, parentId?, epicId? ("null" for none), assigneeId?, priority?, search?, customFilters? (JSON), cursor?, limit?, page?, pageSize?, sort?, order?, expand?` |
| Response | `{ success: true, data: { issues: [...], nextCursor?, total, page?, pageSize?, totalPages? } }` |
| Notes | Supports cursor + offset pagination; rolls up ETA for parents; `expand=status,sprint,user` denormalizes. `type=EPIC` drives the Epics list view. `customFilters` is a JSON array of custom-field conditions (see §28) translated to `QtIssueFieldValue` WHERE clauses. |

## 8.2 `POST /api/issues`
| Auth | `withOrgAuth + Issue:create` |
| Body | `{ projectId, title, description?, type, statusId?, priority, parentId?, epicId?, sprintId?, assigneeId?, startDate?, dueDate?, eta?, storyPoints? }` |
| Response | issue (201). Auto-assigns next `<KEY>-N`. |
| Side effects | Adds reporter as watcher; recalculates parent roll-up if subtask. |

## 8.3 `GET /api/issues/[id]`
| Response | `{ success: true, data: { ...issue, subtasks: [...], timeLogs: [...] } }` |

## 8.3b `GET /api/issues/[id]/full`
Single-shot aggregate read for the work-item detail drawer — eliminates the N+1 round-trips of fetching issue, links, comments, history, attachments separately.
| Auth | `withOrgAuth` (issue must be in org; caller must be project member or admin) |
| Response | `{ success: true, data: { issue: { ...issue, status, parent, epic, subtasks, timeLogs }, links, comments, history, attachments } }` |
| Notes | Each nested array matches the shape of its standalone endpoint, so the client can hydrate React Query caches directly. |

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

Docs are project-scoped rich-text pages organized into a single level of **folders**, support **public share links**, and can be created by **importing** files. All doc actions are gated by `Doc:view/create/update/delete` (see §4). Soft-delete throughout.

## 15.1 `GET /api/projects/[id]/docs`
List docs in a project, optionally scoped to a folder.
| Auth | `withProjectAccess` |
| Query | `search? (title ILIKE), type? (templateKey), folder? ("root" \| folderId \| "" for all), limit? (1–100, default 50), offset?` |
| Response | `{ success: true, data: [{ id, title, templateKey, folderId, createdBy, ownerFirstName, ownerLastName, ownerAvatar, createdAt, updatedAt }], hasMore }` |

## 15.2 `POST /api/projects/[id]/docs`
| Auth | `withProjectAccess + Doc:create` |
| Body | `{ title?, templateKey? (null), content?, folderId? (null = root) }` |
| Response | doc (201). `title` defaults to the template name or "Untitled doc". |

## 15.3 `GET` · `POST /api/projects/[id]/docs/folders`
List or create folders. Folders are flat (no nesting) and report a live doc count.
| Auth | `withProjectAccess` (POST adds `Doc:create`) |
| POST body | `{ name }` (1–120 chars) |
| GET response | `[{ id, name, sortOrder, createdAt, docCount }]` |

## 15.4 `POST /api/projects/[id]/docs/import`
Create a doc by importing a file (multipart).
| Auth | `withProjectAccess + Doc:create` |
| Body (multipart) | `file` (`.docx`, `.md`/`.markdown`, `.html`/`.htm`, `.txt`, `.pdf`; max 15MB), `folderId?` |
| Response | `{ success: true, data: { id, title, folderId } }` (201) |
| Notes | Converts to sanitized HTML (scripts/iframes/handlers stripped; fonts/colors/tables preserved). `.txt`/`.pdf` use heading heuristics. `400` on unsupported type, oversize, conversion failure, or unknown folder. |

## 15.5 `GET /api/docs/[id]`
| Response | `{ id, orgId, projectId, title, content, templateKey, createdBy, updatedBy, createdAt, updatedAt }` |

## 15.6 `PATCH /api/docs/[id]`
| Auth | `Doc:update` |
| Body | `{ title? (1–255), content? (max 2,000,000 chars), folderId? (null = move to root) }` |
| Side effects | Validates folder is in the same project; diffs new `@mentions` and emails them. |

## 15.7 `DELETE /api/docs/[id]`
Soft-delete. | Auth | `Doc:delete` |

## 15.8 `PATCH` · `DELETE /api/docs/folders/[folderId]`
Rename or delete a folder.
| Auth | `Doc:update` (rename) / `Doc:delete` (delete) |
| PATCH body | `{ name }` (1–120 chars) |
| Notes | Delete is non-destructive: docs in the folder are re-parented to root (`folderId = NULL`) in a transaction, then the folder is soft-deleted. |

## 15.9 `POST` · `DELETE /api/docs/[id]/share`
Create/update or revoke a public share link for a doc.
| Auth | `withOrgAuth + Doc:update` |
| POST body | `{ mode: "view" \| "edit" }` (default `edit`) |
| POST response | `{ success: true, data: { token, mode } }` — stable 8-char base62 token (re-issuing only changes the mode, not the code) |
| DELETE | Clears the token, immediately revoking public access. |

## 15.10 `GET` · `PATCH /api/docs/share/[token]` — **public, no auth**
Read (or edit, if shared as `edit`) a doc via its share token.
| Auth | **None** — token is the credential |
| GET response | `{ success: true, data: { id, title, content (image URLs proxied), shareMode } }` |
| PATCH body | `{ title?, content? }` — `403` if `shareMode !== "edit"`; asset URLs normalized back to canonical form before storing |
| Errors | `404` if token unknown or revoked |

## 15.11 `GET /api/docs/share/[token]/asset` — **public, no auth**
Serves a shared doc's images to unauthenticated viewers.
| Query | `key` (S3 key) |
| Response | `302` redirect to a presigned S3 GET (no-cache). Validates the key belongs to the shared doc's tenant. |

## 15.12 `POST /api/docs/upload` · `GET /api/docs/asset`
Image upload and authenticated asset proxy.
| Upload | `withOrgAuth`, multipart `{ file (image), projectId }` → `{ key, url: "/api/docs/asset?key=..." }`; `413` oversize, `415` bad type |
| Asset GET | `withOrgAuth`; `?key=...` → `302` to presigned S3 URL; `403` if key's tenant ≠ caller's org |

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
Grid view shaped for the timesheet UI, with selectable grouping axis.
| Query | `from, to, userId? / userIds?, projectId? / projectIds?, groupBy? ("user" \| "project" \| "issue" \| "user-issue" \| "epic-issue")` |
| Response | `{ days: [...], rows: [{ ...groupKey, byDay: { [date]: hours } }] }` |
| Notes | `user-issue` and `epic-issue` return hierarchical parent/child rows (the epic — or "No epic" bucket — as parent, its issues as children). |

---

# 17. Reports

Non-admins see only projects they belong to; admins see the whole org. The Resource report is **admin-tier only**.

## 17.1 `GET /api/reports/tasks`
Paginated task report with status/assignee facets.
| Auth | `withOrgAuth` |
| Query | `projectId?, statusName? (or statusId?), assigneeId? ("null" = unassigned), from?, to?, month? (YYYY-MM), startDate?, page? (default 1), pageSize? (5–100, default 10)` |
| Response | `{ success: true, data: { tasks: [...], summary: { total, pending, closed, estHours, actualHours }, facets: { statuses, assignees }, page, pageSize, total, totalPages } }` |
| Notes | `summary`/`facets` are computed across the full filtered period, independent of the current page and of the status/assignee filters. |

## 17.2 `GET /api/reports/tasks/export`
CSV export of the task report (same filters as §17.1, no pagination).
| Response | `text/csv` — columns `S.No, Key, Task, Project, Assignee, Create Date, Status, Est (h), Actual (h)`; UTF-8 BOM; filename `project-report-<month\|all>.csv`. Safety cap 100k rows. |

## 17.3 `GET /api/reports/resource`
Capacity/utilization per employee. **Admin-tier only** (org owner/admin or app admin; else `403`).
| Query | `from, to (required), userIds? (CSV), roleUserId? (single PM/Space-Admin filter), page? (default 1), pageSize? (1–100, default 15), sortBy? (name\|status\|expected\|spent\|estimated\|overshot\|utilization\|overshotPct), sortDir? (asc\|desc)` |
| Response | `{ success: true, data: { summary: { employees, employeesFilled, totalSpent, totalEstimated, totalOvershot, totalExpected }, rows: [{ userId, name, email, timesheetFilled, expectedHours, spentHours, estimatedHours, overshotHours, utilizationPct, overshotPct }], page, pageSize, total, hasMore } }` |
| Notes | Expected = 8h × Mon–Fri working days in window; spent = timesheet sum; estimated = ETA of all open issues assigned; overshot = max(0, spent − estimated). Summary totals span the full filtered set. The UI exports this to CSV client-side. |

## 17.4 `GET /api/reports/role-users`
Users holding a "Space Admin" (or legacy "PM"/"Project Admin") role in accessible projects — powers the PM filter dropdown.
| Response | `{ success: true, data: [{ id, name }] }` (deduped across projects) |

## 17.5 `GET /api/reports/executive`
Org/team/employee productivity dashboard aggregated by week.
| Query | `preset? (last-7\|last-30\|last-90\|last-180\|year\|quarter\|month, default last-90), year?, quarter?, month?, from?, to?, compareMode?, projectIds? (CSV), assigneeIds? (CSV), teamIds? (CSV role-name slugs), sprintIds? (CSV)` |
| Response | `{ success: true, data: { range, weeks, series, slipping, teams, teamHeatmap, workload, employees (top 10), summary, weekOverWeek, previous?, projects, teamOptions, sprintOptions } }` |
| Notes | Productivity is a composite score (completion rate, on-time delivery, slip rate, hours variance). "Department" = deduped project-role names. Filters combine with AND. |

## 17.6 `GET /api/reports/executive/employees`
Paginated full employee list behind the executive report's "View all".
| Query | Same as §17.5 plus `offset? (default 0), limit? (default 20, max 50)` |
| Response | `{ success: true, data: { rows, total, hasMore } }` |

## 17.7 Saved Report Views — `GET` · `POST /api/reports/views`, `GET` · `PATCH` · `DELETE /api/reports/views/[id]`
Per-user saved filter/chart presets (currently `kind: "executive"`). Private to the owner; max 25 per user.
| Auth | `withOrgAuth` (owner-scoped) |
| GET (list) | `{ success: true, data: { views: [{ id, name, filtersJson, isPinned, createdAt, updatedAt }] } }` ordered pinned-first then recent |
| POST body | `{ name (1–80), filtersJson (object), isPinned? }` → view (201) |
| PATCH body | `{ name?, filtersJson?, isPinned? }` |
| DELETE | `{ success: true, data: { id } }`; `404` for another user's view |

## 17.8 `GET /api/reports/task-time/[id]`
Per-task time drill-down (detail drawer).
| Path | `id` (taskId) | Query | `assigneeId? ("null"), page?, pageSize? (5–100, default 10)` |
| Response | `{ success: true, data: { task, entries: [...], breakdown: [{ user, hours }], totalHours, page, pageSize, total, totalPages } }` |
| Notes | `breakdown`/`totalHours` span the full set; only `entries` paginate. Project members + admins only. |

## 17.9 `GET /api/reports/user-time/[id]`
Per-user time drill-down.
| Path | `id` (userId) | Query | `from?, to?, projectId?, search?, page?, pageSize? (1–100, default 10)` |
| Response | `{ success: true, data: { user, entries: [...], byProject: [{ project, hours }], filterProjects, totalHours, page, pageSize, total, totalPages } }` |
| Notes | Self-service for own data; admin-tier to view others (`403` otherwise). `search` matches description/issue title/key. |

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

# 28. Custom Fields

Admin-defined extra fields on issues, in two tiers: **global** (org-wide, on every issue) and **space** (scoped to one project). Field types: `SHORT_TEXT`, `LONG_TEXT`, `NUMBER`, `DATE`, `DROPDOWN_SINGLE`, `DROPDOWN_MULTI`, `CHECKBOX`, `URL`, `USER_PICKER`, `LABELS`. Values live in `QtIssueFieldValue`; definition changes are audited.

## 28.1 `GET` · `POST /api/settings/custom-fields` (global)
| Auth | `withOrgAuth` + admin |
| GET query | `includeArchived?` |
| POST body | `{ name (1–100), type, description?, isRequired?, defaultValue?, placeholder?, helpText?, options?: [{ id?, label, isActive? }] (required for dropdown types) }` |
| Response | `{ success: true, data: field }` (201); `409` on case-insensitive name collision |

## 28.2 `GET` · `PATCH` · `DELETE /api/settings/custom-fields/[id]` (global)
| Auth | `withOrgAuth` + admin |
| PATCH body | Same fields (all optional) + `status? (active\|archived)`, `position?`. `type`/`key` are immutable. |
| DELETE | Hard-deletes if no stored values; if values exist returns `409 { needsArchive: true, issueCount }` — retry with `?confirmArchive=true` to archive (preserves history). |

## 28.3 `GET` · `POST /api/projects/[id]/custom-fields` (space)
| Auth | `withProjectAccess + ProjectMember:update` |
| Body/response | Same as §28.1; fields scoped to the project. |

## 28.4 `GET` · `PATCH` · `DELETE /api/projects/[id]/custom-fields/[fieldId]` (space)
| Auth | `withProjectAccess + ProjectMember:update` |
| Behavior | Same as §28.2, with project-scope validation. |

## 28.5 `GET /api/projects/[id]/issue-fields`
Active fields (global + this project's space fields) for issue create/edit forms.
| Auth | `withProjectAccess + Issue:view` |
| Response | `{ success: true, data: [field...] }` — globals first (alphabetical), then space fields by admin position |

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
