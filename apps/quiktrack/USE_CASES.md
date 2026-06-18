# QuikTrack — Use Cases

End-to-end user journeys organized by **persona** and by **workflow**. Use this as the product narrative document — for sales decks, training, customer onboarding, and engineering acceptance.

---

## Personas

| Persona | Role | Goals |
|---|---|---|
| **Priya** | Project Manager | Plan sprints, track scope, report status to leadership |
| **Arjun** | Software Developer | Pick up work, log time, ship code, stay focused |
| **Kavya** | QA Engineer | Verify bugs, run test cycles, file regression issues |
| **Rohan** | Designer / Stakeholder | Review designs, leave feedback, follow specific features |
| **Ashwin** | Org Admin / Lead | Set up the org, manage users, enforce permissions |
| **External Auditor** | Read-only Guest | View progress without making changes |

---

## 🎯 Workflow 1 — Setting Up a New Project

**Actors:** Ashwin (Org Admin), Priya (Project Manager)

1. **Ashwin** creates the QuikIT organization and invites Priya as an admin via email.
2. **Priya** accepts the invite, sets her password, and lands on the launcher.
3. **Priya** opens QuikTrack and creates a new project space called **"Customer Web Portal"** (key `WEB`).
4. The project auto-seeds **3 starter roles** (Space Admin, Contributor, Viewer), **5 statuses** (Backlog → Done), and **4 issue types** (Story, Task, Bug, Epic).
5. **Priya** invites 6 teammates from the team picker — assigns Arjun and 2 others as Developers, Kavya as QA, Rohan as Viewer.
6. **Priya** customizes the workflow — adds a **"Blocked"** status to the In Progress category.
7. **Priya** sets project notifications: email on status change to Done.

**Success:** Project is live, fully configured, and ready for sprint planning in under 10 minutes.

---

## 🏃 Workflow 2 — Running a Two-Week Sprint

**Actors:** Priya (PM), Arjun, Kavya, Rohan

### Sprint Planning (Day 0)
1. **Priya** opens the **Backlog view**, ranks the top 30 stories.
2. **Priya** creates **Sprint 12** with a 2-week date range and a goal: *"Ship customer onboarding redesign."*
3. **Priya** drags 18 issues into the sprint, totaling 42 story points.
4. **Priya** clicks **Start Sprint** — sprint goes ACTIVE, board switches to sprint mode.

### Daily Execution (Days 1–10)
5. **Arjun** opens the **Kanban board**, picks the top priority issue, moves it from `To Do` → `In Progress`.
6. **Arjun** logs **2.5h** against that issue via the **Timesheet grid**.
7. **Arjun** finds a blocker, adds a **comment with `@Priya`** — Priya gets in-app + email notification.
8. **Priya** changes the issue priority to `URGENT` from the quick-edit modal.
9. **Arjun** completes the work, moves the card to `In Review`, adds the **"reviewer"** label.
10. **Kavya** picks up the card, finds a regression, **creates a Bug** linked to the original story with a "blocks" relationship.
11. **Arjun** fixes the bug, moves both cards to `Done`.

### Mid-Sprint Check-in (Day 7)
12. **Priya** opens the **Resource report** to see workload — Arjun is at 30h logged, Kavya at 12h.
13. **Priya** rebalances by reassigning two stories from Arjun to a less-loaded teammate.

### Sprint Close (Day 14)
14. **Priya** clicks **Complete Sprint** — 16 of 18 issues are `Done`. Modal asks what to do with the 2 incomplete issues; **Priya** chooses *"Move to backlog"*.
15. Sprint archives. **Priya** opens **Sprint Completion Metrics** to see velocity trend.
16. **Priya** shares the Status Report in Slack as a screenshot.

**Success:** Sprint completed with full audit trail, velocity tracked, team-wide visibility throughout.

---

## 🐛 Workflow 3 — Reporting and Fixing a Production Bug

**Actors:** Rohan (Stakeholder), Kavya (QA), Arjun (Dev), Priya (PM)

1. **Rohan** sees a bug in production, opens QuikTrack from the launcher.
2. **Rohan** clicks **"+ Create"**, picks **Bug**, fills in title `"Login button broken on Safari"`, drops in a screenshot.
3. **Rohan** uses **@Kavya** mention in the description — Kavya gets notified.
4. **Kavya** opens the bug, reproduces it, adds a comment with steps to reproduce, sets priority to `HIGH`.
5. **Kavya** links the bug to a previous fix that may have introduced it (`relates to`).
6. **Priya** sees the new urgent bug on her dashboard, assigns it to **Arjun**.
7. **Arjun** marks issue **In Progress**, fixes it locally, logs 1h.
8. **Arjun** moves to **In Review**, comments with the PR link.
9. **Kavya** verifies the fix on staging, marks `Done`.
10. The fix appears in the next sprint's Done column; Rohan, watching the issue, gets an email when it closes.

**Success:** Bug went from report to fix in under a day with full traceability.

---

## 🚀 Workflow 4 — Onboarding a New Hire

**Actors:** Ashwin (Org Admin), new developer Maya

1. **Ashwin** opens **User Management** → **Invite User**, picks role `Developer`, sends invite to Maya.
2. **Maya** clicks the email link, sets her password, lands on the launcher.
3. **Maya** opens QuikTrack — the **Kan onboarding tour** runs, walking her through Board, Backlog, Search, and Notifications in 60 seconds.
4. **Maya** is auto-added to **Sprint 13** as a Developer with the seeded default role.
5. **Maya** picks her first task, assigns it to herself, moves it from `To Do` → `In Progress`.
6. After her first commit, **Maya** logs 1h via the inline time entry on the issue.

