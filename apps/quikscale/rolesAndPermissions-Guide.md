# Roles & Permissions — A Plain-English Guide

> For team leads, admins, and anyone who needs to understand how access
> works in QuikScale — without reading any code.

If you're a developer looking for the schema / API / SQL details, see
[`rolesAndPermissions.md`](./rolesAndPermissions.md) instead.

---

## What is this for?

QuikScale has a lot of features — KPIs, Priorities, WWW action items,
Quarter Settings, Daily / Weekly meetings, OPSP, and so on. Not every
team member should be able to do everything. A junior teammate
probably shouldn't be deleting other people's KPIs; an external coach
might only need to read things, not change them.

Until now, QuikScale only had a fixed list of built-in roles ("Admin",
"Manager", "Employee", …). You couldn't change what those roles meant,
and you couldn't add new ones.

The new **Roles & Permissions** page solves that. As an admin, you can:

1. **Create your own roles** — "Accountability User", "Coach",
   "Read-only Viewer", anything you need.
2. **Decide exactly what each role can do** — for every feature, choose
   whether the role can Create new records, Update existing ones,
   Delete, or just View.
3. **Choose what each role sees in the menu** — so a role that only
   needs Daily Huddle won't even see the KPI section in the sidebar.
4. **Assign one role to each person** in your organisation.

Think of a role as a **template of permissions**. You set it up once;
every user with that role gets the same access. Change the role later
and every user automatically inherits the change.

---

## Where is the page?

Two ways to reach it:

- **Sidebar** — `Org Setup → Roles & Permissions` (shield icon).
- **Top-right user menu** — click your avatar in the header → choose
  **User Permission**.

Both land on the **Users list** — your starting screen for everything
about people and access.

---

## The two screens at a glance

The feature is split into two screens so you can manage *people* and
*roles* independently:

| Screen | URL | What it's for |
|---|---|---|
| **Users list** | `/org-setup/roles` (the default) | See all the people in your organisation, change their role inline, switch them on/off, add new people. |
| **Manage Permission** | Click *Manage Roles* on the Users list | Create roles and tick what each role can do (the big checkbox matrix). |

You almost always start on the **Users list**. You only visit *Manage
Permission* when you need to add a new role or change what an existing
role can do.

---

## Users list — the landing screen

```
┌─ 🔎 Search… ───────┬─ Filter by Org ─┐    [+ Add User]  [🛡 Manage Roles]
│ All Users  GOAL                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│ Users           │ Email                  │ Account Type │ Roles ▾  │ ●─ │
│ AS Ashwin       │ ashwin@…               │ Org Account  │ admin    │ ON │
│ RD Rohit D      │ rohit@…                │ User Account │ — None — │ ON │
├──────────────────────────────────────────────────────────────────────────┤
│ Showing 1-10 of 84   Rows per page [10▾]    ‹  Page 1 of 9  ›            │
└──────────────────────────────────────────────────────────────────────────┘
```

### What you can do here

- **Change a user's role** — open the **Roles** dropdown next to any user
  and pick a new role. The change saves instantly; a small green message
  pops up at the bottom right confirming `Role updated to <role name>`.
  No "Save" button — every change is one click.
- **Activate / deactivate a user** — click the **Status switch**.
  Inactive users keep all their data (KPIs, priorities, etc.) but can't
  sign in to QuikScale until you switch them back on.
- **Search** — type a name or email; the list filters live.
- **Pagination** — defaults to 10 rows per page. Pick 20 / 30 / 50 from
  the dropdown if you want to see more at once. The list scrolls
  internally; the *Showing X-Y of Z* footer always stays at the bottom.
- **Manage Roles** button (top right) — opens the role matrix screen
  (the next section of this guide).
- **+ Add User** button — opens a small popup to invite new people (see
  next sub-section).

### Adding a new user

Click **+ Add User** at the top right. A popup appears with a row of
fields:

| Field | What to type |
|---|---|
| Email | The new person's email address. |
| Name | Their full name (first + last). |
| App | Currently always *GOAL*. |
| Role | Pick from the existing roles. Leave on *— No role —* if you're not sure yet — you can assign a role from the Users list later. |

Click **+ Add another user** to add more rows so you can invite several
people at once. The little **×** removes a row.

Click **Add User** at the bottom right to create everyone in one go. Each
new person shows up in the Users list immediately.

