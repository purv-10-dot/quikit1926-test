# Table of Contents

| # | Section |
|---|---|
| 1 | **Platform Overview & System Flow** |
| 2 | **Feature Catalog** — every working feature with description |
| 3 | **Use Cases & Workflows** — 63 end-to-end persona journeys |
| 4 | **Test Scenarios** — 60-section QA matrix (best + worst case) |
| 5 | **API Reference** — every endpoint, method, body, response |
| 6 | **Jira Migration Guide** — how data flows from Atlassian Jira Cloud into QuikTrack |

---

# 1. Platform Overview & System Flow

QuikTrack is the work-management module of the **QuikIT** platform — a multi-tenant SaaS for project, sprint, and issue tracking. It shares identity, organization data, and navigation with sibling apps (QuikScale, Admin Portal, Auth App, and others).

## 1.1 Platform Architecture

```mermaid
flowchart LR
    User[End User<br/>Browser / Mobile]
    Auth[Auth App<br/>quikit-auth-ten.vercel.app]
    Launcher[Launcher App<br/>quikit-launcher-sigma.vercel.app]
    QuikTrack[QuikTrack<br/>quikit-quiktrack.vercel.app]
    Admin[Admin Portal<br/>quikit-admin-pearl.vercel.app]
    Neon[(Neon Postgres<br/>shared DB)]
    S3[(AWS S3<br/>attachments)]
    SMTP[SMTP<br/>Office 365]

    User -->|login| Auth
    Auth -->|JWT handoff| Launcher
    Launcher -->|app tile click| QuikTrack
    Launcher -->|app tile click| Admin
    QuikTrack -->|read/write| Neon
    Admin -->|read/write| Neon
    Auth -->|read/write| Neon
    Launcher -->|read/write| Neon
    QuikTrack -->|attachments| S3
    QuikTrack -->|emails| SMTP
```

**Key properties:**
- **Single sign-on:** one login, every app authenticated via cross-domain JWT handoff.
- **Shared identity:** users, orgs, memberships live in shared `auth` + `quikit` Postgres schemas.
- **Per-app data:** quiktrack-specific data lives in `app_quiktrack` schema for clean isolation.
- **Multi-tenant:** every row is scoped by `orgId`; tenant-isolation enforced on every API call.

---

## 1.2 User Authentication & Cross-App Flow

```mermaid
sequenceDiagram
    actor User
    participant Auth as Auth App
    participant Launcher
    participant QuikTrack
    participant DB as Neon DB

    User->>Auth: 1. Visit /login
    Auth->>DB: 2. Verify credentials
    DB-->>Auth: 3. User valid
    Auth->>Auth: 4. Create session JWT
    Auth->>Launcher: 5. Redirect with handoff token
    Launcher->>Launcher: 6. /auth-handoff verifies token
    Launcher->>User: 7. Show /apps tiles
    User->>Launcher: 8. Click QuikTrack tile
    Launcher->>Launcher: 9. POST /api/launch-token mints new JWT
    Launcher->>QuikTrack: 10. Redirect with token
    QuikTrack->>QuikTrack: 11. /auth-handoff sets cookie
    QuikTrack->>DB: 12. Load /api/me/permissions
    DB-->>QuikTrack: 13. Permissions + roles
    QuikTrack-->>User: 14. Render dashboard
```

Because `*.vercel.app` is on the Public Suffix List, cookies can't be shared across subdomains. The platform bridges sessions using **short-lived (120s) HS256 JWTs signed with a shared `INTERNAL_SECRET`** — each consumer app's `/auth-handoff` endpoint exchanges the token for its own domain-scoped NextAuth cookie.

---

## 1.3 Issue Lifecycle Flow

```mermaid
flowchart TD
    Create[User clicks +Create] --> Save{Save issue}
    Save -->|valid| Created[Status: Backlog]
    Save -->|invalid| Form[Show validation errors]
    Created --> ToDo[Status: To Do]
    ToDo --> InProgress[Status: In Progress]
    InProgress --> InReview[Status: In Review]
    InReview --> Done[Status: Done]
    InReview --> Reopen[Reopen]
    Reopen --> InProgress
    Done --> Archive[Archive]
    Done --> Resolved[Resolved]

    InProgress -.->|log time| Timesheet[Timesheet Entry]
    InProgress -.->|add comment| Comment[Issue Comment]
    InProgress -.->|mention @user| Notify[Notification + Email]
    InProgress -.->|attach file| Attachment[S3 + QtIssueAttachment]

    Done --> History[QtIssueHistory<br/>permanent audit trail]
```

---

## 1.4 Sprint Lifecycle

```mermaid
stateDiagram-v2
    [*] --> PLANNED: Create sprint
    PLANNED --> ACTIVE: Click Start
    ACTIVE --> COMPLETED: Click Complete<br/>(move incomplete to backlog or next sprint)
    PLANNED --> COMPLETED: Complete empty sprint
    ACTIVE --> CANCELLED: Cancel mid-sprint
    PLANNED --> CANCELLED: Cancel
    COMPLETED --> [*]
    CANCELLED --> [*]

    note right of ACTIVE
        Only one ACTIVE sprint
        per project at a time
    end note
```

---

## 1.5 Data Flow — Create Issue API

```mermaid
sequenceDiagram
    participant Client as Browser (Client)
    participant API as POST /api/issues
    participant Auth as withOrgAuth
    participant Perms as requirePerm("Issue", "create")
    participant DB as Neon Postgres
    participant Hist as QtIssueHistory
    participant Email as SMTP

    Client->>API: { projectId, title, type, ... }
    API->>Auth: Validate session + orgId
    Auth-->>API: { userId, orgId }
    API->>Perms: Check Issue:create
    Perms-->>API: Allowed
    API->>DB: INSERT QtIssue (auto-key WEB-N)
    DB-->>API: New issue
    API->>Hist: INSERT history entry
    API->>Email: Send "you've been assigned" (async)
    API-->>Client: 201 { success: true, data: issue }
```

---

## 1.6 Migration Flow Overview (Jira → QuikTrack)

```mermaid
flowchart LR
    Admin[Admin UI] -->|POST /api/migration/jira| API
    API -->|requireAdmin| Service[migrateFromJira service]
    Service -->|/rest/api/3/myself| Jira[(Atlassian Jira Cloud)]
    Service -->|/users/search + bulk| Jira
    Service -->|/project/search| Jira
    Service -->|/search/jql 3 sweeps| Jira
    Service -->|/comment + /worklog| Jira
    Service -->|attachment binary| Jira
    Service -->|upsert| DB[(Neon Postgres)]
    Service -->|putObject| S3[(AWS S3)]
    Service --> Report[MigrationReport]
    Report --> Admin
```

Detailed in Section 6 of this document.

---