**Success:** New hire is productive on Day 1 with zero hand-holding.

---

## 📦 Workflow 5 — Migrating From Jira

**Actors:** Ashwin (Org Admin)

1. **Ashwin** opens **Settings → Migration → Jira**.
2. Connects via API token, picks the **"WEB"** Jira project.
3. **Field mapping screen** appears — maps Jira's `Story Points` → QuikTrack's `storyPoints`, `Fix Version` → custom field, etc.
4. Migration runs. **Ashwin** can monitor progress, see incremental row counts.
5. On completion, all issues, comments, history, and attachments are in QuikTrack with original keys preserved as `WEB-*`.
6. **Ashwin** invites the team — they sign in and see their familiar work, now with sprint planning + dashboards Jira didn't have.

**Success:** Migration finishes overnight; team picks up where they left off the next morning.

---

## 🔍 Workflow 6 — Cross-Project Search and Reporting

**Actors:** Ashwin (Org Admin / Executive Reporter)

1. **Ashwin** presses `/` from any screen → global search bar.
2. Types `"login"` — sees matching issues across 5 projects.
3. Clicks **Saved Filters → "All Urgent Open Bugs"** — pre-built filter applied across all projects.
4. Switches to **Grouped Board** view, groups by project — sees urgent bug distribution.
5. Opens **Resource Report** with filter `last 30 days` — sees which engineers are most loaded.
6. Exports the report to CSV for finance.

**Success:** Executive view of the entire engineering org from one screen.

---

## 📄 Workflow 7 — Building Project Documentation

**Actors:** Priya (PM)

1. **Priya** opens **Docs** tab inside the **WEB** project.
2. Creates a new page: *"Sprint 12 Goals & RFCs"*.
3. Writes content in rich-text editor — pastes a screenshot from clipboard, embeds a diagram.
4. Creates nested sub-pages for each major story.
5. Links the doc from a sprint goal field.
6. Team can comment on the doc (planned), follow updates, see version history.

**Success:** All project context lives next to issues, not in scattered Notion/Confluence pages.

---

## 🛡️ Workflow 8 — Role-Based Access Control

**Actors:** Ashwin (Admin), External Auditor

1. **Ashwin** creates a new custom role: **"Auditor"** at the org level.
2. Grants only `view` permissions across all resources.
3. Uses **field-level access** to hide sensitive fields like `storyPoints` and `estimate`.
4. Uses **navigation gating** to hide the Reports section.
5. Invites the auditor email — they receive an SSO invite.
6. **Auditor** logs in, sees all projects in read-only mode, cannot edit anything, cannot see hidden fields.

**Success:** External party gets exactly the access they need — no more, no less.

---

## ⏱️ Workflow 9 — Time Tracking & Capacity Planning

**Actors:** Priya (PM), Arjun (Dev)

1. **Arjun** logs time daily via the **Timesheet Grid** — 2h here, 4h there, across multiple issues.
2. End of week: **Arjun** reviews his **Weekly Summary** — 38h total, broken down by project.
3. **Priya** opens **Resource Report** → filters last week → sees team utilization.
4. **Priya** spots that 2 engineers logged 50+ hours → 1:1 follow-up planned.
5. Finance exports the **per-project Timesheet** to CSV for client billing.

**Success:** Honest, real-time view of capacity without spreadsheet hell.

---

## 🤝 Workflow 10 — Cross-Team Collaboration

**Actors:** Priya (PM), Design Team (Rohan), Engineering Team (Arjun)

1. **Priya** creates an **Epic** *"Customer Onboarding Redesign"*.
2. Splits it into 4 sub-stories — design, backend, frontend, QA.
3. Assigns each to the right person, sets a **target sprint**.
4. **Rohan** uploads design Figma links as attachments to the design story.
5. **Arjun** comments on the backend story with technical questions, **@-mentions Rohan** for design decisions.
6. **Kavya** subscribes to the Epic as a **watcher** — she gets notified of any sub-story change.
7. When all 4 sub-stories close, the **parent Epic auto-shows 100% complete**.

**Success:** No "what's the latest design" Slack pings — everything is in one issue thread.

---

## 🎨 Workflow 11 — Personalization

**Actors:** Arjun (Dev)

1. **Arjun** prefers dark mode → toggles theme from his profile.
2. Hides columns he doesn't care about on the board (assignee, story points).
3. Pins his most-used filter to the sidebar: **"Assigned to me, In Progress"**.
4. Customizes his dashboard layout — moves Activity widget to the top.
5. On the timesheet grid, sets sort order to start-date ascending.

**Success:** Each user shapes the app to their workflow. Preferences persist across sessions.

---

## 🌐 Workflow 12 — Cross-App Navigation Within QuikIT

**Actors:** Priya (PM)

1. **Priya** is reviewing QuikTrack sprints.
2. Notices she also needs to update **OKRs** in QuikScale → clicks **App Switcher** in header.
3. SSO carries her session → lands directly on QuikScale dashboard.
4. Updates OKRs, switches back to QuikTrack via the same switcher.
5. No re-login, no context loss.

**Success:** One identity, every app, instant switching.

---

## 🚦 Workflow 13 — Handling a Stale Sprint

**Actors:** Priya (PM)

