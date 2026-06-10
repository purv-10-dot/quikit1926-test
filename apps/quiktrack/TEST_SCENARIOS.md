# QuikTrack — Exhaustive Test Scenarios

QA matrix covering every working feature, sub-action, field, edge case, security concern, and cross-cutting behavior. Use this as the master regression sheet for releases.

**Format per feature:**
- **Best:** the expected happy-path behavior
- **Worst:** failure modes / edge cases with expected handling
- **Security / Perms:** access-control and tenant-isolation checks
- **Perf:** performance + load expectations
- **Edge:** unusual inputs and concurrency

---

# 1. Authentication & Session

## 1.1 Login (SSO via central auth app)
- **Best:** User enters email + password → redirected via `/post-login` → `/auth-handoff` → lands on QuikTrack with session cookie set on the quiktrack subdomain.
- **Worst:**
  - Wrong password → "Invalid credentials" with no leak of whether email exists.
  - 5+ failed attempts in 5 minutes → temporary lockout with countdown.
  - Auth-handoff token expired (>120s) → redirect to `/login?reason=expired_handoff`.
  - Auth-handoff token tampered → `?reason=invalid_handoff`.
  - INTERNAL_SECRET mismatch between apps → 500 "Server misconfigured" on auth-handoff.
  - NEXTAUTH_SECRET mismatch → cookie set but next request rejects it; user bounced to login.
  - Cross-domain cookie blocked by browser → handoff token flow still works (cookie sandboxed per app).
- **Security:** CSRF protection on POST `/login`; HTTPS only in prod; httpOnly + Secure flags on session cookie.
- **Perf:** Login round-trip under 2s on cold start, under 500ms when warm.

## 1.2 Logout
- **Best:** Click Sign Out → session cleared on this app + all sibling apps (global sign-out).
- **Worst:**
  - Network drop during sign-out → local cookies cleared; user lands on login.
  - Sign out from one tab → other tabs detect within 5 min via session validation and redirect.
- **Security:** No residual cookies; Redis session record invalidated.

## 1.3 Session Validation (background)
- **Best:** Every 24h + on focus + on poll, `/api/session/validate` confirms user is still active.
- **Worst:**
  - DB unreachable → 500 from validate → client treats as deactivated, signs out (false positive concern → handled by retrying once before signOut).
  - OrgMember.status flipped to `inactive` → user signed out within 5min.
  - UserAppAccess revoked → `reason=app_access_revoked` redirect.
  - Cross-tab session change → focused tab refreshes.

## 1.4 Cross-App Auth Handoff
- **Best:** Click app tile in launcher → quiktrack/auth-handoff?token=… → quiktrack session minted with same userId.
- **Worst:**
  - User missing `UserAppAccess` for quiktrack in current org → 403 "No access to this app".
  - Org has no `OrgAppAccess(quiktrack).enabled=true` → 403 "App not enabled for this org".
  - Super-admin bypass → token mints regardless of access rows.
  - INTERNAL_SECRET rotated → existing tokens fail; users re-login.
- **Security:** Token TTL 120s, single-use ideally, signed payload validated server-side.

## 1.5 Auth Handoff With Custom Domain (Hypothetical)
- **Best:** Cookie set on `.quikit.com` → all subdomains share session natively.
- **Worst:** Not configured today; vercel.app uses token handoff fallback.

---

# 2. Home & Dashboards

## 2.1 "For You" Home (`/`)
- **Best:** Renders assigned issues, recent activity, project tiles in <2s.
- **Worst:**
  - 0 assigned → empty state "Nothing assigned" with CTA.
  - 0 projects → "No projects yet" gate page replaces dashboard.
  - 50+ projects → tiles paginate or scroll.
  - DB timeout → skeleton, retry CTA.
  - User deactivated → signOut + redirect.
- **Edge:** User with assigned issues across 10+ projects → grouped by project.
- **Perf:** Initial render <2s; widgets lazy-load.

## 2.2 Default Dashboard (`/dashboards/default`)
- **Best:** All widgets load with real data; cards/chart/list render correctly.
- **Worst:**
  - One widget API fails → others still render; failed widget shows error toast.
  - User has access to 0 projects → status chart shows empty state.
  - Mixed project access → only data user can see is included.

## 2.3 Custom Dashboards (`QtDashboard`)
- **Best:** Create, name, add widgets, save, reload — layout persists.
- **Worst:**
  - User deletes last dashboard → fallback to default.
  - Concurrent edit on same dashboard → last-write-wins with warning.
  - Widget references deleted project → widget shown as inactive, removable.
- **Security:** Dashboard belongs to user — others can't read it.

## 2.4 Onboarding Tour (Kan)
- **Best:** First-time logged-in user with ≥1 project + access sees tour; complete or skip marks done.
- **Worst:**
  - User has no project (gate page) → tour does NOT show.
  - User skips → tour does not re-appear.
  - Manual restart from help menu → tour replays cleanly.
  - Tour overlay blocks click → "Skip tour" always reachable.
- **Edge:** Resize browser mid-tour → spotlights re-anchor.

## 2.5 Help Panel
- **Best:** Search returns relevant articles; common shortcuts displayed.
- **Worst:** Search returns 0 → "Contact support" with admin emails.

## 2.6 Activity Stream (`QtUserActivity`)
- **Best:** Most-recent 30 activities (status changes, comments, assignments) shown.
- **Worst:**
  - 0 activity → empty state.
  - Mass-update creates 1000 events → paginated, infinite scroll.
  - Activity references deleted resource → "Deleted item" label.

---

# 3. Project / Space Management

## 3.1 Create Project
- **Best:** Admin enters name, key, description, color, lead → project created with seeded defaults (5 statuses, 4 issue types, 5 project roles, default groups).
- **Worst:**
  - Duplicate key in same org → 409 inline error.
  - Key <2 chars or >10 chars → form validation.
  - Reserved key (e.g. "ADMIN") → blocked.
  - Non-admin → 403, button hidden.
  - Network drop mid-create → no orphan rows (transactional).
- **Security:** Caller must have `Project:create` permission; cross-tenant write rejected.

## 3.2 Edit Project Settings
- **Best:** Name, description, status, lead, color update; reflected everywhere.
- **Worst:**
  - Two admins edit simultaneously → last-write-wins.
  - Soft-deleted project → hidden from list, recoverable.
  - Lead deactivated → flagged for reassignment.
  - Set status to `archived` → readonly for everyone except admin.

## 3.3 Project Member Add
- **Best:** Add user, assign role → row in QtProjectMember + role assignment.
- **Worst:**
  - Add user not in org → blocked.
  - Add same user twice → idempotent.
  - Role doesn't exist in this project → 400.
- **Security:** Need `ProjectMember:create` on this project.

## 3.4 Project Member Remove
- **Best:** Remove user → loses project access but keeps comment history.
- **Worst:**
  - Remove last admin → blocked with "Need at least one admin".
  - Remove self → confirmation modal.
  - User has assigned issues → confirm "what to do with assignments" (reassign / nullify).
- **Security:** Need `ProjectMember:delete`.

## 3.5 Project Role Change
- **Best:** Change user's project role → permissions reflect immediately.
- **Worst:**
  - Demote yourself → confirm modal.
  - Role removed from project → user moved to default.

