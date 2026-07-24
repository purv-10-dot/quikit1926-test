# QuikAsset — UAT Handoff Log

Standing handoff record for QA/UAT. **Append-only:** add a new dated
`## YYYY-MM-DD` section at the **bottom** for each handoff, separated by a
horizontal rule; never edit or remove the entries above. Each entry covers Date,
Branch, Features, Updates, and a Release note. Facts only — no personal names.

---

## 2026-07-22

**Branch:** `merge_asset03` (HEAD `c81eef93`, based on common_setup50 @ `088fcd44`)
**Deployed demo:** https://quikit-quikasset-amber.vercel.app (`/api/health` → `c81eef93`)

### Features

*Branch-new (the commits unique to `merge_asset03`):*
- **Asset actor attribution** (`0e7444fa`) — assets, assignments and repairs now
  record and display *who* did the action: "Added by", "Assigned by", "Sent to
  repair by". Existing rows show blank until the optional backfill is run.
- **Editable Employee ID** (`0c896486`) — Employee ID is editable in the Edit
  User modal, with org-unique validation (duplicates rejected with a clear
  message at both UI and API level).

*Inherited via the common_setup50 baseline (committed 2026-07-20, just before the
branch point — listed for completeness as this is the first UAT handoff):*
- **Employee repair requests** (`0a5e0095`) — employees can raise a repair
  request against an asset assigned to them; admins approve/reject and send to
  repair.
- **Unified Employee Requests queue** (`a48c2d8f`) — the separate Asset Requests
  and Repair Requests admin screens merged into one "Employee Requests" queue
  with an attention-first sort (pending at top).

### Updates / Fixes (all branch-new)
- **Post-login landing fixed** (`c81eef93`) — after login users are routed by
  permission *before* navigating: admins → Dashboard, plain Members → My Assets.
  Members previously landed on `/dashboard` and got a permanent spinner (403).
  `/dashboard` is now double-guarded and can never hang on a 403.
- **Re-adding a removed user** (`72507b73`) — a soft-deleted user can be re-added
  via Add User again; previously they hit a dead end (blocked as "already a
  member" yet hidden from the dropdown).
- **Role reversion fixed** (`ca5bd929`) — a manager-assigned role no longer
  reverts to Member on page reload. *(Same commit)* soft-removed users no longer
  wrongly show as "has access" in the Add-User search.
- **Real error messages** (`cdebfb8f`) — failed actions (assign, return, repair,
  etc.) now show the actual server reason instead of a generic "Failed to…".
- **Stale-view refresh (C10)** (`169fcba9`) — list pages (My Assets, Assignments,
  Repairs, etc.) refresh on window/tab focus, so an action taken elsewhere no
  longer leaves a stale view (e.g. a returned asset lingering under My Assets).

### Release note

This build consolidates the QuikAsset asset-management work on top of the
common_setup50 baseline fixes into one branch (`merge_asset03`) for its first
proper UAT pass. **What's new:** full audit attribution across
assets/assignments/repairs, an editable Employee ID, and — carried in from the
baseline — the employee-facing repair-request flow and the unified Employee
Requests admin queue. **What's fixed:** the headline is the post-login dead-end
(Members were stuck on a spinning Dashboard) — login now lands each role on the
right page and Dashboard can never hang; plus the removed-user re-add dead end,
role-reversion on reload, generic error messages, and stale list views not
refreshing.

**Confidence for UAT: high.** Every change ships with tests (356 passing),
typecheck is clean, and the build is deployed to the demo and health-checked at
the current commit. **Two things to verify live** (they exercise the real
SSO/session path unit tests can't): (1) log in as a Member and confirm you land
on My Assets, not a spinner; (2) soft-remove a user, then re-add them by typing
their email. No database migration is required beyond the actor-attribution
columns (already applied to the demo's Neon DB); old rows simply show blank
attribution until the optional backfill is run.

---