1. Sprint 11 ended 3 days ago but was never closed.
2. **Priya** opens the sprint board, clicks **Complete Sprint**.
3. Of 18 issues, 3 are still `In Progress` — modal asks what to do.
4. **Priya** chooses *"Move to next sprint"* (Sprint 12).
5. Closed sprint archives; the 3 issues automatically appear in Sprint 12's backlog.
6. Velocity chart updates with the partial completion.

**Success:** No orphan issues, no manual cleanup.

---

## 📈 Workflow 14 — Executive Reporting

**Actors:** Ashwin (Org Lead / Exec)

1. **Ashwin** opens **For You dashboard** — sees aggregate status across all projects he leads.
2. Drills into the **Status Report** for the WEB project.
3. Opens **Sprint Completion Metrics** — velocity trend chart over last 6 sprints.
4. Spots one project below target → opens **Resource Report** to investigate workload imbalance.
5. Decides to redistribute headcount, communicates via comments on the relevant issues.

**Success:** Strategic decisions made from real data, not gut feel.

---

## 🚨 Workflow 15 — Incident: User Deactivated Mid-Session

**Actors:** Ashwin (Admin), Departing Employee

1. Departing employee submits resignation.
2. **Ashwin** opens **User Management**, clicks **Deactivate** on the user.
3. The user's current browser session detects the deactivation within 5 minutes via **session validation**.
4. The user gets redirected to login with `reason=deactivated`.
5. Their **OrgMember status** flips to `inactive`. Their issues remain assigned but flagged in resource reports.
6. **Ashwin** opens the resource report → sees 8 issues still assigned to the departed user → bulk-reassigns to the team lead.

**Success:** Off-boarding is one click; no leaks, no manual data cleanup.

---

## ⚡ Workflow 16 — Power-User Keyboard Workflow

**Actors:** Arjun (experienced Dev)

1. From any screen, **Arjun** hits `/` → global search.
2. Types `WEB-42`, presses Enter → jumps directly to that issue.
3. Uses keyboard shortcuts to change status, set assignee, add a comment — never touches the mouse.
4. Toggles between board and list views with shortcuts.
5. Opens the next assigned issue via "next" shortcut.

**Success:** Senior engineers can fly through their queue without breaking flow.

---

## 📬 Workflow 17 — Notification Hygiene

**Actors:** Priya (PM)

1. **Priya** receives 30 notifications overnight (mentions, status changes, comments).
2. Opens **Notification Hub** — tabs split into Direct (her mentions/assignments) and Watching (issues she follows).
3. Bulk **Mark all read**.
4. Configures her **digest cadence to weekly** — no more daily email floods.
5. Unsubscribes from a stale issue → no more notifications from it.

**Success:** Inbox stays clean, important things stay visible.

---

## 💡 Workflow 18 — Submitting Product Feedback

**Actors:** Any User

1. User hits a friction point → clicks **Feedback button** in help menu.
2. Modal: title, description, optional screenshot.
3. Submits → feedback row written to DB, email sent to platform admin.
4. Platform team reviews monthly, prioritizes.

**Success:** Voice of customer flows directly to engineering without a JIRA wrapper around the JIRA wrapper.

---

---

# 📅 Agile Ceremonies

## 🗓️ Workflow 19 — Daily Standup

**Actors:** Whole team (Priya, Arjun, Kavya, Rohan)

1. **9:30am** team opens the **Active Sprint board** on a shared screen.
2. Each member talks through cards in **"In Progress"** assigned to them — what was done yesterday, what's planned today, blockers.
3. Anyone flagging a blocker drops a comment **@-mentioning the unblocker** right on the card.
4. Cards stuck in "In Review" >2 days are flagged for follow-up.
5. **Priya** scans the burndown chart — on track / behind / ahead — calls out gaps.
6. Meeting ends in 10 minutes; nobody opens a separate slideshow or doc.

**Success:** Standup is just confirming what the board already shows. No status theater.

---

## 🔍 Workflow 20 — Backlog Grooming

**Actors:** Priya (PM), Arjun (Tech Lead), Kavya (QA), Rohan (Stakeholder)

1. **Priya** opens the **Backlog view**, sorted by rank.
2. Walks through top 30 unranked items together with the team.
3. For each item the team discusses scope, dependencies, and estimate.
4. **Priya** updates **story points** inline (Cmd+Click cell).
5. Where requirements are vague, **Priya** adds a comment requesting clarity from **@Rohan**.
6. Items with no defined acceptance criteria get a **"needs-spec"** label and are demoted in rank.
7. Items ready for next sprint get a **"sprint-ready"** label.

**Success:** Backlog is healthy for next sprint's planning meeting. Zero items in "vague" state make it into a sprint.

---

## 🪞 Workflow 21 — Sprint Retrospective

**Actors:** Whole team

1. End of sprint. **Priya** opens the completed sprint.
2. Team gathers around the **Sprint Review** summary — completion %, velocity, items rolled over.
3. **Priya** creates a new **Wiki doc** in the project: `"Sprint 12 Retro"`.
4. Each member adds bullet points under **"Went well"**, **"Could improve"**, **"Action items"** — collaboratively in the rich-text editor.
5. Action items are converted into issues with a `retro-item` label and added to next sprint's backlog.
6. Doc is linked from the sprint via `Doc:link`.

**Success:** Retro lives next to the sprint that produced it; action items are tracked just like real work.

---

## 📊 Workflow 22 — Sprint Velocity Trend Analysis

**Actors:** Priya (PM)

