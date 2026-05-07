# QuikConstruction — UAT Test Plan

Manual test cases for the stabilization pass covering all 7 validated
production blockers. Run through each section before shipping to the
client. Each test has numbered steps, an expected result, and a pass/fail
box for tracking.

## Pre-flight

Before running any test:

1. Server is up: `curl http://192.168.2.7:3010/api/health` returns 200
2. Database is seeded: `/api/ready` returns `{ok: true, checks.schema: {detail: "12 roles"}}`
3. Demo users exist: 5 rows in `demo_users` (see §Demo Logins)
4. You can reach the login page at `http://192.168.2.7:3010/login`

## Demo logins

Password for all 5 accounts: **`12345`**

| Email | Role | What they can do |
|---|---|---|
| `amit@quikinfra.com`   | `platform_super_admin` | Everything — all 75 permissions |
| `priya@quikinfra.com`  | `tenant_admin`         | Everything within tenant |
| `rajesh@quikinfra.com` | `accounts_finance`     | Approve RAB, read BOQ, finance reports |
| `sanjay@quikinfra.com` | `site_engineer`        | Create DPRs, MRs, GRNs — no approvals |
| `rakesh@quikinfra.com` | `store_head`           | Approve GRNs, Issues, Transfers, Recons |

---

## Issue #1 — BOQ Upload Revision

### TC-1.1 — Happy path: upload + preview + import Aakar workbook

**Prereq:** logged in as `amit@quikinfra.com`, at least one project exists.

| # | Step | Expected |
|---|---|---|
| 1 | Go to `/projects/boq` | BOQ page loads with project dropdown |
| 2 | Select a project from the dropdown | BOQ grid shows (empty or prior items) |
| 3 | Click **Upload Revision** button | Drawer opens, step 1 of 3, drop zone visible |
| 4 | Drag `Aakar_BOQ_Import_Template_v1 1.xlsx` onto the drop zone (or click + browse) | Stage changes to "Parsing…" with spinner |
| 5 | Wait for parse | Step 2 of 3 shows. Filename + size visible. 5 sheets listed: INSTRUCTIONS, Civil_Building (21 rows), Electrical (10 rows), Road_Works (12 rows), QUICK_REFERENCE |
| 6 | Observe the auto-selected sheets | All non-empty sheets are checked by default; empty sheets are disabled and grayed out |
| 7 | Uncheck INSTRUCTIONS and QUICK_REFERENCE, keep Civil/Electrical/Road checked | Counter updates to "3 sheet(s) ready to import" |
| 8 | Confirm "Replace existing BOQ for this project" is checked (optional) | Checkbox state reflects choice |
| 9 | Click **Import (3)** | Stage → "confirming", spinner on button |
| 10 | Wait for completion | Step 3 of 3 green checkmark: "Imported N BOQ items", warnings count |
| 11 | Click **Done** | Drawer closes. BOQ grid auto-refreshes with the imported items |
| 12 | Expand a group row in the grid | Child items visible (tree structure works) |

**Result:** ☐ Pass ☐ Fail

### TC-1.2 — Validation: no project selected

| # | Step | Expected |
|---|---|---|
| 1 | On BOQ page, do NOT pick a project | Project dropdown empty |
| 2 | Click **Upload Revision** | Alert / drawer shows "Select a project first" info message OR drawer opens showing the amber warning |

**Result:** ☐ Pass ☐ Fail

### TC-1.3 — Validation: invalid file

| # | Step | Expected |
|---|---|---|
| 1 | Upload Revision drawer is open, project selected | Drop zone visible |
| 2 | Drag a non-xlsx file (e.g. a .pdf) | Either blocked at file picker accept filter, or parse fails with red banner: "Could not parse the Excel file" |
| 3 | Click **Replace file** and try again with a valid xlsx | Works this time |

**Result:** ☐ Pass ☐ Fail

### TC-1.4 — Validation: Import button disabled until valid

| # | Step | Expected |
|---|---|---|
| 1 | Drawer just opened, no file picked | Import button visible but disabled |
| 2 | Pick a file | Still disabled while parsing |
| 3 | Parse completes with sheets auto-selected | Import button enabled |
| 4 | Uncheck all sheets | Import button disables again |
| 5 | Check one sheet | Import button re-enables |

**Result:** ☐ Pass ☐ Fail

### TC-1.5 — Error handling: over-size file