## 3.6 Per-Project Feature Toggles (`/spaces/[id]/settings/features`)
- **Best:** Disable a module → sidebar entry hides for everyone.
- **Worst:**
  - Disabled while user on page → middleware redirects.
  - Disabling preserves data (don't drop sprints when sprints module off).
  - Toggle race → idempotent.

## 3.7 Project Archive / Delete
- **Best:** Archived project hidden from default spaces list, accessible via "Show archived"; deletion soft-deletes with retention.
- **Worst:**
  - Restore archived project → all data intact.
  - Delete project with active sprints → confirm modal explains consequences.

---

# 4. Issue Tracking — CRUD

## 4.1 Create Issue
- **Best:** Title + type + status + assignee + reporter saved; auto-incremented key (`WEB-42`).
- **Worst:**
  - Title empty → submit disabled.
  - Title >500 chars → trimmed or validation error.
  - Concurrent create → DB unique constraint on (projectId, key) ensures no collision; second retries.
  - Network drop mid-save → optimistic rollback, retry button.
  - Submit without permission → 403.
- **Security:** `Issue:create` required; orgId scoping enforced.
- **Edge:** Issue with non-ASCII title (emoji, RTL) → renders correctly.
- **Perf:** Save under 500ms.

## 4.2 Read / View Issue
- **Best:** Issue detail loads in <1s; all fields, comments, history, attachments visible.
- **Worst:**
  - Issue deleted → "This issue was deleted".
  - Issue in different org → 404 (no tenant leak).
  - Permission denied → 403 with explanation.
- **Security:** `Issue:view` required; tenant-isolation enforced.

## 4.3 Update Issue (each field)

| Field | Best | Worst |
|---|---|---|
| title | Inline edit, save on blur | Empty/too long blocked |
| description | Rich text save | Concurrent edit → last-write-wins, diff banner |
| type | Dropdown change | Type deleted mid-edit → fallback |
| status | Pill switch | Status deleted → reset to default |
| priority | Picker change | None |
| assignee | User picker | Picked user removed from project → block |
| reporter | User picker | Same |
| sprint | Sprint picker | Pick closed sprint → blocked |
| epic | Epic picker | Pick deleted epic → block |
| storyPoints | Inline edit | Negative/non-numeric blocked |
| eta (original estimate) | Hours field | Negative blocked |
| startDate | Date picker | Before project start → warning |
| dueDate | Date picker | Before startDate → warning |
| labels | Multi-add | Empty label blocked |
| group | Task group picker | Group deleted → null |

- **Security:** Field-level perms — readonly fields disabled in UI AND rejected at API.
- **Edge:** Editing while another user has the issue open → both see changes via polling (or stale; reload prompt).

## 4.4 Delete Issue
- **Best:** Soft-deletes; trash retention; undo toast.
- **Worst:**
  - Issue has subtasks → cascade modal.
  - Issue is being viewed by another user → their page shows "Deleted".
  - Restore from trash within retention window → fully restored.
  - Restore after retention purge → blocked.
- **Security:** `Issue:delete` required.

## 4.5 Restore / Archive Issue
- **Best:** Restore re-attaches all history/comments/attachments.
- **Worst:**
  - Restore an issue whose project is deleted → blocked.

## 4.6 Clone / Duplicate Issue
- **Best:** Clone copies fields, resets status to default, generates new key.
- **Worst:** Clone subtasks → user choice; default = no.

## 4.7 Move Issue Between Projects
- **Best:** Move preserves comments, history, attachments; key changes to new project's sequence.
- **Worst:**
  - Move to project with no equivalent status → modal asks for status mapping.
  - Move to project user lacks access to → blocked.

## 4.8 Bulk CSV Import
- **Best:** Upload 100-row CSV → all created with summary report.
- **Worst:**
  - Invalid headers → mapping screen.
  - Mixed valid + invalid → invalid skipped, error log downloadable.
  - Duplicate keys → per-conflict choice (skip/update/new).
  - 10k-row CSV → background job, progress bar, email when done.
  - Malicious CSV (formula injection like `=CMD()`) → sanitized.

## 4.9 Bulk Delete
- **Best:** Multi-select N issues, confirm, delete; undo toast.
- **Worst:**
  - Includes issues you lack perms for → partial success, error toast.
  - 1000+ selected → background job.

## 4.10 Bulk Status Change / Bulk Assign
- **Best:** Apply to all selected; success per-row.
- **Worst:** Some fail (perm/validation) → row-level error display.

---

# 5. Issue Tracking — Comments & Mentions

## 5.1 Add Comment
- **Best:** Type, save, appears immediately for all viewers within polling interval.
- **Worst:**
  - Empty comment → submit disabled.
  - >10k chars → split or block.
  - Network drop → optimistic state + retry.

## 5.2 Edit Comment
- **Best:** Edit within edit window → updated with "edited" badge.
- **Worst:**
  - Edit after deletion → blocked.
  - Edit comment you didn't write → blocked unless admin.

## 5.3 Delete Comment
- **Best:** Soft-deletes; replies preserved.
- **Worst:**
  - Delete with attachments → attachments removed.
  - Delete by non-owner → blocked unless admin.

## 5.4 @-Mentions
- **Best:** Autocomplete shows project members; mentioned user gets notification + email.
- **Worst:**
  - Mention non-project member → autocomplete excludes them.
  - Mention deactivated user → email NOT sent.
  - Self-mention → no notification.
  - Mention via API without going through autocomplete → server validates.

## 5.5 Comment Reactions
- **Best:** Click 👍 → counts, user highlighted.
- **Worst:**
  - Double-tap same emoji → toggle off.
  - Concurrent reactions → both counted.

---

# 6. Issue Tracking — Attachments

## 6.1 Upload Attachment
- **Best:** Drag-drop file ≤25MB → uploads to S3, preview thumbnail.
- **Worst:**
  - >25MB → blocked with size error.
  - Blocked file type (`.exe`, `.bat`, `.sh`) → rejected.
  - S3 5xx → retry with backoff.
  - Mid-upload disconnect → resumable.
  - Filename has path injection (`../../etc/passwd`) → sanitized.
  - Malware upload → server-side scan if enabled.
- **Security:** Pre-signed URL scoped to issue; downloads require auth.
- **Perf:** 10MB upload <10s on broadband.

## 6.2 Download Attachment
- **Best:** Click → file downloads via pre-signed URL.
- **Worst:**
  - Pre-signed URL expired → regenerate on demand.
  - Attachment deleted → 404 with safe message.

## 6.3 Delete Attachment
- **Best:** Owner or project admin can delete → S3 object purged + DB row removed.
- **Worst:** Non-owner non-admin → blocked.

## 6.4 Preview Attachment
- **Best:** Images render inline; PDFs in viewer; videos play.
- **Worst:** Unsupported type → download fallback.

---

# 7. Issue Tracking — Links / Hierarchy

## 7.1 Create Issue Link
- **Best:** Link issue A to B with "blocks" type → bidirectional row + UI both sides.
- **Worst:**
  - Self-link → blocked.
  - Duplicate link → idempotent.
  - Link across orgs → blocked.

## 7.2 Subtasks
- **Best:** Create subtask under parent → parent shows count + completion %.
- **Worst:**
  - Circular hierarchy → blocked.
  - Delete parent with subtasks → confirm cascade.
  - Move subtask to different parent → preserved.

## 7.3 Epic Linkage
- **Best:** Assign issue to epic → epic shows roll-up status of all children.
- **Worst:**
  - Epic deleted → child issues' epic field nulled.

---

# 8. Issue Tracking — Watchers

## 8.1 Watch Issue
- **Best:** Click watch → user added to QtIssueWatcher; notifications begin.
- **Worst:**
  - Already watching → idempotent.
  - Watch race → no duplicate.

## 8.2 Auto-Watch
- **Best:** Reporter, assignee, mentioned, commenter auto-subscribed.
- **Worst:** Removed as assignee → still watching (user choice to unwatch).

## 8.3 Unwatch
- **Best:** Click unwatch → notifications stop immediately.

---

# 9. Sprint Planning

## 9.1 Create Sprint
- **Best:** Name + dates + goal → sprint created with `PLANNED` status.
- **Worst:**
  - Date range overlap with active sprint → allowed but flagged.
  - Empty name → blocked.

## 9.2 Drag Issue to Sprint
- **Best:** Drag from backlog → updates sprintId; board reflects.
- **Worst:**
  - Drag to completed sprint → blocked.
  - Concurrent drag → last-write-wins.

## 9.3 Start Sprint
- **Best:** Click Start → `ACTIVE`, dates locked, history entry.
- **Worst:**
  - Already-active sibling sprint → second blocked.
  - 0 issues → warning, allowed.
- **Security:** `Sprint:update` required.

## 9.4 Complete Sprint
- **Best:** Click Complete → modal asks where to put incomplete issues (backlog / next sprint).
- **Worst:**
  - Already-complete sprint → idempotent.
  - Complete without confirming incomplete handling → blocked.

## 9.5 Delete Sprint
- **Best:** Soft-deletes; issues' sprintId set to null.
- **Worst:** Delete active sprint → blocked or strong confirm.

---

# 10. Documentation (Wiki)

## 10.1 Create Doc / Page
- **Best:** Name + content → page in tree.
- **Worst:**
  - Duplicate name → blocked.
  - Empty content → allowed (placeholder).

## 10.2 Edit Doc
- **Best:** Rich text edit, save → version recorded.
- **Worst:**
  - Concurrent edit → conflict banner with diff.
  - Page deleted during edit → save blocked, save-as-new option.

## 10.3 Delete Doc
- **Best:** Soft delete with retention.
- **Worst:** Children docs → cascade modal.

## 10.4 Asset Upload (image/file in doc)
- **Best:** Drag/paste/upload → embedded in editor.
- **Worst:**
  - File too large → blocked.
  - Unsupported MIME → blocked.

## 10.5 Hierarchy Move
- **Best:** Drag page under another → tree reorders.
- **Worst:** Circular nest → blocked.

---

# 11. Reporting

## 11.1 Project Status Report (`/reports`)
- **Best:** Renders breakdown in <3s.
- **Worst:**
  - 10k issues → server-side aggregation; no client lag.
  - Empty project → "No data".
- **Perf:** Query cached for 60s.

## 11.2 Resource Report (`/reports/resource`)
- **Best:** Workload by member; overloaded users flagged.
- **Worst:**
  - User on deleted project → row with strikethrough.
  - 0 entries → empty state.

## 11.3 Task Time Drawer
- **Best:** Click row → drawer with time entries.
- **Worst:** 100+ entries → paginated.

## 11.4 User Time Drawer
- **Best:** Same as 11.3, scoped to user.

## 11.5 Sprint Completion Metrics
- **Best:** Completion % computed from `QtIssueHistory`.
- **Worst:** Sprint never completed → "In Progress" not 0%.

## 11.6 Export Report (CSV)
- **Best:** Download CSV with all visible rows.
- **Worst:**
  - Filter has 10k rows → background job + email link.
  - CSV injection (`=CMD()` etc.) → escaped.

---

# 12. Time Tracking

## 12.1 Add Time Entry (Grid)
- **Best:** Cell click, type hours, save.
- **Worst:**
  - Negative → blocked.
  - >24/day → soft warning.
  - Decimal precision (0.25h) → supported.
  - For deleted issue → row marked "Issue removed".

## 12.2 Edit Time Entry
- **Best:** Cell click, change, save.
- **Worst:**
  - Locked period → blocked (if implemented).
  - Concurrent edit → last-write-wins.

## 12.3 Delete Time Entry
- **Best:** Right-click → delete, undo toast.
- **Worst:** Delete own only; admin can delete others'.

## 12.4 Weekly Summary
- **Best:** Auto-rollup by user/week; export to CSV.
- **Worst:** Week with no entries → 0h shown explicitly, not omitted.

## 12.5 Per-Project Timesheet
- **Best:** Only this project's entries.
- **Worst:** Filter by team member.

## 12.6 Log Time From Issue
- **Best:** Inline form, defaults to today.
- **Worst:** Time exceeds remaining estimate → soft warning.

---

# 13. Notifications

## 13.1 In-App Notification List (`/notifications`)
- **Best:** Direct + Watching tabs; mark-read works.
- **Worst:**
  - 200+ unread → "Mark all read" works; paginate.
  - User deactivated → redirect.

## 13.2 Bell Badge
- **Best:** Real-time count update via polling within 5s.
- **Worst:** Polling fails → badge stays last-known.

## 13.3 Mark Read / Unread
- **Best:** Single mark; bulk select; "Mark all" link.
- **Worst:** Concurrent mark → idempotent.

## 13.4 Notification Preferences (per-event)
- **Best:** Toggle each type → respected by next event.
- **Worst:**
  - All off → in-app still shown.
  - Email off but mention happens → in-app only.

## 13.5 Email Notifications
- **Best:** Mention triggers email <30s with snippet + deep link.
- **Worst:**
  - SMTP down → retry queue with exponential backoff.
  - Bounced email → flagged in user record.
  - Spam-classified email → not retried.

## 13.6 Digest Emails (Daily / Weekly)
- **Best:** Cron runs, sends per-user digest.
- **Worst:**
  - 0 unread → no digest.
  - User opted out → skipped.
  - Cron fails → next-day retry.

## 13.7 Overdue Task Alert (`/api/cron/overdue-notifications`)
- **Best:** Nightly cron emails assignees of overdue tasks.
- **Worst:**
  - No assignee → email project lead.
  - User just updated due date → next cycle picks up.

---

# 14. Teams

## 14.1 Create Team
- **Best:** Name + color → team created in org.
- **Worst:**
  - Duplicate name → blocked.
  - Non-admin → 403.

## 14.2 Add Member to Team
- **Best:** Assign role (MEMBER, LEAD); idempotent on duplicate.
- **Worst:** Remove last lead → blocked.

## 14.3 Delete Team
- **Best:** Assignments preserved with team field nulled.
- **Worst:** Confirmation modal warns about active assignments.

---

# 15. Search

## 15.1 Global Search
- **Best:** `/` opens, type "WEB-42" → result <300ms.
- **Worst:**
  - 10k+ issues → paginated, debounced.
  - SQL injection style input → safely escaped.
  - 0 results → friendly state.
- **Security:** Only returns issues user can view (tenant + project scoped).
- **Perf:** P95 <500ms.

## 15.2 Advanced Filters
- **Best:** 5+ filter facets combined → narrow list correctly.
- **Worst:**
  - Filter with deleted reference (deleted user) → option grayed.
  - 0 results → "Clear filters" CTA.

## 15.3 Saved Filters
- **Best:** Save, name, optional share → appears in sidebar.
- **Worst:**
  - Edit shared filter → audit logged.
  - Delete shared → notify subscribers.
  - Filter against deleted project → user can clean up.

## 15.4 User Picker
- **Best:** Type partial name → top 10 matches <200ms.
- **Worst:**
  - No matches → suggest invite.
  - Deactivated users excluded.

---

# 16. Views (List, Board, Grouped, Backlog, Summary, Timeline, Task Table)

## 16.1 Switching Views
- **Best:** Filter context preserved across views.
- **Worst:** Unsaved edit → confirm-leave prompt.

## 16.2 Drag-and-Drop (Board)
- **Best:** Drop card on new column → status updates; history records.
- **Worst:**
  - Drop on unreachable column (perm) → snap back.
  - Concurrent drag by two users → last-write-wins.
  - Drag with 1000 cards on screen → virtualized; perf stays.

## 16.3 Column Resize / Reorder / Hide / Freeze
- **Best:** All persist in `QtUserViewPref`.
- **Worst:**
  - Stale pref references removed column → ignored.
  - Resize to 0 width → snaps to min.

## 16.4 Sort
- **Best:** Click header → ascending/descending toggle; preserved per-view.
- **Worst:** Sort on non-sortable column → no-op.

## 16.5 Pagination / Virtualization
- **Best:** 1000+ rows render smoothly; load-more works.
- **Worst:**
  - Slow network → skeleton during fetch.
  - User scrolls past end → "No more results".

## 16.6 Empty State
- **Best:** "No issues match" or "No data yet" with CTA.

## 16.7 Loading State
- **Best:** Skeleton placeholders; never blank flash.

## 16.8 Error State
- **Best:** Retry CTA; specific error message; never silent fail.

## 16.9 Timeline (Gantt)
- **Best:** Date-anchored bars; drag to extend.
- **Worst:**
  - No dates → row hidden or placeholder.
  - Overlapping bars → stacked correctly.

## 16.10 Task Table
- **Best:** Spreadsheet-style edits; bulk select.
- **Worst:** Large dataset → virtualization.

---

# 17. Permissions / Roles / RBAC

## 17.1 Org Role Create
- **Best:** Create custom role; grant permissions; assign users.
- **Worst:**
  - Duplicate name → blocked.
  - Role with 0 perms → user gets bare shell.

## 17.2 Org Role Edit
- **Best:** Toggle grants; effect propagates to users.
- **Worst:** Removed permission while user mid-action → next API call 403.

## 17.3 Org Role Delete
- **Best:** Remap users to default role before delete.
- **Worst:** Default role can't be deleted.

## 17.4 Project Role Create / Edit / Delete
- **Best:** Same as org but scoped to project.
- **Worst:** "Project Admin" starter role can't be deleted if last admin.

## 17.5 Permission Grants
- For every (resource × action), test allow + deny:
  - `Project` × {view, create, update, delete}
  - `ProjectMember` × {view, create, update, delete}
  - `Issue` × {view, create, update, delete}
  - `IssueComment` × {view, create, update, delete}
  - `Sprint` × {view, create, update, delete}
  - `Board`, `Doc`, `Report`, `Timesheet` × applicable actions
- **Worst:** Grant invalid resource/action → 400.

## 17.6 Field-Level Access
- For each entity field, test 4 levels: `editable`, `readonly`, `hidden`, `required`.
- **Best:**
  - editable → field works.
  - readonly → disabled in UI; API rejects writes.
  - hidden → not rendered; API doesn't return value.
  - required → save blocked if empty.

## 17.7 Navigation Gating
- **Best:** Disabling `Report:view` removes Reports from sidebar.
- **Worst:** Direct URL access → middleware redirects.

## 17.8 Tenant Isolation
- **Best:** Every query scoped to `orgId`.
- **Worst:**
  - Forced URL `/api/issues/<other-tenant-issue-id>` → 404.
  - IDOR via path/query → 404 or 403, never 200.
  - SQL injection attempting to break tenant filter → escaped.

---

# 18. Admin & Organization

## 18.1 Invite User (Email)
- **Best:** Email + role → invite email sent; row in `QtInvitation`.
- **Worst:**
  - Existing user → adds to org without re-create.
  - Invalid email → blocked.
  - Disposable email domain → optional block.
  - Email send fails → retry queue.

## 18.2 Accept Invitation
- **Best:** Click link → set password → land on launcher.
- **Worst:**
  - Token expired → "Request new invite" CTA.
  - Token used twice → second use blocked.
  - Token tampered → 401 + security log.
  - SSO invite → no password prompt; go through OAuth.

## 18.3 Deactivate User
- **Best:** Status → `inactive`; user logged out within 5min.
- **Worst:**
  - Deactivate self → blocked.
  - Re-activate within retention → restored.
  - Issues stay assigned but flagged.

## 18.4 Edit User Role (org-level)
- **Best:** Change role → permissions reflect.
- **Worst:** Demote last admin → blocked.

## 18.5 Company Branding
- **Best:** Set logo, accent color → live across all branded surfaces.
- **Worst:**
  - Invalid hex → blocked.
  - Low contrast → accessibility warning.
  - Logo too large → resized server-side.

## 18.6 Org Role Management
- **Best:** Create app-level role + permissions matrix.
- **Worst:** System roles (admin, Member) can't be deleted, only edited within limits.

## 18.7 Per-Project Notification Config
- **Best:** Enable/disable specific event emails.
- **Worst:** Disable all → in-app still works.

## 18.8 Jira Migration
- **Best:** Connect token → pick project → field mapping → import.
- **Worst:**
  - Rate limit hit → pause + resume.
  - Field mismatch → mapping screen.
  - Network drop mid-import → resumable from checkpoint.
  - Re-run on same project → "Update existing" or "Create new" option.
  - Issue keys collide with existing → resolution prompt.

## 18.9 User Management (`/settings/user-management`)
- **Best:** Lists all users with UserAppAccess; role pills; status badges.
- **Worst:**
  - User without QuikTrack access → not shown.
  - Search returns 0 → friendly state.

---

# 19. Personalization

## 19.1 Theme Mode (Light / Dark / System)
- **Best:** Toggle applies instantly; persists in `User.themeMode`.
- **Worst:**
  - System change mid-session (auto) → smooth swap.
  - Theme flash on initial paint → mitigated by SSR-aware theme provider.

## 19.2 Accent Color
- **Best:** Brand color flows through buttons, badges, focus rings.
- **Worst:**
  - Too light → accessibility warning.
  - Conflicts with locked tables (KPI traffic-light) → those tables stay fixed-color per CLAUDE.md rule.

## 19.3 View Preferences (per-view, per-user)
- **Best:** Frozen cols, hidden cols, widths, sort persist across reloads.
- **Worst:** Removed col → silently dropped from prefs.

## 19.4 Tour Restart
- **Best:** Help menu → restart → tour replays.
- **Worst:** Mid-modal restart → modal closes safely first.

---

# 20. Cross-App & Platform

## 20.1 App Switcher Vertical Menu
- **Best:** Header dropdown shows apps user has access to.
- **Worst:**
  - No other access → menu shows only current app.
  - Click app he can't access → blocked at API.

## 20.2 SSO Across Apps
- **Best:** Auth handoff token bridges session; lands on target app authenticated.
- **Worst:**
  - INTERNAL_SECRET mismatch → 500.
  - NEXTAUTH_SECRET mismatch → loops back to login.
  - Token replay attack → JTI used once.

## 20.3 Shared Organization Data
- **Best:** User created in admin portal appears in QuikTrack.
- **Worst:** Concurrent edit across apps → last-write-wins + audit.

## 20.4 Org Switch in Another Tab
- **Best:** Current tab updates on next nav or focus.
- **Worst:** Stale orgId in JWT mid-action → API returns context-mismatch error.

## 20.5 Single Logout
- **Best:** Logout from any app → all sibling apps lose session within 5min.
- **Worst:** Logout API fails → local cookie still cleared.

## 20.6 Sidebar Collapse
- **Best:** Persists per user.
- **Worst:** Mobile viewport → auto-hides regardless.

---

# 21. Email Templates & Delivery

## 21.1 Invite Email
- **Best:** Branded, contains role + org name + accept link with token.
- **Worst:**
  - Token in URL filtered by corporate gateway → fallback "copy code" option.
  - HTML stripped in plain-text fallback.

## 21.2 Mention Email
- **Best:** Snippet of comment + deep link.
- **Worst:** Comment edited after send → link still works; current text shown.

## 21.3 Assignment Email
- **Best:** Title, issue key, deep link.

## 21.4 Daily / Weekly Digest
- **Best:** Bulleted summary of unread.
- **Worst:** 0 unread → no email sent.

## 21.5 Overdue Alert Email
- **Best:** List of overdue issues with due dates.
- **Worst:** Assignee deactivated → email skipped or escalated to lead.

## 21.6 Password Reset / Magic Link
- **Best:** Single-use, time-bound token.
- **Worst:** Reuse → blocked + audit log.

---

# 22. Cron / Background Jobs

## 22.1 Overdue Notifications Cron
- **Best:** Runs nightly; idempotent.
- **Worst:**
  - Cron skipped one day → next day catches both.
  - DB unreachable → graceful retry.

## 22.2 Digest Cron
- **Best:** Runs at configured cadence; respects per-user setting.
- **Worst:** Cron timing across time zones → user's local timezone respected.

## 22.3 Session Cleanup
- **Best:** Expired Redis sessions purged.
- **Worst:** Cleanup never runs → stale sessions linger; mitigated by JWT TTL.

## 22.4 Audit Log Retention
- **Best:** Old entries archived per policy.
- **Worst:** Retention misconfigured → DB grows unboundedly; alert.

---

# 23. Security

## 23.1 Authentication
- HTTPS-only cookies in prod.
- `httpOnly`, `Secure`, `SameSite=Lax` on session cookie.
- No JWT in localStorage.
- Password hashing via bcrypt (10+ rounds).
- Rate-limit on login (5 attempts / 5 min).
- Email enumeration prevention.

## 23.2 Authorization (RBAC)
- Every API route gated by `withOrgAuth` or `withTenantAuth`.
- Tenant scoping on every Prisma query (`where: { orgId }`).
- Permission checks via `loadMyPermissions` or `requireAdmin`.
- No `as any` escape hatches.

## 23.3 IDOR Prevention
- Direct ID URLs (`/issues/<id>`) check `orgId` match.
- Pre-signed S3 URLs scoped to issue.

## 23.4 Input Validation
- Zod schemas on every POST/PATCH body.
- Length caps on free-text fields.
- Type/format validation on emails, dates, hex colors, UUIDs.

## 23.5 Output Encoding
- React auto-escapes JSX; no `dangerouslySetInnerHTML` on user content.
- Rich text rendered via sanitized AST (TipTap).
- CSV exports escape `=` / `+` / `-` to prevent formula injection.

## 23.6 SQL Injection
- All queries via Prisma → parameterized.
- `$queryRawUnsafe` only used internally with whitelist values.

## 23.7 XSS
- User content sanitized on display.
- File upload mime checks; `.svg` treated as image not script.

## 23.8 CSRF
- POST/PATCH/DELETE require session cookie + same-origin via SameSite=Lax.
- API routes don't accept cross-origin without CORS allow-list.

## 23.9 Secrets Management
- `INTERNAL_SECRET`, `NEXTAUTH_SECRET`, `DATABASE_URL`, `SMTP_PASS` only in env, never in repo.
- Pre-commit hook blocks committed secrets.

## 23.10 Audit Logging
- Every privileged action (role change, user delete, permission grant) logged with actor + target + timestamp.

## 23.11 Tenant Data Isolation
- Force-test: log in as Org A, attempt to GET/PUT/DELETE Org B resource → 404.
- Test: bulk-import CSV with `orgId` column → ignored server-side.

## 23.12 Rate Limiting
- Login: 5 attempts / 5 min.
- Bulk API (import, mass-update): per-user concurrency cap.
- Comment/notification spam: rate-cap per user.

---

# 24. Accessibility

## 24.1 Keyboard Navigation
- Tab order logical on every page.
- Focus visible (focus ring) on interactive elements.
- Modals trap focus; Esc closes.
- Skip-to-content link.

## 24.2 Screen Reader
- All buttons have aria-labels.
- Status pills announce "in progress / done".
- Modals announce as "dialog".
- Live regions for toast notifications.

## 24.3 Color Contrast
- WCAG AA on all text + interactive elements.
- Accent color picker warns on low contrast.

## 24.4 Reduced Motion
- Respect `prefers-reduced-motion` → animations dampened.

## 24.5 Resizable Text
- Text scales up to 200% without layout break.

## 24.6 Form Errors
- Errors announced; tied via aria-describedby.

---

# 25. Performance

## 25.1 Initial Page Load (Cold)
- TTFB <500ms.
- LCP <2.5s.
- FCP <1.5s.

## 25.2 Initial Page Load (Warm)
- Cached → <800ms.

## 25.3 API Latency (Median)
- Auth: <300ms.
- List queries: <500ms (under 1k rows).
- Single-issue fetch: <200ms.
- Bulk operations: background job >2s.

## 25.4 Large Data Sets
- Board with 1000+ cards → virtualized; 60fps scroll.
- List with 10k rows → server-side pagination.
- Sprint with 100+ issues → drag-drop stays smooth.

## 25.5 Network Resilience
- 3G simulation → page still usable.
- Offline → cached views readable; writes queued (if PWA enabled).

## 25.6 Database
- Indexes on `orgId`, `projectId`, `assigneeId`, `sprintId`, `(orgId, status)`.
- N+1 prevention via Prisma `select` / `include`.

---

# 26. Browser / Device Compatibility

## 26.1 Browsers
- Chrome, Firefox, Safari, Edge (last 2 versions).
- No critical regressions across them.

## 26.2 Mobile / Responsive
- Min viewport 360px.
- Sidebar auto-collapses on narrow viewport.
- Touch targets ≥44×44px.

## 26.3 OS-Level
- macOS, Windows, Linux: identical desktop behavior.
- iOS, Android: mobile web variant works.

---

# 27. Internationalization (Future-readiness)

## 27.1 Date / Time
- Server stores UTC; client renders in user's TZ.
- Date pickers respect locale formats.

## 27.2 Numbers / Currency
- Locale-aware formatting.

## 27.3 Strings (placeholder)
- No hardcoded English in shared components — i18n-ready.

---

# 28. Data Integrity

## 28.1 Transactional Operations
- Project create + seed defaults wrap in transaction → atomic.
- Bulk import → batched transactions.
- Move issue between projects → atomic with comments/history/attachments.

## 28.2 Soft Deletes
- All deletes set `isDeleted: true` (not hard delete).
- Retention policy: 30 days by default.
- Trash UI for admins.

## 28.3 Backups
- Neon point-in-time recovery enabled.
- Manual backups via `pg_dump` periodically.

## 28.4 Foreign Key Integrity
- All FKs enforced; cascade or nullify defined.
- Orphan rows auto-cleaned by cron.

## 28.5 Concurrency
- Optimistic locking via `updatedAt` on critical entities.
- Conflict resolution: last-write-wins + diff UI.

---

# 29. Observability

## 29.1 Logs
- Every request logged with userId + orgId + path.
- Errors with stack traces.
- No PII / secrets in logs.

## 29.2 Metrics
- Request latency p50/p95/p99.
- Error rate per endpoint.
- Background job duration + failures.

## 29.3 Alerts
- 500 error spike → page on-call.
- Cron job failure → email platform team.
- DB connection saturation → alert.

---

# 30. Operational Resilience

## 30.1 Deploy Rollout
- Zero-downtime deploys via Vercel.
- Env var changes require redeploy → docs reflect this.

## 30.2 Schema Migration
- `prisma db push` for additive changes.
- Drift between code and DB detected by health check.

## 30.3 Rollback
- Vercel "Promote previous deployment" → instant rollback.

## 30.4 Disaster Recovery
- Neon point-in-time restore tested quarterly.
- Backup verification cron job.

---

# 31. Boundary / Limit Tests (per field, per resource)

## 31.1 String Field Limits
- Title (50 char): exactly 50 → accepted; 51 → trimmed or blocked.
- Description (10k char): at limit → accepted; over → blocked or split.
- Comment body (10k char): same as description.
- Project key (2–10 char): 1, 11 → blocked; 2, 10 → accepted; uppercase + numbers only.
- Project name (1–80 char): empty → blocked; 81 → blocked.
- Org slug (1–50 char): regex `[a-z0-9-]+`; uppercase/spaces/special → blocked.
- Email (RFC 5321 max 254 char): over → blocked; missing `@` → blocked.
- Password (8–128 char): 7 → blocked; 129 → blocked; no number/symbol/upper → strength warning.

## 31.2 Numeric Field Limits
- Story points (0–999): negative → blocked; >999 → blocked or warning; non-integer → 0.5 allowed if Fibonacci+halves enabled.
- Original estimate hours (0–9999): negative → blocked.
- Sprint duration: 1–90 days; 0 → blocked; 91 → blocked.
- File size (1B–25MB per file, 100MB per issue): edge sizes accepted; over → blocked.
- Pagination `limit` (1–100): 0 → 1; 101 → 100.
- Bulk import row count (1–10000): empty → blocked; 10001 → background job.

## 31.3 Date Field Limits
- Start/due dates: year 1970–2100 reasonable bounds; before 1970 or after 2100 → warning.
- Sprint dates: end before start → blocked.
- Birthdays / past dates where future required → blocked.

## 31.4 Array / Collection Limits
- Labels per issue: 0–20; over → blocked.
- Assignees per issue: currently 1 (single-assignee); attempt to set array → 400.
- Watchers per issue: unbounded but rate-limited adds.
- Project members: unbounded; pagination kicks in at 100.
- Sprint issue count: unbounded; warning at 200.

## 31.5 ID / Key Limits
- Issue key sequence (`WEB-1` … `WEB-999999`): rollover handling at 1M+.
- Cuid IDs: collision rate effectively zero; uniqueness enforced via DB constraint.

---

# 32. State Transition Tests

## 32.1 Issue Status Transitions
- For each status × status pair: from → to.
  - Allowed: any → any (no workflow restriction in default config).
  - With workflow lock (future feature): only specific transitions, e.g. `In Review → Done` requires `update` perm.
- Closed → Reopen → preserve history.
- Bulk transition 100 issues → all succeed or roll back atomically.

## 32.2 Sprint State Machine
- States: `PLANNED` → `ACTIVE` → `COMPLETED` (and `CANCELLED` if implemented).
- Transitions:
  - `PLANNED → ACTIVE` via Start.
  - `ACTIVE → COMPLETED` via Complete.
  - `COMPLETED → ACTIVE` blocked (must create new sprint).
  - `PLANNED → COMPLETED` allowed only if 0 issues.
- Concurrent state changes → DB enforces single transition.

## 32.3 Project State Machine
- `active → archived → restored → active`.
- `archived` projects readonly for non-admins; admin can edit settings.
- `deleted` (soft) → recoverable for 30 days; admin can purge.

## 32.4 User / Membership State
- `active → inactive → reactivated`.
- `pending invite → accepted → active`.
- `accepted → revoked → re-invited`.

## 32.5 Comment Lifecycle
- `created → edited → deleted (soft) → purged`.
- Reactions persist across edits.

---

# 33. Race Conditions / Concurrency

## 33.1 Concurrent Issue Updates
- Two users edit same field → last write wins; older write rejected with conflict toast if optimistic-locking enabled.
- Two users delete same issue → second gets idempotent success.
- Two users assign different users → both succeed, last value persists; history records both.

## 33.2 Concurrent Sprint Operations
- Two users drag issue into different sprints → last drop wins.
- Two users click Start Sprint simultaneously → DB constraint allows one; other sees error.
- Two users complete sprint at same moment → second sees "already completed".

## 33.3 Concurrent Permission Edits
- Two admins edit same role permissions → last save wins, audit logs both.
- One admin removes another's admin role mid-action → next API call returns 403.

## 33.4 Concurrent Bulk Operations
- Two users bulk-delete overlapping sets → soft-delete idempotent.
- One user bulk-imports while another adds single issue → no key collision (DB sequence handles).

## 33.5 Concurrent User Invitations
- Same email invited by two admins → second sees "already invited".
- User accepts invite while admin is editing their role → role applies on next API call.

## 33.6 Read-Your-Writes Consistency
- Save a comment → it appears in subsequent fetch.
- Update status → board reflects in real-time poll within 5s.

## 33.7 Cache Invalidation
- Permission change → user's cached permission set invalidates within 60s.
- Project list cache invalidates on project create/delete.

---

# 34. Timezone / DST / Locale Tests

## 34.1 Server Stores UTC
- All timestamps in DB are UTC; client renders in user's timezone.

## 34.2 Cross-Timezone Display
- User A in PST creates issue at 11pm Mon → User B in IST sees Tue 12:30pm.
- Date-only fields (startDate, dueDate) don't shift across timezones.

## 34.3 DST Transitions
- Sprint dates spanning DST jump → no shift in sprint duration.
- Time entries logged on DST day → 23/25h day handled correctly.

## 34.4 Cron Timezones
- Daily digest cron at user's local 8am → respects per-user TZ.
- Overdue check at midnight UTC → consistent globally.

## 34.5 Locale Formatting
- Dates: `MM/DD/YYYY` (US) vs `DD/MM/YYYY` (EU) vs `YYYY-MM-DD` (ISO).
- Numbers: `1,000.5` vs `1.000,5`.
- Currency: prefix `$` vs suffix `€`.

## 34.6 RTL Languages (future)
- Arabic/Hebrew → layout mirrors; text aligns right.

## 34.7 Non-ASCII Input
- Title with emoji, Devanagari, Cyrillic, Chinese → stored and rendered correctly.
- Search across non-ASCII titles → matches with normalized comparison.

---

# 35. Browser Navigation Tests

## 35.1 Back / Forward Buttons
- Back from issue detail → returns to list with scroll position preserved.
- Forward after back → restores issue detail.
- Back after delete → "Issue deleted" placeholder, no crash.

## 35.2 Refresh
- Refresh on dashboard → state preserved (active filters, scroll).
- Refresh during issue edit → "Unsaved changes" prompt if dirty.
- Refresh after server-side delete → graceful 404.

## 35.3 Deep Linking / Bookmarking
- Bookmark issue URL → loads directly with auth.
- Bookmark filtered list URL → filters applied on load.
- Bookmark deep-link to sprint board → opens that sprint context.

## 35.4 URL State
- Filter params in URL → shareable links work.
- Sort param in URL → reflected in view.
- Multi-tab: open same URL twice → both work independently.

## 35.5 Browser Crash Recovery
- Browser crashes during issue edit → on restart, unsaved draft restored from localStorage.
- Crashes mid-upload → file resumable on restart.

## 35.6 Multi-Tab Behavior
- Edit in tab A → tab B sees change within 5s.
- Logout from tab A → all tabs redirect to login within 5min.
- Org switch in tab A → tab B updates context on next nav.

---

# 36. Copy / Paste / Drag-Drop Tests

## 36.1 Paste From Word / Google Docs / Notion
- Pasted formatting preserved where possible; unsupported elements stripped to safe HTML.
- Images in pasted content → uploaded as attachments inline.

## 36.2 Paste From Email
- Outlook/Gmail formatting → cleaned, no inline tracker images.

## 36.3 Paste From Spreadsheet
- Pasted table into description → rendered as markdown table.

## 36.4 Paste Plain Text
- Markdown shortcuts apply (`**bold**`, `# heading`).

## 36.5 Drag File From Desktop
- Drag PNG → uploads as attachment, embedded in description.

## 36.6 Drag Issue Card
- Drag from board → drop on another column.
- Drag across browser windows → blocked (not supported).

## 36.7 Drag Reorder Lists
- Drag sprint item → reorder persists.
- Drag during slow network → optimistic UI; rollback on failure.

---

# 37. Print / Export Tests

## 37.1 Print Issue
- Browser print → clean layout without sidebar/header.
- All comments visible; no truncation.

## 37.2 Export Issues to CSV
- Filter set, click export → CSV with selected rows.
- Special chars escaped; UTF-8 BOM for Excel.
- Formula injection: `=CMD()` → escaped to `'=CMD()`.

## 37.3 Export Report to CSV / PDF
- Status report → CSV columns match UI.
- Time report → PDF print preview matches.

## 37.4 Bulk Export
- 10k+ rows → background job; email link when ready.

---

# 38. Notification Event Catalog (per event type)

For each event type below, test: in-app notification fires; email sent (if user has email pref on); deep link correct; mention parsing.

1. **Issue Created** — assignee + watchers notified.
2. **Issue Assigned** — new assignee notified; previous assignee notified of removal.
3. **Issue Status Changed** — watchers + reporter notified.
4. **Issue Priority Changed** — assignee notified.
5. **Issue Due Date Changed** — assignee notified.
6. **Issue Reporter Changed** — old + new reporter notified.
7. **Issue Sprint Changed** — assignee notified.
8. **Issue Deleted** — watchers notified.
9. **Issue Linked** — both issue's watchers.
10. **Issue Moved Project** — watchers notified.
11. **Comment Created** — watchers notified.
12. **Comment Edited** — mentioned users only if newly mentioned.
13. **Comment Deleted** — no notification (silent).
14. **Mention in Comment** — mentioned user gets direct notification.
15. **Mention in Description** — mentioned user notified.
16. **Reaction Added** — comment author notified (optional pref).
17. **Attachment Added** — watchers notified.
18. **Subtask Added** — parent assignee notified.
19. **Subtask Completed** — parent assignee notified.
20. **Sprint Started** — all project members notified.
21. **Sprint Completed** — all project members notified.
22. **Project Member Added** — added user notified.
23. **Project Member Removed** — removed user notified.
24. **Role Changed** — affected user notified.
25. **Watcher Added** — only if added by someone else.
26. **Time Entry Added** — manager (if configured) notified.
27. **Doc Created** — project members notified (configurable).
28. **Doc Updated** — watchers notified.
29. **Permission Changed** — user notified next login.
30. **Org Invite Sent** — invited user emailed.
31. **Org Invite Accepted** — inviter notified.
32. **Account Deactivated** — affected user emailed.
33. **Account Reactivated** — affected user emailed.
34. **Password Reset Requested** — email + audit log.
35. **Login From New Device** — security email (if enabled).
36. **Overdue Task Alert** — daily cron, assignee + lead.
37. **Daily Digest** — bundled summary.
38. **Weekly Digest** — bundled summary.

For each, test:
- **Best:** in-app + email arrive; preference respected; deep link works.
- **Worst:** SMTP down → queued; user opted out → in-app only; deactivated user → no email.

---

# 39. Account Recovery Flows

## 39.1 Forgot Password
- **Best:** Email + "Send reset" → email with single-use token (15min TTL).
- **Worst:**
  - Email not in system → same success message (no enumeration leak).
  - Token expired → "Request new" CTA.
  - Token used twice → second blocked + audit.
  - Reset to weak password → blocked.

## 39.2 Locked-Out Account
- **Best:** After 5 failed logins → 15-min cooldown.
- **Worst:** Lockout while admin needs access → admin-recovery email.

## 39.3 Email Change
- **Best:** New email → verification link sent; old email notified.
- **Worst:**
  - New email already in use → blocked.
  - Verification expired → request new.

## 39.4 Account Deletion
- **Best:** User requests deletion → 30-day soft delete; data preserved for legal.
- **Worst:**
  - User restores within 30 days → fully restored.
  - Hard delete after 30 days → data purged per GDPR.

## 39.5 SSO Account Linking
- **Best:** Existing email/password user → links Google → both methods work.
- **Worst:** Linked Google account email mismatch → confirmation flow.

---

# 40. API Contract Tests (per endpoint)

For every `/api/**/route.ts`, verify:

## 40.1 Method Negotiation
- GET → returns data; HEAD → same as GET without body; OPTIONS → CORS headers.
- POST without body → 400.
- Wrong method (e.g. POST on GET-only) → 405 Method Not Allowed.

## 40.2 Auth Header
- No cookie → 401.
- Invalid cookie → 401.
- Valid cookie but no org → 403 "No active membership".

## 40.3 Input Validation
- Missing required field → 400 with field name.
- Wrong type → 400 with type info.
- Extra unknown fields → ignored or 400 (depends on Zod strict mode).
- Body over 10MB (non-upload) → 413 Payload Too Large.

## 40.4 Response Shape
- Success: `{ success: true, data: ... }`.
- Error: `{ success: false, error: "..." }`.
- Never raw HTML, never stack trace in prod.

## 40.5 Status Codes
- 200 on GET, 201 on POST create, 204 on DELETE, 400 on validation, 401 on auth, 403 on perm, 404 on not found, 409 on conflict, 422 on semantic error, 500 on server error.

## 40.6 Idempotency
- DELETE same resource twice → 204 both times (or 404 second).
- POST with idempotency key → no duplicate.

## 40.7 Pagination
- `?limit=20&cursor=abc` → next batch; `nextCursor` in response.
- Cursor tampered → 400 "Invalid cursor".

## 40.8 Caching Headers
- Static data → `Cache-Control: public, max-age=N`.
- User-specific → `Cache-Control: private, no-store`.

---

# 41. OWASP Per-Endpoint Tests

For every authenticated mutation endpoint, run OWASP Top 10 checks:

## 41.1 A01 Broken Access Control
- IDOR: swap `/issues/<my-id>` for someone else's ID → 404.
- Path traversal (`/api/../etc/passwd`) → 400.
- Force-browse to admin endpoint as non-admin → 403.

## 41.2 A02 Cryptographic Failures
- Cookies httpOnly + Secure.
- No JWT in URL.
- Passwords hashed (bcrypt 10+).

## 41.3 A03 Injection
- SQL injection in any text field → escaped via Prisma.
- NoSQL injection → N/A (Postgres).
- Command injection in search → escaped.

## 41.4 A04 Insecure Design
- Rate limiting on login.
- No predictable IDs (cuid not int).

## 41.5 A05 Security Misconfiguration
- No verbose errors in prod.
- Headers: HSTS, X-Frame-Options, CSP.
- No `Server:` header leaking framework.

## 41.6 A06 Vulnerable Components
- `npm audit` clean.
- Dependabot enabled.

## 41.7 A07 Identification & Auth
- Session timeout 30 days max.
- Re-auth for sensitive actions (password change, email change).

## 41.8 A08 Software & Data Integrity
- Signed JWTs.
- No deserialization of untrusted data.

## 41.9 A09 Logging & Monitoring
- All auth events logged.
- Failed login attempts tracked.

## 41.10 A10 SSRF
- Any URL-fetch endpoint validates against allowlist.
- Jira import → only Atlassian-hosted domains.

---

# 42. Database / Migration Tests

## 42.1 Schema Drift Detection
- CI runs `prisma migrate diff` between dev DB and migrations folder → must be empty.

## 42.2 Migration Idempotency
- Run `prisma db push` twice in a row → second is no-op.
- Run migration twice → second errors gracefully (Prisma's migration table prevents).

## 42.3 Data Backfill
- Adding a non-null column with default → existing rows get default; rollback safe.
- Renaming a column → migration handles in two steps (add new, copy, remove old).

## 42.4 Foreign Key Cascades
- Delete project → cascade deletes sprints, statuses, types, members, issues, comments, attachments.
- Delete user → memberships removed; issues' assigneeId nulled (not cascade-deleted).

## 42.5 Index Performance
- Issue list query against 100k rows → uses index on `(orgId, projectId, status)`.
- Search `LIKE` queries → uses pg_trgm index or full-text.

## 42.6 Vacuum / Bloat
- Postgres autovacuum tuned for high-update tables (QtIssue, QtIssueHistory).

---

# 43. Webhook / Integration Tests (future)

## 43.1 Outbound Webhooks
- On issue create → POST to configured URL with payload.
- Webhook fails 5xx → retry with backoff.
- 3 failures in 24h → webhook disabled, admin notified.

## 43.2 Webhook Signature
- HMAC signature in header; receiver verifies.

## 43.3 Inbound API
- API key auth.
- Per-key rate limit.
- Scoped permissions per key.

---

# 44. Mobile-Specific Tests

## 44.1 Touch Gestures
- Tap, long-press, swipe — all work on issue cards.
- Pinch-zoom on docs → enabled.

## 44.2 Responsive Layout
- Phone portrait: sidebar hidden, hamburger menu.
- Tablet landscape: sidebar visible, content scaled.

## 44.3 Mobile Performance
- 3G simulated → page usable; bundle <500KB on critical path.

## 44.4 Offline (PWA, if enabled)
- Cached pages readable.
- Writes queued; sync on reconnect.

## 44.5 Mobile Browsers
- iOS Safari, Chrome Android, Samsung Internet → tested.

---

# 45. Email / SMTP Edge Cases

## 45.1 Email Delivery
- Valid email → delivered.
- Bounced (hard) → user flagged, no further attempts.
- Soft bounce → retry 3× over 24h.
- Marked as spam → admin notified.

## 45.2 Email Content
- Plain-text fallback for HTML emails.
- Unsubscribe link in footer of every digest.
- Sender domain SPF/DKIM/DMARC configured.

## 45.3 Email Template Localization
- Each template available in supported locales.

## 45.4 High-Volume Send
- Mass invite (100 users) → batched, throttled.
- SMTP daily cap reached → queued for next window.

---

# 46. Search Edge Cases

## 46.1 Search Operators
- `key:WEB-42` → exact key match.
- `assignee:me` → my issues.
- `status:done` → status filter.
- Combined: `assignee:me status:open` → AND logic.

## 46.2 Special Characters
- `"exact phrase"` → exact match.
- `bug AND login` → boolean.
- Empty query → recently viewed.

## 46.3 Case Sensitivity
- Lowercase / uppercase / mixed → same results.

## 46.4 Stemming / Fuzziness
- "running" matches "run" — if enabled.

## 46.5 Long Queries
- 500-char query → trimmed.

---

# 47. Audit Log Tests

## 47.1 Coverage
- Login, logout, permission change, role change, user invite, user delete, project create, project delete, issue delete, sprint complete — all logged.

## 47.2 Query
- Admin can filter by actor, action, date range.
- Export audit log → CSV / JSON.

## 47.3 Retention
- Default 1 year; configurable.

## 47.4 Tamper-Resistance
- Append-only; admins can't edit.

## 47.5 Performance
- 1M+ audit rows → indexed by (orgId, createdAt); query <1s.

---

# 48. Impersonation Tests

## 48.1 Start Impersonation
- Platform admin clicks "Impersonate user" → enters user's session.
- Banner visible: "Impersonating user@x.com".

## 48.2 During Impersonation
- All actions logged with both real + impersonated user.
- Cannot change password / 2FA / billing.

## 48.3 End Impersonation
- Click "Stop" → revert to admin session.

## 48.4 Edge Cases
- Impersonate platform admin → blocked.
- Impersonate yourself → no-op.
- Session expires mid-impersonation → both sessions cleared.

---

# 49. Quikit Platform Integration Tests

## 49.1 Cross-App Data Consistency
- User created in admin → visible in QuikTrack within 30s.
- User deactivated in admin → logged out of QuikTrack within 5min.

## 49.2 App Access Provisioning
- Grant QuikTrack to user via admin portal → user sees QuikTrack tile in launcher.

## 49.3 Launcher Tile Click
- Click → POST `/api/launch-token` → mints JWT → redirects to `quiktrack/auth-handoff` → session set.

## 49.4 Deep-Link Auto-Launch
- `launcher/apps?handoff=quiktrack&to=/board` → ends user at quiktrack board with session.

## 49.5 Cross-Domain Cookie
- Cookie isolation between `quikit-quiktrack.vercel.app` and `quikit-launcher-sigma.vercel.app` → each has own session.

## 49.6 Org Switching
- User has multiple orgs → switcher in header → switching changes orgId in session.

---

# 50. Disaster Scenarios

## 50.1 Neon DB Outage
- Read endpoints → 503 with retry-after; UI shows banner.
- Write endpoints → queued or failed gracefully.

## 50.2 Vercel Deployment Rollback
- Promote previous deployment → traffic shifts instantly.
- Active sessions persist; in-flight requests retry.

## 50.3 S3 Outage
- Attachments inaccessible → graceful fallback.
- New uploads queued.

## 50.4 SMTP Outage
- Emails queued; users still see in-app notifications.
- Backlog processed on recovery.

## 50.5 Redis Outage (Session Store)
- JWT-only validation still works (Redis is for revocation).
- Soft revocation degrades to TTL only.

## 50.6 CDN Outage
- Vercel edge falls back to origin.

## 50.7 DNS Outage
- Users on cached DNS unaffected for a few minutes.

---

# 51. Compliance & Privacy

## 51.1 GDPR
- User can request data export (JSON).
- User can request deletion → 30-day soft delete, then purge.
- Audit trail of consent.

## 51.2 SOC 2
- Audit logs append-only.
- Access reviews quarterly.

## 51.3 HIPAA (if applicable)
- BAA on infrastructure.
- PHI encrypted at rest and in transit.

## 51.4 Data Residency
- Org admin can pick region (US, EU) — future.

## 51.5 Privacy Policy / ToS
- Linked from footer.
- User must accept on first login.

---

# 52. Documentation & Onboarding

## 52.1 In-App Help
- Tooltips on complex fields.
- Help panel reachable from every page.
- Tour restartable.

## 52.2 Empty States
- Every list has a meaningful empty state with CTA.

## 52.3 Error Messages
- User-facing errors are clear, actionable.
- No "Internal Server Error" generic message.

## 52.4 First-Time Experience
- New user sees onboarding checklist (future feature).

---

# 53. Performance Edge Cases (Stress)

## 53.1 Burst Traffic
- 10× normal load → auto-scales; no 5xx surge.

## 53.2 Slow DB Queries
- Query >5s → timeout + fallback.

## 53.3 Long-Polling Connections
- 1000 concurrent → server handles via edge.

## 53.4 Background Job Saturation
- Queue depth >10k → autoscale workers or alert.

## 53.5 Memory Leak Detection
- Server runs for 7 days → memory stable.
- Client SPA → no memory growth over 8h session.

## 53.6 Bundle Size Regression
- Next build bundle <500KB JS on critical path.
- Lighthouse score >90.

---

# 54. Visual Regression Tests

## 54.1 Pixel Diffs
- Per-page snapshot before/after release.
- Diff >2% triggers manual review.

## 54.2 Dark Mode Visual
- All pages snapshot in dark mode.

## 54.3 Print View
- Snapshot of print preview for issue, doc, report.

## 54.4 Responsive Snapshots
- 360px, 768px, 1024px, 1440px widths.

---

# 55. Localization / Translation Tests

## 55.1 String Externalization
- No hardcoded English in shared components.
- All user-facing strings via i18n key.

## 55.2 Locale Switch
- Change locale → UI strings, dates, numbers all update.

## 55.3 Plural Rules
- 1 item vs 2 items → correct grammar per locale.

## 55.4 Missing Translation
- Fallback to English if key missing in locale.

## 55.5 Text Expansion
- German strings often 30% longer → layout doesn't break.

---

# 56. Customer Support / Diagnostic Tests

## 56.1 Customer Reproduces Bug
- Support can request "diagnostic snapshot" → user's recent actions, env, browser.
- No PII included beyond what support needs.

## 56.2 Session Replay (if enabled)
- Recording respects privacy: masks form inputs, passwords.

## 56.3 Error Boundary
- React errors caught; shown with "Report this" CTA.
- Error report includes stack, URL, user (optional).

---

# 57. Feature Flag Tests (if used)

## 57.1 Flag On / Off
- Enable flag → feature visible; disable → hidden.
- Cache invalidates within 60s.

## 57.2 Per-Org / Per-User Flags
- Specific org sees beta; others don't.

## 57.3 Gradual Rollout
- 10% of users → measure; ramp to 100%.

## 57.4 Kill Switch
- Critical bug → flip flag → all users back to old version.

---

# 58. Multi-Tenancy Edge Cases

## 58.1 Tenant Provisioning
- New org → seed default app roles, default project roles when first project created.

## 58.2 Tenant Deletion
- Org delete → cascade across all schemas (auth, quikit, app_quiktrack).
- Soft-delete with 90-day retention.

## 58.3 Cross-Tenant Search
- Super admin can search across tenants (with audit log).
- Regular admin scoped to own tenant only.

## 58.4 Tenant-Level Limits
- Issues per org (paid tiers); over → block creation.
- Storage cap on attachments.

## 58.5 Tenant Renaming
- Org slug change → URL redirects from old slug for 30 days.

---

# 59. Subtle UX Tests

## 59.1 Loading Indicators
- Every action with >300ms latency shows a spinner/skeleton.
- Skeleton matches eventual layout (no flash of layout shift).

## 59.2 Optimistic UI
- Drag-drop, star, react, watch all update instantly; rollback on server reject.

## 59.3 Confirm Dialogs
- Destructive actions require explicit confirmation.
- "Are you sure?" never alone — always with context (what + consequences).

## 59.4 Undo
- Delete → toast with Undo for 10s.

## 59.5 Tooltip Latency
- Hover ≥500ms → tooltip appears.
- Move away → tooltip hides immediately.

## 59.6 Focus Management
- Open modal → focus first input.
- Close modal → focus returns to trigger.

## 59.7 Keyboard Shortcut Conflicts
- App shortcuts don't conflict with browser/OS (e.g., Ctrl+S → handled gracefully).

---

# 60. Final Catch-All / Smoke

## 60.1 Smoke Tests (run on every deploy)
- Login → load home → view a project → view an issue → log out.
- All HTTP 2xx, no console errors, no 5xx in monitoring.

## 60.2 Canary Deploy
- Deploy to 5% traffic → monitor error rate vs baseline → promote or rollback.

## 60.3 Health Endpoint (`/api/health`)
- Returns 200 with DB connection check.
- Used by uptime monitor.

## 60.4 Status Page
- Public status page reflects current uptime.

## 60.5 SLO Tracking
- 99.9% uptime target.
- Error budget tracked per quarter.

---

*Use this exhaustive matrix as the regression sheet for every release. Pair best-case scenarios with E2E happy-path tests in Playwright; pair worst-case + security + perf scenarios with Vitest unit + dedicated security tests. Cover cross-cutting sections (23–30, 41, 50–60) at least once per major version.*