1. **Priya** opens the **Sprint Velocity Chart**.
2. Sees last 6 sprints — Sprint 7 (35pts), 8 (42), 9 (38), 10 (45), 11 (40), 12 (44).
3. Average velocity = 40 points. Predictability is decent (within 15% variance).
4. **Priya** uses this for next-sprint capacity planning — commits to 40 points, not 50.
5. Shares the chart screenshot in the team channel for transparency.

**Success:** Sprint commitments are evidence-based, not optimistic.

---

# 🏗️ Project Lifecycle

## 📋 Workflow 23 — Custom Workflow Setup

**Actors:** Priya (Project Admin)

1. Default project ships with **5 statuses** (Backlog, To Do, In Progress, In Review, Done).
2. **Priya** realizes her team needs to track **"Blocked"** separately for visibility.
3. Opens **Project Settings → Statuses**.
4. Adds new status **"Blocked"** in the `IN_PROGRESS` category with red color.
5. Re-orders so "Blocked" sits between "In Progress" and "In Review".
6. Board updates instantly with the new column.

**Success:** Workflow matches the team's reality without weeks of admin friction.

---

## 🧬 Workflow 24 — Epic Breakdown into Stories & Subtasks

**Actors:** Priya (PM), Arjun (Tech Lead)

1. **Priya** creates an **Epic**: `"Customer Onboarding Redesign"`.
2. Adds a description with goals + success metrics.
3. **Priya + Arjun** brainstorm the breakdown together — opens the Epic's detail view.
4. Creates 6 child **Stories** as sub-issues of the Epic.
5. For each story, **Arjun** adds subtasks (frontend, backend, tests, QA).
6. As subtasks complete, parent story rolls up automatically; epic progress %s tick up.
7. **Priya** can see at any moment: epic is 40% done across 24 subtasks.

**Success:** Big-picture scope is visible without losing the day-to-day execution detail.

---

## 🪂 Workflow 25 — Sprint Cancellation Mid-Sprint

**Actors:** Priya (PM)

1. 3 days into Sprint 13, business priorities shift dramatically.
2. **Priya** opens the active sprint → **Cancel Sprint**.
3. Confirmation modal asks: "What about the 12 active issues?"
4. Picks **"Move to backlog"**.
5. Sprint archives as `CANCELLED`; 12 issues return to backlog.
6. **Priya** creates a new sprint immediately with the revised scope.
7. Audit log records cancellation with reason field.

**Success:** Strategic pivots don't break the tool; everyone sees the change instantly.

---

## 📦 Workflow 26 — Project Archival and Restoration

**Actors:** Ashwin (Org Admin)

1. Project **"Mobile App v1"** is sunset after release.
2. **Ashwin** opens project settings → **Archive Project**.
3. Project disappears from default spaces list. Members lose write access; admins can still view.
4. 6 months later, a regression bug surfaces from v1 code.
5. **Ashwin** opens **archived projects list**, clicks **Restore**.
6. Project returns to active state; all issues, comments, history intact.
7. Investigator opens the bug, adds a comment with the fix → fast resolution.

**Success:** Archived doesn't mean lost. Old context recoverable instantly.

---

## 🤝 Workflow 27 — Project Handoff to New PM

**Actors:** Outgoing Priya, Incoming PM Maya

1. **Priya** is moving teams; **Maya** is taking over.
2. **Priya** opens project settings → changes **Lead** from herself to Maya.
3. Updates **Project Member** rows: Maya gets `PROJECT_ADMIN`, Priya demoted to `MEMBER`.
4. **Priya** writes a handoff doc in the project wiki: open items, known risks, key contacts.
5. Sets a watcher on the project so she still gets notified of major changes during transition.
6. **Maya** sees everything from day one — full history of every issue, every decision, every sprint.

**Success:** No tribal knowledge lost in transition. Context lives in the tool, not in Priya's head.

---

## 🏖️ Workflow 28 — Vacation Coverage (Out of Office)

**Actors:** Arjun (going on leave), Kavya (covering)

1. **Arjun** is on 2-week vacation.
2. Before leaving, he opens the **Bulk Edit** panel → filters his assigned issues with due dates during his absence.
3. **Bulk reassigns** them to Kavya.
4. Adds a comment on each: *"Reassigned during PTO — see context in description."*
5. Sets **status to Inactive** for the team to know if anyone tries to ping him.
6. Returns 2 weeks later, opens **For You** dashboard — sees what Kavya finished, what's still open.

**Success:** Coverage transitions are smooth; nothing falls through the cracks.

---

# 👥 People & Access Management

## 🛡️ Workflow 29 — Limited Vendor / Contractor Access

**Actors:** Ashwin (Admin), External Contractor

1. A contractor needs access to ONE specific project, not the whole org.
2. **Ashwin** invites them via email with role `member`.
3. Adds them ONLY as a `QtProjectMember` of the **Q3-Migration** project.
4. Creates a **custom project role "Contractor"** with view + comment perms only, no edit, no delete.
5. Assigns contractor to that role.
6. Contractor logs in, sees only that one project, can comment and view but not modify.

**Success:** Granular access without exposing the rest of the org.

---

## 🔍 Workflow 30 — Auditor Access (Field-Level Locked)

**Actors:** Ashwin (Admin), External Auditor