| # | Step | Expected |
|---|---|---|
| 1 | Craft a > 50 MB .xlsx (or temporarily lower the limit in code to test) | — |
| 2 | Upload it | 413 response. Drawer shows red banner "File exceeds 50 MB limit for BOQ uploads" |

**Result:** ☐ Pass ☐ Fail

---

## Issue #2 — Project form state / city

### TC-2.1 — State dropdown loads

| # | Step | Expected |
|---|---|---|
| 1 | Logged in as `amit`, go to `/masters/projects` | Projects list loads |
| 2 | Click **+ Add Project** | ProjectFormDrawer opens with empty fields |
| 3 | Scroll to "Site Address" section | City text input visible, State dropdown visible |
| 4 | Click the State dropdown | Lists 22 Indian states: Andhra Pradesh, Assam, Bihar, … West Bengal |
| 5 | Pick "Maharashtra" | Dropdown closes, "Maharashtra" shown as selected |
| 6 | Type "Pune" into City field | Input accepts text |

**Result:** ☐ Pass ☐ Fail

### TC-2.2 — Edit mode backfills state/city

| # | Step | Expected |
|---|---|---|
| 1 | In projects list, click an existing project with a state set | ProjectFormDrawer opens in Edit mode |
| 2 | Scroll to Site Address | City field pre-filled with the stored city value |
| 3 | State dropdown | Shows the stored state value as selected (not empty) |
| 4 | Change state to another value, click Update | Save succeeds, list reflects new state |

**Result:** ☐ Pass ☐ Fail

---

## Issue #3 — Searchable material selector in PR/MR line

### TC-3.1 — Combobox opens and filters

**Prereq:** `/masters/items` has at least 10 items seeded.

| # | Step | Expected |
|---|---|---|
| 1 | Logged in as `sanjay@quikinfra.com` (site engineer), go to `/purchase/requisitions` | MR list loads |
| 2 | Click **Create MR** | MR drawer opens (title says "Create Material Requisition") |
| 3 | Select a project, set Required By date | Header fields accept input |
| 4 | In the first line item row, click the Material field | Combobox pops open, shows full item list, auto-focuses a search input |
| 5 | Type "cem" | List filters to items containing "cem" in name, code, or group (case-insensitive) |
| 6 | Press ArrowDown 2 times, then Enter | Second filtered item becomes the selection |
| 7 | Check the line row | UOM, Stock, and Rate fields auto-populate from the item master |

**Result:** ☐ Pass ☐ Fail

### TC-3.2 — Clear button resets dependent fields

| # | Step | Expected |
|---|---|---|
| 1 | Continue from TC-3.1 with an item selected | Item name shows in the trigger button |
| 2 | Click the small **×** next to the item name in the trigger | Item clears back to placeholder |
| 3 | Check UOM, Stock, Rate, Amount on the same row | All reset to empty/zero |

**Result:** ☐ Pass ☐ Fail

### TC-3.3 — Keyboard navigation

| # | Step | Expected |
|---|---|---|
| 1 | Click Material combobox on an empty row | Search input focused |
| 2 | Type "steel" | List filters |
| 3 | Press Escape | Popover closes without selecting |
| 4 | Click the combobox again, press ArrowDown, Enter | First match selected |

**Result:** ☐ Pass ☐ Fail

---

## Issue #4 — Line item dependent state reset

### TC-4.1 — Changing material on one line clears its stale cache

| # | Step | Expected |
|---|---|---|
| 1 | Open the MR drawer, add a line, pick Cement (UOM Bag, stock 50) | Row shows UOM=Bag, Stock=50 |
| 2 | Enter quantity 10 | Amount column updates |
| 3 | In the SAME row, click the material combobox and pick Steel (UOM MT, stock 12) | UOM flips to MT, Stock flips to 12, Rate updates to Steel's rate, Amount recomputes from new rate × qty |
| 4 | None of the old Cement values should still appear on that row | ✓ |

**Result:** ☐ Pass ☐ Fail

### TC-4.2 — Clearing material resets to blank

| # | Step | Expected |
|---|---|---|
| 1 | Row has Steel selected from TC-4.1 | — |
| 2 | Click the × to clear the material | Material goes to placeholder |
| 3 | UOM, Stock, Rate all reset to empty/zero | ✓ |
| 4 | Quantity is NOT reset (user-entered) | ✓ |
| 5 | Specification text is NOT reset (user-entered) | ✓ |