> ⚠️ Today the system creates a temporary random password for each new
> user. They'll need someone with admin access to set their real password
> via *Org Setup → Users*. A proper "send invitation email" flow is on
> the roadmap — until then, share the temp password securely with the
> new person.

### Why is "All Users" / "GOAL" a tab?

Today both tabs show the same list — every user in your organisation.
Once cross-organisation access becomes a thing (sharing users between
your QuikScale and another QuikIT app), the *All Users* tab will show
everyone across every app and the *GOAL* tab will narrow to people who
have QuikScale access. For now it's a single list with the tabs in place
for the future.

### Why is "Filter by Organization" disabled?

Same reason — it's wired up for the cross-organisation feature that
hasn't shipped yet. Hover the dropdown for the tooltip.

---

## Manage Permission — the role matrix screen

You reach this by clicking **Manage Roles** on the Users list. The
back-arrow at the top-left brings you back.

---

## What you see when you open it

The page has two sides:

### Left side — the list of roles

```
ROLES                         [+]
🛡 admin
   User                  DEFAULT  🗑
   Manager                       🗑
   Read-only                     🗑
```

- The **+ button** at the top creates a new role.
- The **shield icon (🛡)** marks system roles. There's only one — `admin` —
  and it can't be deleted or edited.
- The **DEFAULT** badge means "this role is automatically given to any new
  person you invite to the organisation". Only one role can be the default.
- The **trash icon (🗑)** appears next to non-system roles when you hover.
  Clicking it deletes the role (after a confirmation popup).

### Right side — what the selected role can do

```
Permissions — User                              [Save changes]

  Tabs: [ Entities ] [ Navigation ]
```

Two tabs:

- **Entities** — *what data can this role touch?*
- **Navigation** — *what menu items can this role see?*

---

## Entities tab — the big checkbox grid

Each row is a part of QuikScale (KPI, Priority, WWW, Teams, Daily Huddle,
…). Each row has four columns:

| Column | What ticking it means |
|---|---|
| **Create** | The user can add new records of this type. |
| **Update** | The user can edit existing records. |
| **Delete** | The user can remove records. |
| **View** | The user can see this data. |

Tick the boxes you want. Untick the ones you don't. Click **Save changes**
when you're done.

### Tip — clicking the entity name toggles the whole row

If you click the word **WWW** (or **KPI**, or any entity name), all four
checkboxes for that row toggle on or off together. Useful when you want
to give "everything" or "nothing" for one feature in one click.

### What about the `2/4` badge?

You may see a small badge like `2/4` next to an entity name. It just
tells you how many of the four checkboxes are ticked for that row. So
`3/4` = three boxes ticked, one not. It's a quick visual summary.

---

## Navigation tab — controlling the sidebar

The sidebar has many sections (Dashboard, KPI, Priority, WWW, Org Setup,
Meeting Rhythm, OPSP, Analytics, People, …). The Navigation tab lets you
choose which of those a role can **see** in the menu.

### Why is this separate from Entities?

Because you might want a role to be able to **see** a page from a deep
link (someone emails them a KPI URL), but **not** clutter their sidebar
with menu items they never use. Or the opposite — a role might need the
sidebar entry as a quick navigation hint, but only have view access to
the data inside.

In practice, most roles match the two — if you grant `KPI/View`, you'll
usually also tick the `Individual KPI` and `Teams KPI` navigation
entries. But you don't have to.

---

## The `admin` role — special

When you click `admin` on the left, the right side shows a banner instead
of checkboxes:

> 🛡 admin role
>
> The admin role has full access to all features by default and cannot
> be edited or deleted.

This is intentional. The `admin` role is a **safety hatch** — there must
always be at least one role with full access, otherwise the system
becomes unusable. The check is built into the code, not driven by the
checkboxes, so even if someone with database access tampered with the
permission rows, admin would still work.

---

## Creating a new role — step by step

1. Click the **+** at the top of the Roles list.
2. A small popup appears:
   - Enter a name (e.g. *Manager*, *Coach*, *Accountability User*).
   - Optionally tick "Make this the default role for newly invited
     users". (Doing this automatically un-ticks default on whichever
     other role used to be default.)
3. Click **Add Role**. The role appears in the list, selected.
4. The right side shows the Entities tab with **everything off**. New
   roles start with zero permissions on purpose — admins decide
   deliberately what to grant.