1. External auditor needs visibility into delivery metrics but not financial data.
2. **Ashwin** creates a custom org role **"Auditor"**.
3. Grants `view` permission across all resources.
4. Uses **Field-Level Permissions** to mark `Issue.storyPoints`, `Issue.eta`, `Timesheet.billable` as **hidden** for this role.
5. Uses **Navigation Gating** to hide the **Reports → Time** section.
6. Auditor logs in via SSO, sees everything they should — nothing they shouldn't.

**Success:** Compliance + transparency without leaking sensitive numbers.

---

## 🔐 Workflow 31 — Multi-Organization User

**Actors:** Maya (consultant working with 3 orgs)

1. **Maya** is invited to 3 separate orgs (Acme, Globex, Initech).
2. Each org sends an invite to her email.
3. She accepts all 3. Her `OrgMember` rows exist in all 3 orgs with different roles.
4. After logging in, the launcher shows tiles for **each org's QuikTrack tenant**.
5. She picks Acme → sees Acme's projects only. Switches via header dropdown → Globex's projects.
6. Each org is fully isolated; no data leakage.

**Success:** One user identity, many client engagements, zero accidental cross-pollination.

---

## 👤 Workflow 32 — Off-boarding a Departing Employee

**Actors:** Ashwin (Admin), Departing Employee

1. Employee submits resignation; last day in 2 weeks.
2. **Ashwin** opens **User Management** → opens their row.
3. Reassigns their active issues using **Bulk Edit** → assigns to their replacement.
4. Marks them watch-only on remaining issues for the transition.
5. On last day, **Ashwin** clicks **Deactivate**.
6. Within 5 minutes, the employee's session ends; they're redirected to login with `reason=deactivated`.
7. Their `OrgMember.status` flips to `inactive`; their issues stay assigned but flagged in resource reports.
8. 30 days later, the user is purged per retention policy.

**Success:** Off-boarding is one click; no orphan issues, no security leaks.

---

## 🔑 Workflow 33 — Password Reset / Forgot Password

**Actors:** Any User

1. User can't remember their password.
2. On **/login** page, clicks **"Forgot password?"** link.
3. Enters email address.
4. Receives email with single-use reset link (TTL 15 minutes).
5. Clicks link → set new password screen → enters new strong password.
6. Lands on launcher with active session.
7. Audit log records password reset event with IP and timestamp.

**Success:** Self-service recovery; never need to ping IT.

---

## 🔒 Workflow 34 — Two-Factor Auth Setup

**Actors:** Security-conscious user

1. User opens **Settings → Security**.
2. Clicks **Enable 2FA**.
3. Scans QR code with authenticator app (Google Authenticator, Authy, 1Password).
4. Enters 6-digit code to confirm.
5. Downloads 10 **backup codes** (one-time use).
6. 2FA is now enforced on every login.
7. User loses phone → uses backup code → can re-link a new device.

**Success:** Strong account security without friction.

---

## 🕵️ Workflow 35 — Active Session Management

**Actors:** Security-aware user

1. User opens **Settings → Security → Active Sessions**.
2. Sees list: `Macbook Pro (San Francisco, 2h ago)`, `iPhone (Mumbai, 30s ago)`, `Unknown Chrome on Windows (Berlin, 5m ago)`.
3. Doesn't recognize Berlin session → clicks **Revoke**.
4. That session is killed instantly.
5. User changes password as a precaution.

**Success:** Compromised sessions can be killed without a full lockout.

---

# 💼 Daily Operations

## 📨 Workflow 36 — Bulk Issue Import from CSV

**Actors:** Priya migrating from a spreadsheet

1. **Priya** has 87 backlog items in an Excel sheet.
2. Opens **Bulk Import** in the backlog view.
3. Downloads the CSV template — columns: `title, type, priority, assigneeEmail, storyPoints, dueDate, description`.
4. Pastes her data → uploads.
5. Mapping screen confirms column matches; **Priya** fixes one typo (`assignee_email` → `assigneeEmail`).
6. Clicks **Import** → 84 issues created; 3 errors with row numbers shown.
7. Fixes the 3 errors in Excel, re-imports.

**Success:** Spreadsheet-to-tracker in under 10 minutes for 87 issues.

---

## 🔄 Workflow 37 — Bulk Sweep / Mass Update

**Actors:** Priya (PM)

1. After a re-org, 23 issues need to be moved from project `WEB` to `MOB`.
2. **Priya** filters the list view to those 23 issues.
3. Multi-selects with shift-click.
4. Bulk actions toolbar appears → clicks **Move to project**.
5. Picks `MOB` → for each issue with no matching status, modal asks for mapping.
6. All 23 moved with comments + history preserved; original keys preserved with new project prefix.

**Success:** Big organizational changes don't require manual one-by-one updates.

---

## 📌 Workflow 38 — Issue Watching & Mention Etiquette

**Actors:** Senior engineer with limited time

1. User opens a critical issue but doesn't want to be a permanent contributor.
2. Clicks **Watch** to get notifications.
3. Adds a comment **@-mentioning** the right engineer with context: "@Arjun this is the regression we discussed."
4. Mentioned user gets in-app + email notification with deep link.
5. Watcher gets future change notifications but doesn't get pinged for every minor edit.
6. Week later, when the bug is closed, watcher gets one "Issue closed" notification — closes the loop without noise.

**Success:** Information flows without overwhelming busy people.

---

## 📊 Workflow 39 — Dashboard Customization

**Actors:** Different team members tailoring their view