**Result:** ☐ Pass ☐ Fail

### TC-4.3 — Line isolation

| # | Step | Expected |
|---|---|---|
| 1 | Add 3 line items: row 1 Cement, row 2 Sand, row 3 Steel | Each row shows its own UOM/Stock/Rate |
| 2 | On row 2, change material from Sand to Gravel | Row 2 updates |
| 3 | Rows 1 and 3 do NOT change | ✓ |

**Result:** ☐ Pass ☐ Fail

### TC-4.4 — UOM override clears stock

| # | Step | Expected |
|---|---|---|
| 1 | Row has Cement selected, UOM=Bag (auto), Stock=50 | — |
| 2 | Open the UOM dropdown and pick MT | Stock field resets to 0 (because the cached stock was in bags, not MT) |

**Result:** ☐ Pass ☐ Fail

---

## Issue #5 — MR terminology

### TC-5.1 — UI labels say "Material Requisition"

| # | Step | Expected |
|---|---|---|
| 1 | Log in as `amit` | — |
| 2 | Check the sidebar **Procurement** section | First item reads "Material Requisitions" (not "Requisitions (PR)") |
| 3 | Click it and land on the list page | — |
| 4 | Click **Create** | Drawer title reads "Create Material Requisition" |
| 5 | Click Create MR (Draft) to save | Button reads "Create MR (Draft)" not "Create PR (Draft)" |
| 6 | Open the saved MR's detail page | Subtitle reads "Material Requisition — {project name}" |
| 7 | Breadcrumb shows "Material Requisitions" | ✓ |

**Result:** ☐ Pass ☐ Fail

---

## Issue #6 — Approval workflow end-to-end

### TC-6.1 — Approvals inbox filters by role

| # | Step | Expected |
|---|---|---|
| 1 | Log in as `sanjay@quikinfra.com` (site engineer) | — |
| 2 | Go to `/approvals` | Page loads with "Logged in as site engineer" in the top-right. Empty state: "All caught up — no pending approvals for your role" |
| 3 | Sign out. Log in as `rakesh@quikinfra.com` (store head) | — |
| 4 | Go to `/approvals` | If any GRN / Issue / Transfer / Recon rows are in a "submitted" or "pending_approval" state, they're listed. Each row shows entity type badge, title, status chip |
| 5 | Log in as `rajesh@quikinfra.com` (accounts_finance) | — |
| 6 | Go to `/approvals` | Only RAB rows show (accounts has rab.approve but not grn.approve) |
| 7 | Log in as `amit` (super admin) | — |
| 8 | Go to `/approvals` | All entity types from all modules show, grouped |

**Result:** ☐ Pass ☐ Fail

### TC-6.2 — MR approve (project manager)

**Prereq:** Create an MR as `sanjay` with one line item; submit it for approval.

| # | Step | Expected |
|---|---|---|
| 1 | Log in as `sanjay`, go to `/purchase/requisitions`, create an MR, submit it | MR status → "submitted" |
| 2 | Sign out, log in as `amit` (or whoever has `purchase.mr.approve`) | — |
| 3 | Open the MR detail page | Header shows approve / reject / return buttons (they did NOT show for sanjay because he lacks the permission) |
| 4 | Click **Approve** | Button spins briefly, then a green "Approved successfully" banner shows. Status chip flips to "approved". Three action buttons hide (entity is no longer actionable) |

**Result:** ☐ Pass ☐ Fail

### TC-6.3 — Reject requires comment

| # | Step | Expected |
|---|---|---|
| 1 | Create another MR (as sanjay), submit it | status=submitted |
| 2 | As `amit`, open the detail page | Action buttons visible |
| 3 | Click **Reject** | Modal opens with a comments textarea and "Comments are required" hint |
| 4 | Click **Reject** in the modal without typing anything | Red error in the modal: "Comments are required." Modal does NOT close |
| 5 | Type "Vendor pricing looks off" in the textarea | Error clears on the next click |
| 6 | Click **Reject** | Modal closes, success banner, status → "rejected" |

**Result:** ☐ Pass ☐ Fail

### TC-6.4 — Return requires comment (same flow as reject)

| # | Step | Expected |
|---|---|---|
| 1 | Create + submit an MR | — |
| 2 | As `amit`, click **Return** | Modal opens with amber styling instead of red |
| 3 | Empty submit → error, typed reason → success | Status → "returned", returnReason recorded in the entity |

