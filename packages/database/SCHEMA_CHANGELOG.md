# QuikAsset Schema Changelog

Running log of schema changes to the **`app_quikasset`** tables / models / enums, for
team (Kanishka + others) reference. Scope is the `app_quikasset` schema only — for
broader feature-work history see `apps/quikasset/docs/PROGRESS_LOG.md`.

Most recent first. Each entry: **date · what changed · why · migration · sign-off**.

---

## 2026-07-20 — Employee Repair Request feature

- **Added:**
  - Model `AstRepairRequest` (table `repair_requests`) — columns `id`, `orgId`, `requesterUserId`, `assetId`, `issueTitle`, `issueDescription`, `urgency`, `status`, `reviewedByUserId`, `reviewedAt`, `decisionNote`, `repairId`, `createdAt`, `updatedAt`; indexes `(orgId)`, `(orgId, status)`, `(requesterUserId)`, `(assetId)`, `(repairId)`; FK `assetId` → `assets(id)`, FK `repairId` → `repairs(id)` `ON DELETE SET NULL`.
  - Enums `AstRepairRequestStatus` (`Submitted`, `Approved`, `Rejected`, `Fulfilled`, `Cancelled`) and `AstRepairRequestUrgency` (`Low`, `Medium`, `High`, `Urgent`).
- **Why:** backs the employee-facing repair intake (employee reports a fault on one of their own assigned assets → approver review → "send to repair", which creates a real `AstRepair` and links back via `repairId`). Sits in front of `AstRepair` the same way `AstAssetRequest` sits in front of `AstAssignment`; the existing admin-only `AstRepair` flow is unchanged.
- **Migration:** `prisma/migrations/20260720120000_add_repair_request/`
- **Sign-off:** Proceeded ahead of the usual cross-team check-in, due to the July 20 release timeline. On branch `merge_asset02`.

## 2026-07-17 — Vendor Management

- **Added:**
  - Model `AstVendor` (table `vendors`) — columns `id`, `orgId`, `name`, `contactPerson`, `phone`, `email`, `address`, `status`, `createdAt`, `updatedAt`; index `(orgId)`.
  - Enum `AstVendorStatus` (`Active`, `Inactive`).
  - `AstRepair.vendorId` (nullable) + index `(vendorId)` + FK → `vendors(id)`, `ON DELETE SET NULL`.
- **Kept:** legacy `AstRepair.vendor` free-text column — retained as a fallback for existing repairs; not dropped this pass (planned post-UAT cleanup). No auto-migration of old text values.
- **Why:** minimal Vendor master (save vendor details) and link a vendor to Repair records, replacing the free-text vendor field in Repair & Recovery. Excludes GST/PAN/bank/SLA/ratings/purchase-history (depend on Procurement, out of scope).
- **Migration:** `prisma/migrations/20260717120000_add_ast_vendor/`
- **Sign-off:** Approved by PM.

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