1. **Priya** (PM) builds her dashboard: **Sprint progress widget**, **Resource report**, **My assigned**.
2. **Arjun** (Dev) builds his: **My assigned** at top, **Mentions**, **Recent activity**.
3. **Kavya** (QA) builds hers: **All bugs unassigned to QA**, **Issues in review**, **Today's test runs**.
4. Each user's dashboard is **stored per-user** in `QtDashboard`.
5. **Priya** can also create a **shared "Sprint 14"** dashboard pinned for the whole team during sprint.

**Success:** One workspace, every persona has their own view of it.

---

## 🔖 Workflow 40 — Saved Filter Sharing

**Actors:** Priya (PM)

1. **Priya** creates a complex filter: `assignee=team AND priority=High AND status!=Done AND dueDate<7days`.
2. Names it **"Urgent This Week"**.
3. Toggles **Share with team** → filter appears in everyone's sidebar.
4. Team members can drill into it instantly.
5. Two weeks later **Priya** edits the filter (changes 7days → 14days) → audit log records change; subscribers get notification of edit.
6. Anyone can fork the shared filter to a personal copy.

**Success:** Power-user queries become team-wide tools.

---

## 🎨 Workflow 41 — Theme & Branding Customization

**Actors:** Ashwin (Org Admin)

1. **Ashwin** opens **Org Settings → Branding**.
2. Sets org accent color to brand purple `#7B2CBF`.
3. Uploads org logo.
4. Color flows through buttons, badges, focus rings, sidebar accents — every interactive element across the app.
5. KPI traffic-light tables (intentionally) keep their fixed colors (per design lock).
6. New users joining the org see this branded experience from day one.

**Success:** Every tenant feels like their own app.

---

## 🌙 Workflow 42 — Dark Mode Workflow

**Actors:** Developer who codes at night

1. **Arjun** opens **Personal Settings → Appearance**.
2. Sets theme to **Dark mode**.
3. The entire app re-renders in dark theme — pages, modals, tooltips, charts.
4. **Arjun**'s preference is stored in `User.themeMode`.
5. Across reloads, app comes back in dark mode.
6. Optionally sets to **"System"** to follow OS preference (auto-toggle at sunset).

**Success:** No eye strain. Preferences persist.

---

# 📈 Reporting & Insights

## 📌 Workflow 43 — Client Status Report

**Actors:** Priya (PM) prepping a weekly client review

1. **Priya** opens **Reports → Project Status**.
2. Filters by client's project, date range = last 7 days.
3. Sees: 8 issues closed, 2 in progress, 1 blocker.
4. Clicks **Export → PDF** → branded PDF generated.
5. Attaches to client email; sends within 2 minutes.
6. Optionally: clicks **Schedule weekly email** → every Monday 9am the same report is auto-sent to the client distribution list.

**Success:** Client reporting goes from 30 minutes to 2 minutes per week.

---

## 🧮 Workflow 44 — Capacity Planning Across Sprints

**Actors:** Priya (PM) planning Q3

1. **Priya** has 5 engineers, 6 sprints in Q3 (12 weeks).
2. Opens **Resource Report** filtered by Q3 date range → sees historical capacity per engineer.
3. Realizes 2 engineers are on PTO during sprint 16.
4. **Adjusts sprint capacity** for sprint 16 down by 20 points.
5. Reorders backlog so big-effort items land outside sprint 16.
6. **Priya** writes a wiki page **"Q3 Capacity Plan"** with the breakdown and links to relevant sprints.

**Success:** Quarterly planning grounded in actual data.

---

## 🎯 Workflow 45 — Sprint Goal Tracking

**Actors:** Priya (PM) + team

1. At sprint start, **Priya** sets a clear goal: *"Ship customer self-service password reset."*
2. Goal appears on the sprint header.
3. Each day, the team can glance at the **board** — issues moving toward Done indicate progress against the goal.
4. **Burndown chart** shows day-by-day completion.
5. If the goal is at risk (e.g. day 8 of 10 and not yet in "In Review"), the team rallies.
6. End of sprint: **Sprint Review** displays goal status — *"Met"* or *"Partially met — 4 of 5 stories done."*

**Success:** Sprints aren't just bags of tickets; they have purpose.

---

## 🏆 Workflow 46 — Performance Review Using QuikTrack Data

**Actors:** Manager + employee

1. End of quarter. Manager opens **Resource Report** filtered by employee.
2. Sees: 130 hours logged, 84 issues closed, 5 bugs filed, 2 epics led.
3. Filters by issue type → sees breakdown of stories vs bugs vs tasks.
4. Opens manager's **personal dashboard** to see employee's velocity trend over the quarter.
5. Pulls data into a 1:1 conversation as objective evidence — alongside qualitative feedback.

**Success:** Performance conversations are based on real, fair data.

---

# 🚨 Incidents & Edge Cases

## 🐛 Workflow 47 — Critical Production Incident

**Actors:** On-call engineer Arjun, PM Priya, customer

1. Customer reports site down at 2am.
2. **Arjun** opens QuikTrack on phone, creates a new **Bug** with priority **Urgent**.
3. Adds @oncall mention.
4. Investigates locally, finds the issue, links a previous commit as `relates`.
5. Pushes fix at 3am. Updates issue status to **In Review**.
6. **Kavya** sees notification at 6am, verifies fix on staging.
7. Issue moves to **Done** at 7am.
8. Sprint review shows the unplanned issue — but it was resolved within the sprint.

**Success:** Even in chaos, the tool keeps everyone aligned.

---

## 🔄 Workflow 48 — Restoring a Mistakenly Deleted Issue

**Actors:** Arjun (Dev)