**Result:** ☐ Pass ☐ Fail

### TC-6.5 — Already-acted conflict (409)

| # | Step | Expected |
|---|---|---|
| 1 | Open two browser tabs, both logged in as `amit`, both on the same MR's detail page | — |
| 2 | In tab 1, click **Approve** | Success, green banner |
| 3 | In tab 2 (which still shows the old "submitted" state from before refresh), click **Approve** | Red inline error: "Cannot approve — mr is currently in 'approved' state. Already acted on by …" |

**Result:** ☐ Pass ☐ Fail

### TC-6.6 — Permission check: wrong role sees no buttons

| # | Step | Expected |
|---|---|---|
| 1 | Log in as `sanjay` (site engineer, no approve permissions) | — |
| 2 | Open an MR detail page | Approve / Reject / Return buttons are HIDDEN entirely (not visible, not disabled-with-tooltip) |

**Result:** ☐ Pass ☐ Fail

### TC-6.7 — Server-side enforcement

| # | Step | Expected |
|---|---|---|
| 1 | As `sanjay`, open DevTools console | — |
| 2 | Run `fetch("/api/purchase/requisitions/SOME_MR_ID/approve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve" }) }).then(r => r.json()).then(console.log)` | Returns 403 with `{ok: false, error: "Missing permission: purchase.mr.approve", code: "FORBIDDEN"}` |

**Result:** ☐ Pass ☐ Fail

### TC-6.8 — Indent 3-stage flow

| # | Step | Expected |
|---|---|---|
| 1 | Create an indent in submitted state (via API or UI) | status=submitted |
| 2 | As `rakesh` (store head) → no access | Indent detail shows no approval bar |
| 3 | As a user with `purchase.indent.approve_l1` (purchase_manager role) — can create one if not in seed | Bar visible, click Approve |
| 4 | Status flips to `approved_l1`. Log in as `amit` (or project_manager with L2) | Bar visible again, click Approve |
| 5 | Status flips to `approved_l2`. Log in as L3 (project_director or tenant_admin) | Bar visible, click Approve |
| 6 | Status flips to `l3_approved` | Final state |

**Result:** ☐ Pass ☐ Fail

### TC-6.9 — PO 2-stage

Same pattern as Indent but 2 stages: `pending_l1` → L1 approve → `pending_l2` → L2 approve → `approved`.

**Result:** ☐ Pass ☐ Fail

### TC-6.10 — GRN single-stage (store head)

| # | Step | Expected |
|---|---|---|
| 1 | Create a GRN (via UI or API), status=submitted/pending_approval | — |
| 2 | Log in as `rakesh` (store_head) | — |
| 3 | Open the GRN detail page | Approve / Reject / Return buttons visible in the header |
| 4 | Click Approve | Success, status → approved, stock credited inward (check the stock register afterward) |

**Result:** ☐ Pass ☐ Fail

---

## Issue #7 — RBAC (sidebar + routes)

### TC-7.1 — Sidebar visibility per role

Log in as each of the 5 demo users and record which sidebar sections are
visible. The sidebar filters via `usePermissions().can()` against the
`requiredPermission` tagged on each nav item.

| User | Should see | Should NOT see |
|---|---|---|
| `amit` (super admin)   | Every section | (nothing hidden) |
| `priya` (tenant admin) | Every section | (nothing hidden) |
| `rajesh` (accounts)    | Dashboard, Masters (read), Finance, Reports, Approvals, limited Project Mgmt (BOQ read, DPR read, RAB) | Purchase create/approve sections, Store write, QA/Safety |
| `sanjay` (site engineer) | Dashboard, Masters (read), Material Requisitions (read+write), GRN (read+write), BOQ (read), DPR (read+write), Quality read, Approvals | Indents/PO create, Finance, Store approvals, Settings, Workflows |
| `rakesh` (store head)  | Dashboard, Store sections, GRN, Approvals, Masters read | Purchase create, Finance, Settings, Projects |

**Checklist:**

