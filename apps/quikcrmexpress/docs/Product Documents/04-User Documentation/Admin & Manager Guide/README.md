# Administrator & Manager Guide

Functionality that requires a role above Sales User. It is kept separate so the [User Guide](../User%20Guide/README.md) stays accurate for everyone.

**Who this is for**

| Role | What is available to you here |
|---|---|
| **Sales Manager** | Documents, Reports, deletion and Trash across modules |
| **Finance User** | Reports and export |
| **Administrator** | Everything, including all configuration under Settings |

If you are a Sales User, nothing in this volume applies to your account.

---

## Manager-level features

- **[Documents and Reports](documents-and-reports.md)** — the shared document library and the reporting tools

Deletion, Trash and export are documented in place, within each module's page in the User Guide.

---

## Administration

| Guide | Covers |
|---|---|
| **[Users, roles and permissions](users-roles-and-permissions.md)** | Creating users, assigning roles, permission templates |
| **[Controlling who sees which records](visibility-and-sales-groups.md)** | Sales groups, account access, owned-leads-only visibility |
| **[Pipeline stages, statuses and custom fields](pipeline-and-fields.md)** | Sources, stages, statuses, sub-statuses, custom fields, lead scoring |
| **[Setting up call outcomes](call-disposition-setup.md)** | Dispositions, outcome forms and rules |
| **[Automations](automations.md)** | Workflow rules and automated lead assignment |
| **[Notification rules](notifications.md)** | Who gets told what, and how |
| **[Audit log](audit-log.md)** | What is recorded, and importantly what is not |

---

## Where to find Settings

**Sidebar → Settings**

The Settings area has its own navigation with a search box and collapsible groups:

| Group | Pages |
|---|---|
| Profile | My Profile · Company |
| Users & Teams | Users · Teams · Sales Groups · Permission Templates |
| Leads | Lead Scoring · Lead Fields · Lead Sources · Lead Stages · Lead Statuses · Lead Sub Stages |
| Call Disposition | Call Dispositions · Disposition Forms |
| Products | Categories & Brands · Product Fields · Quote Templates |
| Other | Integrations · Audit Log · Notifications |

Everything except **My Profile** requires an Administrator.

> **Gotcha.** **Call Dispositions** and **Disposition Forms** appear in the Settings navigation for non-administrators, but their pages will not load or save data for them. Only Administrators can use them. This is a known inconsistency.

---

## Before you change anything

Three principles that prevent most configuration accidents:

1. **Permissions only ever add.** Attaching a permission template can grant more; it can never take something away that a role already allows.
2. **Visibility settings can reduce what people see the moment you apply them.** Granting a user their first account access switches them from "sees everything" to "sees only what is granted".
3. **Most configuration changes are not recorded in the audit log.** See [Audit log](audit-log.md) for what is and is not captured.

---

## Related

- [User Guide](../User%20Guide/README.md) · [Roles and visibility](../User%20Guide/roles-and-visibility.md)