1. **Arjun** accidentally deletes issue `WEB-42`.
2. Sees the **Undo toast** for 10 seconds — clicks Undo → restored instantly.
3. Even if he missed the toast, he opens **Trash** (project settings → trash).
4. Finds `WEB-42`, clicks **Restore**. Issue returns with all comments, history, attachments intact.
5. Retention is 30 days — after that, the issue is permanently purged.

**Success:** Human error is recoverable.

---

## ⚠️ Workflow 49 — Read-Only Mode During Outage

**Actors:** Any user during a partial outage

1. Database write path is degraded. Reads still work.
2. **Banner appears** at the top: *"Some features temporarily unavailable. Read-only mode active."*
3. Users can still browse issues, search, view dashboards, read comments.
4. Create/edit buttons are disabled or show toast on click: *"Can't save — please retry shortly."*
5. When write path recovers, banner clears automatically.

**Success:** Partial outages don't render the app useless.

---

## 🚫 Workflow 50 — Concurrent Edit Conflict

**Actors:** Two team members editing the same issue

1. **Priya** opens issue `WEB-42`, starts editing description.
2. **Arjun** opens the same issue, also edits description with different content.
3. **Arjun** saves first. **Priya**'s save attempt detects the stale state.
4. **Priya** sees a conflict banner: *"This issue was changed by Arjun — view his changes or merge yours."*
5. Picks **"View diff"** → sees both versions side-by-side.
6. Merges manually → saves the combined version.
7. History records both edits with timestamps.

**Success:** Two collaborators don't overwrite each other.

---

# 🌐 Cross-App & Compliance

## 📤 Workflow 51 — GDPR Data Export Request

**Actors:** User invoking right to data portability

1. User opens **Settings → Privacy**.
2. Clicks **Request data export**.
3. Backend gathers all data: issues created, comments, time entries, attachments, audit log entries.
4. JSON file generated; email sent to user with download link (valid 24h).
5. User downloads, reviews, retains for their own records.
6. Audit log records the export event.

**Success:** Regulatory compliance is built in, not bolted on.

---

## ❌ Workflow 52 — Account Deletion Request

**Actors:** User wanting to leave platform permanently

1. User opens **Settings → Privacy → Delete account**.
2. Confirmation modal requires typing email to enable button.
3. On confirm, account moves to **30-day pending deletion**.
4. User receives email confirmation with cancel link.
5. After 30 days without cancel, all PII is purged: profile fields nulled, email hashed.
6. Issues authored / commented on remain (anonymized as "Deleted user").

**Success:** Right to be forgotten honored without breaking the work history of others.

---

## 🕵️ Workflow 53 — Audit Log Review for Compliance

**Actors:** Compliance officer

1. Quarterly compliance audit. Officer opens **Audit Log**.
2. Filters by date range (Q2), action type = `permission_change` and `user_delete`.
3. Sees: 14 permission changes, 3 user deletions, all with actor + target + timestamp + IP.
4. Exports CSV for the audit report.
5. Spot-checks 3 entries — each is justified and approved.
6. Closes audit with confidence.

**Success:** Compliance audits are minutes of work, not days.

---

## 🎭 Workflow 54 — Platform Admin Impersonation for Support

**Actors:** Platform admin Suyash, user Priya reporting bug

1. **Priya** reports she can't see a project that admin says she should see.
2. **Suyash** (platform admin) opens admin portal → finds Priya's user → clicks **Impersonate**.
3. Enters Priya's session. Yellow **"Impersonating priya@..."** banner is visible across all pages.
4. **Suyash** reproduces the issue — sees Priya's actual view.
5. Identifies a permission misconfiguration → exits impersonation.
6. Fixes the permission in admin → tells Priya to refresh.
7. Audit log records: real user = Suyash, acting as = Priya, with timestamp and resolution.

**Success:** Support staff can diagnose without "screen share my session" calls.

---

## 🌍 Workflow 55 — Cross-App Workflow with QuikScale

**Actors:** Priya (PM) reviewing OKRs

1. **Priya** is in QuikTrack reviewing sprints.
2. Realizes the sprint's outcomes need to be tied to a Q3 OKR in QuikScale.
3. Clicks **App Switcher** in header → QuikScale tile.
4. SSO carries her session → lands in QuikScale instantly.
5. Updates the OKR with delivered features. References issue keys in the OKR description: `WEB-42, WEB-43`.
6. Switches back to QuikTrack — adds a comment on the relevant issues: *"Delivered toward Q3 OKR: customer activation."*

**Success:** One identity, multiple apps, zero context loss.

---

# 🎓 Onboarding & Adoption

## 📚 Workflow 56 — Training a New Team

**Actors:** Priya rolling out QuikTrack to a 12-person team

1. **Priya** is migrating her team from Trello.
2. Step 1: **Ashwin** provisions QuikTrack for the org and invites Priya as project admin.
3. Step 2: **Priya** creates the first project, imports backlog from Trello via CSV (Workflow 36).
4. Step 3: She bulk-invites all 12 team members via email.
5. Step 4: First 5 minutes of the kickoff meeting: she walks through the **Kan onboarding tour** with the team.
6. Step 5: Everyone creates their first **personal dashboard** and saves their first **filter**.
7. Day 2: Daily standup uses the board (Workflow 19).

**Success:** A new team is operational in 1 day, not 1 week.

---

## 🤔 Workflow 57 — In-App Help & Sample Data

**Actors:** Brand new admin exploring