- ☐ `amit` sees all 8 nav groups (Org, Masters, Procurement, Store, Projects, Quality, Finance, System)
- ☐ `priya` sees the same as amit
- ☐ `rajesh` does NOT see "Settings → Users" or "Material Requisitions"
- ☐ `sanjay` does NOT see "Finance", "Settings", "Stock Reconciliation", or "Financial Years"
- ☐ `rakesh` does NOT see "Material Requisitions", "Indents", "Purchase Orders" (only read of GRN), "Finance", "Settings"
- ☐ Logged-in role name appears in the sidebar footer under the user name

### TC-7.2 — Direct URL access is denied server-side

As `sanjay`, open DevTools and run:

```js
fetch("/api/masters/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: "X", name: "Y" })}).then(r => r.status)
```

Expected: 403. (`sanjay` has `masters.read` but not `masters.write`.)

**Result:** ☐ Pass ☐ Fail

### TC-7.3 — Page-level buttons hidden

| # | Step | Expected |
|---|---|---|
| 1 | `sanjay` opens `/masters/projects` | List loads |
| 2 | The "+ Add Project" button is hidden | ✓ (needs `masters.write`) |
| 3 | `amit` opens the same page | Button visible |

**Result:** ☐ Pass ☐ Fail (the list page's create button must respect `<Can permission="masters.write">`)

### TC-7.4 — Hidden-via-filter nav items are unreachable via sidebar

| # | Step | Expected |
|---|---|---|
| 1 | Log in as `rakesh` | — |
| 2 | Look for "Finance" section in sidebar | Not present |
| 3 | Manually type `/finance/vendor-payments` in the URL bar | Page loads OR middleware redirects. Either way, the underlying API calls return 403 so no finance data renders |

**Result:** ☐ Pass ☐ Fail

---

## Regression — Existing Playwright suite still passes

Run the full automated suite after the stabilization pass:

```bash
cd apps/quikconstruction
node -e "const { PrismaClient } = require('./node_modules/.prisma-qc/client'); \
  (async () => { const c = new PrismaClient(); \
    await c.cnIdempotencyKey.deleteMany({}); await c.\$disconnect(); })();"
E2E_EXTERNAL_SERVER=1 E2E_BASE_URL=http://127.0.0.1:3010 \
  pnpm exec playwright test --reporter=list --workers=1
```

Expected: **43 passing, 6 skipped, 0 failing.**

The 6 skipped tests are pre-existing Phase-2b placeholders for purchase
flow migration — they're skipped with clear reasons in the spec files.

**Result:** ☐ Pass ☐ Fail (record actual counts if different)

---

## UAT sign-off

| Issue | Status | Notes |
|---|---|---|
| #1 BOQ Upload Revision | ☐ Pass ☐ Fail | |
| #2 Project state/city binding | ☐ Pass ☐ Fail | |
| #3 Searchable material selector | ☐ Pass ☐ Fail | |
| #4 Line-item state reset | ☐ Pass ☐ Fail | |
| #5 MR terminology | ☐ Pass ☐ Fail | |
| #6 Approval workflow | ☐ Pass ☐ Fail | |
| #7 RBAC enforcement | ☐ Pass ☐ Fail | |
| Regression (Playwright) | ☐ Pass ☐ Fail | |

**Tested by:** _______________  **Date:** _______________  **Build/SHA:** _______________

---

## Known limitations documented

These are NOT bugs — they're called out explicitly so UAT testers don't
flag them as regressions:

1. **Purchase routes on globalThis store.** MR, Indent, PO, GRN, Issue,
   Transfer, Recon entities still live in the in-memory store (Phase 2b
   migration tracked). Restarting the dev server wipes created entities.
   BOQ, DPR, RAB, RBAC, and audit log data persist in Postgres.
2. **Rate limiter is per-node.** Behind N replicas the effective rate is
   N × configured. Not visible in single-node demo.
3. **Sentry optional.** `SENTRY_DSN` unset ⇒ no-op. Errors still log to
   stdout.
4. **AUTH_DEMO_MODE=true** on LAN deploy. Session-less requests resolve
   to `DEMO_CTX` super admin — that's why even without logging in, the
   app works. Production must flip this to `false` (env validator enforces).
5. **Indent L1/L2/L3 and PO L1/L2** — stepping through all levels
   requires users with each permission in the seed. The 5 demo users
   cover MR approve, GRN approve, RAB approve, Issue approve; for
   `purchase_manager` (Indent L1) and `project_director` (Indent L3 / PO L2),
   either add them to the seed or grant the perms to an existing role
   temporarily via the Settings → Roles page.