5. Tick the boxes you want.
6. Switch to the Navigation tab. Tick the menu items the role should see.
7. Click **Save changes** at the top right. The button shows "Saving…"
   for a moment, then changes to "Saved".

Done. The role exists. Now you need to assign it to people.

---

## Assigning a role to people

Now that you've created a role, head **back** (← arrow at the top-left)
to the Users list and pick the role from the **Roles** dropdown next to
each person you want to give it to. The change saves instantly.

If you change your mind, pick a different role — or *— No role —* to
revoke access entirely.

A user with **no role** can sign in but won't see any pages. They'll need
a role assigned before they can do anything in QuikScale.

---

## Common scenarios

### "I want a Manager role that can do everything except delete KPIs"

1. + Add Role → name: *Manager*. Save.
2. On the Entities tab, click each entity name to toggle the whole row
   on, then **uncheck only KPI's Delete column**.
3. Save.

### "I want a Read-only role that can see everything but change nothing"

1. + Add Role → name: *Read-only*. Save.
2. On the Entities tab, tick only the **View** column for every row
   (leave Create / Update / Delete unchecked).
3. On the Navigation tab, tick every menu item.
4. Save.

### "I want a Daily Huddle role that only sees Meeting Rhythm"

1. + Add Role → name: *Huddle Lead*. Save.
2. On the Entities tab, tick Create + Update + View for **Daily Huddle**
   only. Leave everything else unchecked.
3. On the Navigation tab, tick only **Meeting Dashboard**, **Daily
   Huddle**, and **Client Master** (if they need to see clients to host
   the huddle).
4. Save.

### "I want to make existing 'User' role into the new default"

1. Click the **User** role on the left.
2. There's no toggle on the matrix screen for "default" — that's set on
   creation today. To rename or set default later, use the API or wait
   for the per-role edit dialog (next iteration).

---

## Deleting a role — what happens to the people on it?

Click the trash icon on a role. A confirm popup appears showing how many
users currently have that role:

> ⚠️ Delete **Manager**? This cannot be undone.
>
> 3 users will lose this role assignment and need to be reassigned.

If you confirm:

- The role row disappears.
- All its checkbox grants are removed automatically.
- The 3 users **keep their account** — they don't get deleted — but
  their role becomes empty. They lose access to QuikScale until you
  give them a new role.

There is **no way** to delete the `admin` role. The trash icon doesn't
even appear next to it.

---

## What happens when you click "Save changes"

Every time you Save, QuikScale takes a snapshot of every checkbox you
ticked on **both** tabs and stores it. If you tick five Entity boxes and
two Navigation boxes, exactly five + two records appear in the database.

If you later untick one of them and Save, that record is removed and the
others stay. Half-saved states aren't possible — either everything you
ticked goes through, or nothing changes (if there's a connectivity
problem, you'll see an error message in red and your edits stay on
screen so you can retry).

---

## Quick FAQ

**Q. If I change a role's permissions, does it affect the users on that
role immediately?**
A. Yes. The next page they load reflects the new permissions. There's no
"publish" step — Save is publish.

**Q. Can a user have two roles at once?**
A. No. One role per user per app. If you need someone to combine the
abilities of two roles, create a third role that has the union of both.

**Q. Where do I see who has which role?**
A. The **Users list** (the landing page when you click *User
Permission*) shows everyone alongside their current role. You can also
sort/search by name or email.

**Q. How do I deactivate someone without deleting their account?**
A. On the Users list, flip the **Status** switch next to their name to
*INACTIVE*. They keep all their data and can be reactivated later by
flipping it back on.

**Q. Why does my new role start with everything unchecked?**
A. Safety. Imagine you create a role and forget to tick anything — if
the default were "everything on", users on that role would
accidentally have full access. Starting empty makes you confirm what
you actually want.

**Q. Can I rename a role?**
A. The API supports it; the rename UI hasn't been built yet. Coming in
the next iteration.

**Q. Does this affect QuikVC or QuikInfra?**
A. No. Each app has its own roles. A role you create here is QuikScale-
only.

---

## Where to go next

- **Developer details** — see
  [`rolesAndPermissions.md`](./rolesAndPermissions.md) for tables,
  schema, API, SQL queries, migration steps.
- **The other docs on this branch** —
  [`emailIntegration.md`](./emailIntegration.md) (KPI / Priority / WWW
  email notifications) and
  [`bugsResolve.md`](./bugsResolve.md) (the bug-fix log from the same
  delivery cycle).