1. **Ashwin** signs up for QuikTrack for the first time.
2. Opens **Empty workspace** — prompted to **"Load sample data"**.
3. Clicks accept → org gets a fully populated sample project: WEB project, 3 sprints, 75 issues, demo users.
4. **Ashwin** explores all features against real-looking data.
5. When ready, clicks **"Remove sample data"** → all sample rows soft-deleted; he starts fresh.

**Success:** Discovery is hands-on, not just docs.

---

## 💡 Workflow 58 — Filing a Feature Request from Within the App

**Actors:** User who needs a missing feature

1. User wants a feature: **"Custom workflows per project"**.
2. Clicks **Help → Send Feedback** in header.
3. Modal opens. Picks category **"Feature Request"**.
4. Types description, attaches screenshot of current limitation.
5. Submits → feedback row stored in `QtFeedback`; email sent to platform admin.
6. Platform team reviews monthly. User gets a follow-up notification when picked up: *"Your feedback is on the roadmap for Q4."*

**Success:** Voice of customer flows directly to engineering without an external JIRA wrapper around a JIRA wrapper.

---

# 📱 Mobile & Accessibility

## 📱 Workflow 59 — Mobile Quick Triage on the Go

**Actors:** PM Priya commuting

1. Notification on phone: critical bug filed.
2. **Priya** opens QuikTrack on mobile from notification.
3. Loads in <2s. Sees the issue full detail.
4. Adds a comment: *"Assigning to @Arjun — let's get this for sprint 14."*
5. Taps assignee → user picker → picks Arjun.
6. Sets priority to Urgent. Taps Save.
7. Continues her commute. Arjun is on it before she gets to the office.

**Success:** PMs are unblocked even when away from desktop.

---

## ⌨️ Workflow 60 — Power-User Keyboard-Only

**Actors:** Senior engineer who hates touching the mouse

1. **Arjun** never reaches for the mouse.
2. Presses `/` → global search opens.
3. Types `WEB-42`, Enter → jumps directly to issue.
4. Presses `s` → status switcher opens → arrow keys + Enter → status changed.
5. Presses `a` → assignee picker → types initials → Enter.
6. Presses `c` → comment box focused.
7. Types comment with @mention completion via Tab.
8. Cmd+Enter to submit.
9. Presses `j` → next issue.

**Success:** Power users never break flow.

---

## ♿ Workflow 61 — Screen-Reader Accessibility

**Actors:** Visually impaired user navigating via screen reader

1. User logs in. NVDA announces the dashboard structure: *"Dashboard heading level 1. Sidebar with 6 navigation items."*
2. User tabs through. Each focus changes is announced: *"Projects link, position 1 of 6."*
3. Opens a project → board reads as: *"Board view, 4 columns: Backlog, In Progress, Review, Done."*
4. Each card announces type, title, assignee.
5. Opens an issue → modal announced as *"Dialog: WEB-42 detail."*
6. Form fields all have associated labels announced.
7. Live region announces save toast: *"Issue saved."*

**Success:** The app works without sight; accessibility is a feature not an afterthought.

---

# 🔮 Future / Power Features (when configured)

## 🪝 Workflow 62 — Webhook to Slack on Issue Changes

**Actors:** Team that lives in Slack

1. Admin configures an **outbound webhook**: target = Slack incoming webhook URL, events = `issue.status_changed`, `comment.created`, `mention`.
2. Whenever an issue status changes, payload sent to Slack channel.
3. Slack shows: *"WEB-42 moved to Done by @arjun."*
4. Team gets visibility without checking QuikTrack constantly.
5. Webhook payload signed with HMAC; Slack-side validation rejects spoofs.

**Success:** QuikTrack plugs into the team's primary communication tool.

---

## 🔗 Workflow 63 — Public API Integration

**Actors:** DevOps engineer building a CI/CD bot

1. **Ashwin** creates an **API key** scoped to `Issue:read, Issue:update`.
2. DevOps engineer's CI pipeline detects a build failure.
3. CI POSTs to QuikTrack API: creates a bug issue with build log attached.
4. Stamps issue with sprint = current active sprint.
5. Comments on the issue from the bot: *"Build failed on commit abc123."*
6. Team triages the bot-filed issue normally.

**Success:** Tools talk to each other; humans focus on the work.

---

# Putting It All Together — A Day in the Life

> *Priya wakes up, opens her laptop. Notifications hub shows 3 mentions overnight — she replies to one comment, marks the rest as read. She opens the Sprint Board, sees 2 cards in 'In Review' for her team. She drags one to 'Done', logs 0.5h for her review time. She switches to the Resource Report — Arjun is overloaded; she moves a story to herself. At standup at 9:30, the team uses the board on screen — 10 minutes flat. By noon she's done a quick **backlog grooming** (Workflow 20), reviewed yesterday's **velocity trend** (Workflow 22), and prepped the **weekly client report** (Workflow 43). Afternoon brings an **incident** (Workflow 47) — handled. End of day she logs her timesheet and closes the laptop. The team is in sync, the work is visible, and tomorrow's standup will write itself.*

That's QuikTrack done right.

---

*Use this doc to anchor product, sales, training, and onboarding conversations. Every workflow above is fully supported by the current production build — see [FEATURES.md](FEATURES.md) for the underlying feature inventory and [TEST_SCENARIOS.md](TEST_SCENARIOS.md) for the QA matrix. For API surface backing these workflows, see [API_REFERENCE.md](API_REFERENCE.md).*
