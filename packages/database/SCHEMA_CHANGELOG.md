# QuikAsset Schema Changelog

Running log of schema changes to the **`app_quikasset`** tables / models / enums, for
team (Kanishka + others) reference. Scope is the `app_quikasset` schema only — for
broader feature-work history see `apps/quikasset/docs/PROGRESS_LOG.md`.

Most recent first. Each entry: **date · what changed · why · migration · sign-off**.

---

## 2026-07-15 — Asset Request feature

- **Added:**
  - Model `AstAssetRequest` (table `asset_requests`).
  - Enums `AstAssetRequestKind`, `AstAssetRequestType`, `AstAssetRequestPriority`, `AstAssetRequestStatus`.
  - `AstAsset` columns: `invoiceFileKey`, `invoiceFileName`, `invoiceFileType`, `invoiceFileSize` (all nullable).
  - `AstAssignment.requestId` (nullable) + index + FK → `asset_requests(id)`, `ON DELETE SET NULL`.
- **Why:** backs the Asset Request module (employee request → admin approval → fulfilment).
- **Migration:** `prisma/migrations/20260715120000_add_asset_request/`
- **Sign-off:** Proceeded ahead of the usual cross-team check-in, due to the July 20 release timeline. On branch `merge_asset02`.

## 2026-07-14 — User soft-delete

- **Added:** Model `AstUserRemoval` (table `user_removals`) — columns `id`, `orgId`, `userId`, `removedAt`, `removedBy`; unique `(orgId, userId)`; index `(orgId)`.
- **Why:** hide/deny a removed user from QuikAsset without destroying their `User`/`OrgMember`/employee data.
- **Migration:** `prisma/migrations/20260714130000_add_ast_user_removals/`
- **Sign-off:** Approved by PM (as part of the User Management merge discussion).

## 2026-07-14 — Employee ↔ User identity bridge

- **Added:** `AstEmployee.userId` (nullable) + index `(userId)` + unique `(orgId, userId)` + FK → `auth.User(id)`, `ON DELETE SET NULL`.
- **Why:** link platform login accounts (`User`) to QuikAsset employee records (`AstEmployee`), replacing the fragile email-match stopgap.
- **Migration:** `prisma/migrations/20260714120000_add_ast_employee_user_link/`
- **Sign-off:** Approved by PM (as part of the User Management merge discussion).
