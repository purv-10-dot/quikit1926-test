# QuikCRM — AI Runtime Compatibility Document

**Date:** 2026-05-07
**Author:** Alok Shukla, QuikCRM team
**Scope:** `apps/quikcrm/` in the QuikIT monorepo
**Audience:** AI Runtime team (Suyash) — for tool-execution handler design, permission planning, prompt-context construction, and integration sequencing

---

## TL;DR — Headline Findings

QuikCRM is a multi-tenant Next.js 14 sales-execution app with **52 Crm\* Prisma models in the `app_quikcrm` schema, ~118 API route files, strict tenant isolation, and an internal RBAC matrix that already covers all CRUD modules**. Data hygiene is good. The gap to AI-Runtime-callable is at the **runtime contract layer**, not the data layer. Specifically, QuikCRM today has:

| Concern | State | Severity |
|---|---|---|
| `@quikit/ai-sdk` integration | **Not installed** — zero AI infrastructure | P0 |
| `@quikit/search-sdk` integration | **Not installed** — search is in-DB ILIKE only | P1 |
| `@quikit/audit` integration | **Not installed** — internal `audit()` used only in Settings; lead/account writes use a separate `recordLeadChange` / `writeAccountActivity` pattern | P2 |
| Service-JWT / `actingAs` / `actingAgentId` | **No code references anywhere** | P0 |
| `manifest.permissions[]` | **Empty** — launcher has no idea what permissions QuikCRM declares | P0 |
| `/api/internal/manifest` | **Does not exist** | P0 |
| `/api/{entity}/:id/summary` endpoints | **Do not exist** for any entity | P0 |
| Cursor pagination | **Not implemented** — offset/limit only | P3 |
| `/api/internal/*` endpoints | **One only** — `accounts/reconcile-owner-names` (admin-only sync job) | — |
| `tenantId` filter discipline | **Strong** — every Prisma query is `tenantId`-scoped, enforced by app-level CLAUDE.md | OK |
| Soft-delete pattern | **Strong** — `deletedAt` + middleware on Lead/Account/Opportunity | OK |

The P0 effort to make this app AI-Runtime-callable is significant. See **§20 — Required Changes** for the prioritized list.

---

## Section 1 — App Identity

| Field | Value |
|---|---|
| **App slug** | `quikcrm` |
| **App name** | QuikCRM |
| **One-line description** | "Leads, accounts, contacts, automations, and telephony — sales execution." (from [manifest.ts:37](manifest.ts#L37)) |
| **Route prefix** | `/quikcrm` |
| **Repository location** | `apps/quikcrm/` in the QuikIT monorepo (Turbo workspace) |
| **Local dev URL** | `http://localhost:3009` |
| **Production URL** | Resolved by integration owner during Vercel deploy (Vercel auto-deploys `main` only) |
| **Tech stack** | Next.js 14.0.4 (App Router), React 18.2.0, TypeScript 5.7.2, Tailwind 3.4.17 |
| **Database** | Postgres via Prisma (multi-schema; this app namespaced as `app_quikcrm`) |
| **Auth** | NextAuth v4.24 + `@quikit/auth` middleware (OAuth/OIDC delegated to QuikIT IdP) |
| **Queue** | BullMQ 5.34 + ioredis 5.4.2 (Redis-backed); `npm run worker` runs the BullMQ consumer |
| **HTTP client** | axios 1.7.9 (server-side outbound), TanStack Query 5.28 (client-side fetching) |
| **Validation** | Zod 3.24.1 (every API route uses Zod) |
| **Realtime** | Server-Sent Events on `/api/leads/stream`, Redis pub/sub channel `quikcrm:leads:<tenantId>` |
| **Excel/CSV** | xlsx 0.18.5, in-house streaming CSV writer (`lib/services/reports/csv-stream.ts`) |
| **Phone** | libphonenumber-js 1.12.42 (E.164 normalisation in `lib/services/contacts/phone.ts`) |
| **Telephony providers** | IndiaVoice / RP Digital (primary); Twilio (legacy alias only) |
| **Charts** | recharts 2.13.3 |
| **Drag-and-drop** | @dnd-kit/* (kanban + opportunity pipeline) |
| **Workflow editor** | @xyflow/react 12.10.2 (React Flow) |
| **Crypto** | jose 5.9.6, jsonwebtoken 9.0.2, bcryptjs 2.4.3 |
| **Test framework** | Vitest 4.1.4, jsdom 25, vitest-mock-extended 4.0 |
| **Team lead / developer** | Alok Shukla (git author for current branch `feature/bugresolved-001`) |

**`@quikit/*` packages used** (all pinned to `*` so they always pull the workspace head):
- `@quikit/auth` — `createMiddleware`, `createOAuthClientOptions`, `createAuthOptions`
- `@quikit/database` — Prisma client + `Prisma` namespace re-export
- `@quikit/shared` — shared constants/utilities (no AI-specific exports used)
- `@quikit/ui` — shared UI components + Tailwind config (used by every page)

**Not yet installed:** `@quikit/ai-sdk`, `@quikit/search-sdk`, `@quikit/audit` (see §6, §7, §11).

**npm scripts** (from [package.json:5-16](package.json#L5-L16)):
```
dev        next dev -p 3009
prebuild   prisma generate --schema=../../packages/database/prisma/schema.prisma
build      next build
start      next start -p 3009
lint       next lint
typecheck  tsc --noEmit
test       vitest run
test:watch vitest
test:ui    vitest --ui
worker     tsx lib/queue/worker.ts
```

---

## Section 2 — Complete Prisma Schema

The Prisma schema is multi-schema (preview feature). The QuikCRM block lives in `packages/database/prisma/schema.prisma` between line 5385 and line 6520 under the `@@schema("app_quikcrm")` directive. Datasource config (lines 1-32):

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_DIRECT")
  schemas   = ["public", "app_quikscale", "app_quikconstruction", "app_quikvc", "app_quikcrm"]
}
```

### 2.1 Enums (verbatim)

```prisma
enum CrmOpportunityStage {
  Prospecting
  Qualification
  Proposal
  Negotiation
  ClosedWon
  ClosedLost
}

enum CrmTaskStatus {
  Open
  InProgress
  Completed
  Cancelled
}

enum CrmTaskPriority {
  Low
  Medium
  High
}

enum CrmAccountSegment {
  Enterprise
  MidMarket
  SMB
}

enum CrmImportJobStatus {
  queued
  processing
  completed
  completed_with_errors
  dead_letter
}

enum CrmImportEntityType {
  leads
  activities
  workflows
  sla
}

enum CrmAutomationStepStatus {
  pending
  processing
  completed
  failed
}

enum CrmWorkflowStatus {
  Draft
  Active
  Paused
  Archived
}
```

**Note:** `CrmLead.stage` and `CrmLead.status` are intentionally **free-text strings** validated at the API layer against the org's `leadPipelineConfig` — see [packages/database/prisma/schema.prisma:5381-5383](../../packages/database/prisma/schema.prisma#L5381-L5383).

### 2.2 Per-model audit table

| Model | tenantId | createdBy | deletedAt (soft delete) | @@schema | Indexes (key columns) |
|---|---|---|---|---|---|
| `CrmPermissionTemplate` | yes | implicit | no | app_quikcrm | `tenantId, name` (unique), `tenantId` |
| `CrmUserPermissionTemplate` | no (FK via template) | n/a | no | app_quikcrm | `(userId, templateId)` PK |
| `CrmUserAccountAccess` | no (FK via account) | n/a | no | app_quikcrm | `(userId, accountId)` PK |
| `CrmAccount` | yes | `createdByUserId` | **yes** | app_quikcrm | `tenantId, name/ownerId/status/deletedAt/parentAccountId/industryKey/segmentEnum` |
| `CrmContact` | yes | implicit | no | app_quikcrm | `tenantId, email/accountId/ownerId/phone` |
| `CrmLead` | yes | implicit | **yes** | app_quikcrm | `tenantId, stage/ownerId/accountId/isStarred/deletedAt`; `(tenantId, sourceSystem, externalId)` unique |
| `CrmLeadAttachment` | yes | `uploadedBy` | no | app_quikcrm | `tenantId, leadId` |
| `CrmLeadListView` | yes | `userId` | no | app_quikcrm | `tenantId, userId` |
| `CrmLeadSavedList` | yes | `userId` | no | app_quikcrm | `tenantId, userId` |
| `CrmLeadSource` | yes | implicit | no | app_quikcrm | `tenantId, name` (unique), `tenantId, active` |
| `CrmOpportunity` | yes | `createdByUserId` | **yes** | app_quikcrm | `tenantId, stage/accountId/ownerId/deletedAt` |
| `CrmOpportunityClientMeeting` | yes | implicit | no | app_quikcrm | `tenantId, opportunityId` |
| `CrmOpportunityProduct` | yes | implicit | no | app_quikcrm | `tenantId, opportunityId` |
| `CrmOpportunityStageTransition` | yes | `changedByUserId` | no | app_quikcrm | `tenantId, opportunityId, occurredAt` |
| `CrmActivity` | yes | implicit | (soft-orphan via `relatedOrphanedAt`) | app_quikcrm | `tenantId, relatedKind+relatedObjectId, ownerId+occurredAt, relatedOrphanedAt`; `(tenantId, sourceSystem, externalId)` unique |
| `CrmTask` | yes | implicit | no | app_quikcrm | `tenantId, assignedToUserId, status` |
| `CrmNote` | yes | `createdByUserId` | no | app_quikcrm | `tenantId, relatedKind, relatedObjectId` |
| `CrmCompanyProfile` | yes (`@unique`) | implicit | no | app_quikcrm | `tenantId` unique |
| `CrmOrgWorkspaceSettings` | yes (`@unique`) | implicit | no | app_quikcrm | `tenantId` unique |
| `CrmQuickFilter` | yes | `userId` | no | app_quikcrm | `tenantId, userId, module` |
| `CrmDashboardPin` | yes | `userId` | no | app_quikcrm | `(tenantId, userId, reportId)` unique |
| `CrmCampaign` | yes | implicit | no | app_quikcrm | `tenantId` |
| `CrmLandingPage` | yes | implicit | no | app_quikcrm | `(tenantId, slug)` unique, `tenantId` |
| `CrmWebWidget` | yes | implicit | no | app_quikcrm | `tenantId` |
| `CrmFormDefinition` | yes | implicit | no | app_quikcrm | `tenantId` |
| `CrmWorkflowDefinition` | yes | implicit | no | app_quikcrm | `tenantId, status`; `(tenantId, sourceSystem, externalId)` unique |
| `CrmAutomationPendingStep` | yes | implicit | no | app_quikcrm | `tenantId, status, resumeAt`; `tenantId, workflowId, leadId` |
| `CrmAutomationDistributionState` | yes | n/a | no | app_quikcrm | `(tenantId, workflowId, nodeId)` unique |
| `CrmProcessDefinition` | yes | implicit | no | app_quikcrm | `tenantId` |
| `CrmSlaRule` | yes | implicit | no | app_quikcrm | `(tenantId, sourceSystem, externalId)` unique, `tenantId` |
| `CrmSlaLeadTracking` | yes | implicit | no | app_quikcrm | `tenantId, leadId/status` |
| `CrmTelephonyProvider` | yes | implicit | no | app_quikcrm | `tenantId` |
| `CrmVirtualNumber` | yes | implicit | no | app_quikcrm | `(tenantId, number)` unique, `tenantId` |
| `CrmCallLog` | yes | `agentUserId` | no | app_quikcrm | `(tenantId, callSid)` unique, `tenantId, leadId, providerCallSid+createdAt` |
| `CrmCallDisposition` | yes | implicit | no | app_quikcrm | `(tenantId, code)` unique, `(tenantId, name)` unique |
| `CrmCtcCallAudit` | yes | `agentUserId` | no | app_quikcrm | `tenantId, agentUserId+createdAt` |
| `CrmIndiaVoiceWebhookLog` | yes | n/a | no | app_quikcrm | `(tenantId, processDedupeKey)` unique, `tenantId, callSid/campid` |
| `CrmLeadImportJob` | yes | `createdByUserId` | no | app_quikcrm | `(tenantId, entityType, sourceSystem, idempotencyKey)` unique, `tenantId, status, batchId, entityType+status+nextRetryAt` |
| `CrmReportDefinition` | yes | implicit | no | app_quikcrm | `tenantId` |
| `CrmNotification` | yes | n/a (per-user) | no | app_quikcrm | `tenantId, userId, readAt` |
| `CrmOutboundMessageLog` | yes | n/a | no | app_quikcrm | `tenantId` |
| `CrmAttendanceLog` | yes | n/a | no | app_quikcrm | `tenantId, userId` |
| `CrmSalesTeam` | yes | implicit | no | app_quikcrm | `(tenantId, name)` unique, `tenantId` |
| `CrmSalesGroup` | yes | implicit | no | app_quikcrm | `(tenantId, name)` unique, `tenantId` |
| `CrmSalesGroupMember` | no (FK via group) | n/a | no | app_quikcrm | `(groupId, userId)` PK |
| `CrmSalesGroupManager` | no (FK via group) | n/a | no | app_quikcrm | `(groupId, userId)` PK |
| `CrmSalesGroupAccount` | no (FK via group/account) | n/a | no | app_quikcrm | `(groupId, accountId)` PK |
| `CrmAuditLog` | yes | `userId` (nullable) | no | app_quikcrm | `tenantId+createdAt, tenantId+module+resourceId, tenantId+userId+createdAt` |
| `CrmIntegrationConfig` | yes | implicit | no | app_quikcrm | `(tenantId, name)` unique, `tenantId, status` |
| `CrmPaymentVerification` | yes | implicit | no | app_quikcrm | `tenantId, status` |

**Schema-contract observations** (against the App Contract):
- **Every model is `tenantId`-scoped** — no orphan models. ✅
- **Every model declares `@@schema("app_quikcrm")`** — namespacing is clean. ✅
- **`createdByUserId` is inconsistent** — `CrmAccount`, `CrmOpportunity`, `CrmLeadImportJob` have it as a column; most other models leave provenance to the audit/activity log (or to `ownerId`/`agentUserId`/`assignedToUserId`). **Not a contract violation but worth flagging if the AI Runtime needs uniform `createdBy` retrieval.**
- **Soft-delete is selective** — only `CrmLead`, `CrmAccount`, `CrmOpportunity` have `deletedAt`. Activities use `relatedOrphanedAt` instead (different semantics: the activity stays, the parent reference is marked dead). Tasks, Contacts, Notes, Call Logs, Notifications all hard-delete on DELETE. **AI tools that "delete" data must be told which entity is soft vs. hard.**
- **No cross-schema `@relation`** — `ownerId`, `agentUserId`, `assignedToUserId`, `userId`, `createdByUserId` are bare scalar `String` columns referencing `public.User.id`. Names are denormalised onto the row (`ownerName`, `assignedToUserName`, etc.) and kept in sync server-side via `deriveOwnerName()` ([apps/quikcrm/lib/services/accounts/index.ts](lib/services/accounts/index.ts) and [apps/quikcrm/lib/services/opportunities/opportunity-service.ts:21-29](lib/services/opportunities/opportunity-service.ts#L21-L29)).
- **`CrmCallLog.agentUserId` is the FK to `public.User`** (not `ownerId`) — owned-by-agent, see [apps/quikcrm/CLAUDE.md:60-62](CLAUDE.md#L60-L62).
- **`CrmAuditLog.module` is a free-text string** — Settings services write `"users"` / `"permission_templates"` / `"sales_groups"` / `"teams"`; lead change-log writes `"leads"`. **There's no central enum.** AI tools should use `"leads"`, `"accounts"`, `"contacts"`, `"opportunities"`, `"activities"`, `"tasks"`, `"users"`, `"permission_templates"`, `"sales_groups"`, `"teams"` per the existing call sites.

### 2.3 Model definitions (verbatim, enums excluded)

> The following block is the verbatim Prisma model definitions for the `app_quikcrm` schema (line 5462–6520 of `packages/database/prisma/schema.prisma`). Inline Prisma comments are stripped per the document plan; semantic comments documenting intent are kept inline. Enums and the `datasource` block are listed in §2.1 above.

```prisma
model CrmPermissionTemplate {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  matrix    Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  users     CrmUserPermissionTemplate[]
  @@unique([tenantId, name])
  @@index([tenantId])
  @@schema("app_quikcrm")
}

model CrmUserPermissionTemplate {
  userId     String
  templateId String
  template   CrmPermissionTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  @@id([userId, templateId])
  @@schema("app_quikcrm")
}

model CrmUserAccountAccess {
  userId    String
  accountId String
  account   CrmAccount @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@id([userId, accountId])
  @@schema("app_quikcrm")
}

model CrmAccount {
  id                    String   @id @default(cuid())
  tenantId              String
  name                  String
  segment               String?
  ownerId               String?
  ownerName             String?
  industry              String?
  website               String?
  city                  String?
  status                String?  @default("Active")
  annualRevenueDisplay  String?
  annualRevenueAmount   Decimal? @db.Decimal(18, 2)
  annualRevenueCurrency String?  @default("INR")
  segmentEnum           CrmAccountSegment?
  industryKey           String?
  countryCode           String?
  state                 String?
  postalCode            String?
  parentAccountId       String?
  healthScore           Int?
  contractStart         DateTime?
  contractEnd           DateTime?
  renewalDate           DateTime?
  npsScore              Int?
  deletedAt             DateTime?
  createdByUserId       String?
  createdAt             DateTime @default(now())
  updatedAt             DateTime @updatedAt
  parent                CrmAccount?            @relation("CrmAccountHierarchy", fields: [parentAccountId], references: [id])
  children              CrmAccount[]           @relation("CrmAccountHierarchy")
  contacts              CrmContact[]
  leads                 CrmLead[]
  opportunities         CrmOpportunity[]
  userAccess            CrmUserAccountAccess[]
  groupAccess           CrmSalesGroupAccount[]
  @@index([tenantId])
  @@index([tenantId, name])
  @@index([tenantId, ownerId])
  @@index([tenantId, status])
  @@index([tenantId, deletedAt])
  @@index([tenantId, parentAccountId])
  @@index([tenantId, industryKey])
  @@index([tenantId, segmentEnum])
  @@schema("app_quikcrm")
}

model CrmContact {
  id           String   @id @default(cuid())
  tenantId     String
  firstName    String
  lastName     String?
  email        String?
  phone        String?
  title        String?
  accountId    String?
  leadId       String?
  ownerId      String?
  ownerName    String?
  city         String?
  contactStage String?
  source       String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  account      CrmAccount? @relation(fields: [accountId], references: [id])
  lead         CrmLead?    @relation(fields: [leadId], references: [id])
  @@index([tenantId])
  @@index([tenantId, email])
  @@index([tenantId, accountId])
  @@index([tenantId, ownerId])
  @@index([tenantId, phone])
  @@schema("app_quikcrm")
}

model CrmLead {
  id               String    @id @default(cuid())
  tenantId         String
  name             String
  email            String?
  phone            String?
  mobile           String?
  company          String?
  jobTitle         String?
  source           String?
  stage            String    @default("New")
  status           String    @default("Open")
  substatus        String?
  score            Int       @default(0)
  ownerId          String?
  ownerName        String?
  accountId        String?
  linkedContactId  String?
  externalId       String?
  sourceSystem     String?
  country          String?
  industry         String?
  leadQuality      String?
  isDisengaged     Boolean   @default(false)
  isStarred        Boolean   @default(false)
  followupPriority String?
  addressLine1     String?
  addressLine2     String?
  area             String?
  cityName         String?
  stateName        String?
  postalCode       String?
  lat              Float?
  long             Float?
  convertedAt      DateTime?
  dynamicFields    Json?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime  @updatedAt
  deletedAt        DateTime?
  account          CrmAccount?          @relation(fields: [accountId], references: [id])
  attachments      CrmLeadAttachment[]
  contacts         CrmContact[]
  activities       CrmActivity[]
  tasks            CrmTask[]
  notes            CrmNote[]
  callLogs         CrmCallLog[]
  slaTracking      CrmSlaLeadTracking[]
  @@unique([tenantId, sourceSystem, externalId], name: "lead_external_uk")
  @@index([tenantId])
  @@index([tenantId, stage])
  @@index([tenantId, ownerId])
  @@index([tenantId, accountId])
  @@index([tenantId, isStarred])
  @@index([tenantId, deletedAt])
  @@schema("app_quikcrm")
}

model CrmLeadAttachment {
  id          String   @id @default(cuid())
  tenantId    String
  leadId      String
  fileName    String
  contentType String
  size        Int
  storageKey  String
  uploadedBy  String
  createdAt   DateTime @default(now())
  lead        CrmLead  @relation(fields: [leadId], references: [id], onDelete: Cascade)
  @@index([tenantId, leadId])
  @@schema("app_quikcrm")
}

model CrmLeadListView {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  name      String
  filters   Json
  isDefault Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([tenantId, userId])
  @@schema("app_quikcrm")
}

model CrmLeadSavedList {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  name      String
  filters   Json
  isDefault Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([tenantId, userId])
  @@schema("app_quikcrm")
}

model CrmLeadSource {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  type      String?
  active    Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([tenantId, name])
  @@index([tenantId])
  @@index([tenantId, active])
  @@schema("app_quikcrm")
}

model CrmOpportunity {
  id                  String              @id @default(cuid())
  tenantId            String
  name                String
  stage               CrmOpportunityStage @default(Prospecting)
  probability         Int                 @default(10)
  amount              Decimal?            @db.Decimal(18, 2)
  currency            String?             @default("INR")
  closeDate           DateTime?
  accountId           String?
  leadId              String?
  ownerId             String?
  ownerName           String?
  weightedAmount      Decimal?            @db.Decimal(18, 2)
  closeReason         String?
  closeReasonCategory String?
  competitorName      String?
  lastStageChangeAt   DateTime?
  lastActivityAt      DateTime?
  deletedAt           DateTime?
  createdByUserId     String?
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt
  account             CrmAccount?                     @relation(fields: [accountId], references: [id])
  clientMeetings      CrmOpportunityClientMeeting[]
  products            CrmOpportunityProduct[]
  transitions         CrmOpportunityStageTransition[]
  @@index([tenantId])
  @@index([tenantId, stage])
  @@index([tenantId, accountId])
  @@index([tenantId, ownerId])
  @@index([tenantId, deletedAt])
  @@schema("app_quikcrm")
}

model CrmOpportunityClientMeeting {
  id             String   @id @default(cuid())
  tenantId       String
  opportunityId  String
  subject        String
  meetingAt      DateTime
  meetingType    String?
  competitorName String?
  outcome        String?
  attendees      Json?
  notes          String?
  createdAt      DateTime @default(now())
  opportunity    CrmOpportunity @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  @@index([tenantId, opportunityId])
  @@schema("app_quikcrm")
}

model CrmOpportunityProduct {
  id            String   @id @default(cuid())
  tenantId      String
  opportunityId String
  productName   String
  quantity      Int      @default(1)
  unitPrice     Decimal  @db.Decimal(18, 2)
  discountPct   Int      @default(0)
  lineTotal     Decimal  @db.Decimal(18, 2)
  notes         String?
  sortOrder     Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  opportunity   CrmOpportunity @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  @@index([tenantId, opportunityId])
  @@schema("app_quikcrm")
}

model CrmOpportunityStageTransition {
  id                  String              @id @default(cuid())
  tenantId            String
  opportunityId       String
  fromStage           CrmOpportunityStage
  toStage             CrmOpportunityStage
  changedByUserId     String?
  changedByName       String?
  closeReason         String?
  closeReasonCategory String?
  notes               String?
  occurredAt          DateTime            @default(now())
  opportunity         CrmOpportunity @relation(fields: [opportunityId], references: [id], onDelete: Cascade)
  @@index([tenantId, opportunityId, occurredAt])
  @@schema("app_quikcrm")
}

model CrmActivity {
  id                String    @id @default(cuid())
  tenantId          String
  type              String
  relatedKind       String
  relatedObjectId   String
  subject           String?
  outcome           String?
  ownerId           String?
  ownerName         String?
  externalId        String?
  sourceSystem      String?
  occurredAt        DateTime?
  outreach          Json?
  activityCode      String?
  logOutcome        String?
  detailNotes       String?
  followUpAt        DateTime?
  opportunityId     String?
  linkedCallLogId   String?
  leadId            String?
  relatedOrphanedAt DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  lead              CrmLead?  @relation(fields: [leadId], references: [id])
  @@unique([tenantId, sourceSystem, externalId])
  @@index([tenantId])
  @@index([tenantId, relatedKind, relatedObjectId])
  @@index([tenantId, ownerId, occurredAt])
  @@index([tenantId, relatedOrphanedAt])
  @@schema("app_quikcrm")
}

model CrmTask {
  id               String          @id @default(cuid())
  tenantId         String
  subject          String
  taskType         String?
  priority         CrmTaskPriority @default(Medium)
  dueDate          DateTime?
  status           CrmTaskStatus   @default(Open)
  assignedToUserId String?
  relatedKind      String?
  relatedObjectId  String?
  leadId           String?
  createdAt        DateTime        @default(now())
  updatedAt        DateTime        @updatedAt
  lead             CrmLead? @relation(fields: [leadId], references: [id])
  @@index([tenantId])
  @@index([tenantId, assignedToUserId])
  @@index([tenantId, status])
  @@schema("app_quikcrm")
}

model CrmNote {
  id              String   @id @default(cuid())
  tenantId        String
  content         String
  relatedKind     String
  relatedObjectId String
  createdByUserId String?
  leadId          String?
  createdAt       DateTime @default(now())
  lead            CrmLead? @relation(fields: [leadId], references: [id])
  @@index([tenantId, relatedKind, relatedObjectId])
  @@schema("app_quikcrm")
}

model CrmCompanyProfile {
  id          String   @id @default(cuid())
  tenantId    String   @unique
  companyName String
  logoUrl     String?
  website     String?
  phone       String?
  industry    String?
  employees   String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@schema("app_quikcrm")
}

model CrmOrgWorkspaceSettings {
  id        String   @id @default(cuid())
  tenantId  String   @unique
  settings  Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@schema("app_quikcrm")
}

model CrmQuickFilter {
  id            String   @id @default(cuid())
  tenantId      String
  userId        String
  module        String
  name          String
  filterConfig  Json
  isLastApplied Boolean  @default(false)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([tenantId, userId, module])
  @@schema("app_quikcrm")
}

model CrmDashboardPin {
  id        String   @id @default(cuid())
  tenantId  String
  userId    String
  reportId  String
  sortOrder Int      @default(0)
  createdAt DateTime @default(now())
  @@unique([tenantId, userId, reportId])
  @@index([tenantId, userId])
  @@schema("app_quikcrm")
}

model CrmCampaign {
  id        String    @id @default(cuid())
  tenantId  String
  name      String
  status    String    @default("Draft")
  type      String?
  startDate DateTime?
  endDate   DateTime?
  config    Json?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  @@index([tenantId])
  @@schema("app_quikcrm")
}

model CrmLandingPage {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  slug      String
  status    String   @default("Draft")
  content   Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([tenantId, slug])
  @@index([tenantId])
  @@schema("app_quikcrm")
}

model CrmWebWidget {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  type      String
  config    Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([tenantId])
  @@schema("app_quikcrm")
}

model CrmFormDefinition {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  fields    Json
  config    Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([tenantId])
  @@schema("app_quikcrm")
}

model CrmWorkflowDefinition {
  id                String            @id @default(cuid())
  tenantId          String
  name              String
  status            CrmWorkflowStatus @default(Draft)
  triggerSummary    String?
  triggerType       String?
  scope             String?
  triggerCount      Int               @default(0)
  externalId        String?
  sourceSystem      String?
  lastPublishedOn   DateTime?
  graphNodes        Json
  graphEdges        Json
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  pendingSteps      CrmAutomationPendingStep[]
  distributionState CrmAutomationDistributionState[]
  @@unique([tenantId, sourceSystem, externalId])
  @@index([tenantId])
  @@index([tenantId, status])
  @@schema("app_quikcrm")
}

model CrmAutomationPendingStep {
  id            String                  @id @default(cuid())
  tenantId      String
  workflowId    String
  leadId        String
  resumeNodeId  String
  resumeAt      DateTime
  status        CrmAutomationStepStatus @default(pending)
  ownerSnapshot String?
  bullJobId     String?
  failedReason  String?
  createdAt     DateTime                @default(now())
  updatedAt     DateTime                @updatedAt
  workflow      CrmWorkflowDefinition @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  @@index([tenantId, status, resumeAt])
  @@index([tenantId, workflowId, leadId])
  @@schema("app_quikcrm")
}

model CrmAutomationDistributionState {
  id         String   @id @default(cuid())
  tenantId   String
  workflowId String
  nodeId     String
  lastIndex  Int      @default(0)
  updatedAt  DateTime @updatedAt
  workflow   CrmWorkflowDefinition @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  @@unique([tenantId, workflowId, nodeId])
  @@schema("app_quikcrm")
}

model CrmProcessDefinition {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  config    Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([tenantId])
  @@schema("app_quikcrm")
}

model CrmSlaRule {
  id           String   @id @default(cuid())
  tenantId     String
  name         String
  targetHours  Int
  appliesTo    String?
  externalId   String?
  sourceSystem String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  @@unique([tenantId, sourceSystem, externalId])
  @@index([tenantId])
  @@schema("app_quikcrm")
}

model CrmSlaLeadTracking {
  id            String    @id @default(cuid())
  tenantId      String
  leadId        String
  ruleName      String
  status        String
  breachAtLabel String?
  breachAt      DateTime?
  externalId    String?
  sourceSystem  String?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  lead          CrmLead @relation(fields: [leadId], references: [id], onDelete: Cascade)
  @@index([tenantId, leadId])
  @@index([tenantId, status])
  @@schema("app_quikcrm")
}

model CrmTelephonyProvider {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  type      String
  config    Json
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([tenantId])
  @@schema("app_quikcrm")
}

model CrmVirtualNumber {
  id         String   @id @default(cuid())
  tenantId   String
  number     String
  label      String?
  providerId String?
  createdAt  DateTime @default(now())
  @@unique([tenantId, number])
  @@index([tenantId])
  @@schema("app_quikcrm")
}

model CrmCallLog {
  id                           String    @id @default(cuid())
  tenantId                     String
  leadId                       String?
  agentUserId                  String?
  callSid                      String?
  sourceNumber                 String?
  destinationNumber            String?
  direction                    String?
  status                       String?
  durationSec                  Int?
  talkSec                      Int?
  startTime                    DateTime?
  endTime                      DateTime?
  recordingUrl                 String?
  disposition                  String?
  notes                        String?
  rawPayload                   Json?
  providerCallSid              String?
  dispositionName              String?
  callDispositionId            String?
  smbDispositionSnapshot       String?
  smbSubDispositionSnapshot    String?
  smbSubSubDispositionSnapshot String?
  ownerName                    String?
  linkedContactId              String?
  linkedPartyDisplay           String?
  webhookStatus                String?
  endedBy                      String?
  followUpAt                   DateTime?
  createdAt                    DateTime  @default(now())
  updatedAt                    DateTime  @updatedAt
  lead                         CrmLead?  @relation(fields: [leadId], references: [id])
  @@unique([tenantId, callSid])
  @@index([tenantId])
  @@index([tenantId, leadId])
  @@index([tenantId, providerCallSid, createdAt])
  @@schema("app_quikcrm")
}

model CrmCallDisposition {
  id                          String   @id @default(cuid())
  tenantId                    String
  code                        String
  label                       String
  category                    String?
  triggersPaymentVerification Boolean  @default(false)
  config                      Json?
  name                        String?
  smbDispositionValue         String?
  smbSubDispositionValue      String?
  smbSubSubDispositionValue   String?
  sortOrder                   Int      @default(0)
  targetLeadStage             String?
  createdAt                   DateTime @default(now())
  updatedAt                   DateTime @updatedAt
  @@unique([tenantId, code])
  @@unique([tenantId, name])
  @@index([tenantId])
  @@schema("app_quikcrm")
}

model CrmCtcCallAudit {
  id               String   @id @default(cuid())
  tenantId         String
  agentUserId      String?
  partyA           String?
  partyB           String?
  callSid          String?
  providerName     String?
  responseStatus   Int?
  providerType     String?
  message          String?
  success          Boolean  @default(false)
  httpStatus       Int?
  errorMessage     String?  @db.Text
  providerResponse String?  @db.Text
  kind             String?
  createdAt        DateTime @default(now())
  @@index([tenantId])
  @@index([tenantId, agentUserId, createdAt])
  @@schema("app_quikcrm")
}

model CrmIndiaVoiceWebhookLog {
  id                String    @id @default(cuid())
  tenantId          String
  callSid           String?
  campid            String?
  vendorEventType   String?
  sourceNumber      String?
  destinationNumber String?
  dialWhomNumber    String?
  status            String?
  callDurationSec   Int?
  talkDurationSec   Int?
  coins             Int?
  direction         String?
  callRecordingUrl  String?
  startTime         DateTime?
  endTime           DateTime?
  matchedCallLogId  String?
  rawPayload        Json
  processDedupeKey  String?
  createdAt         DateTime  @default(now())
  @@unique([tenantId, processDedupeKey])
  @@index([tenantId])
  @@index([tenantId, callSid])
  @@index([tenantId, campid])
  @@schema("app_quikcrm")
}

model CrmLeadImportJob {
  id              String              @id @default(cuid())
  tenantId        String
  fileName        String?
  status          CrmImportJobStatus  @default(queued)
  entityType      CrmImportEntityType
  sourceType      String?
  totalRows       Int                 @default(0)
  importedCount   Int                 @default(0)
  errorMessages   Json?
  rowErrors       Json?
  payloadCsvText  String?             @db.Text
  payloadJsonText String?             @db.Text
  sourceSystem    String?
  idempotencyKey  String?
  batchId         String?
  attempts        Int                 @default(0)
  createdByUserId String?
  queuedAt        DateTime?
  startedAt       DateTime?
  completedAt     DateTime?
  nextRetryAt     DateTime?
  deadLetteredAt  DateTime?
  lastError       String?
  bullJobId       String?
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  @@unique([tenantId, entityType, sourceSystem, idempotencyKey])
  @@index([tenantId])
  @@index([tenantId, status])
  @@index([tenantId, batchId])
  @@index([tenantId, entityType, status, nextRetryAt])
  @@schema("app_quikcrm")
}

model CrmReportDefinition {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  category  String?
  config    Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([tenantId])
  @@schema("app_quikcrm")
}

model CrmNotification {
  id        String    @id @default(cuid())
  tenantId  String
  userId    String
  title     String
  body      String?
  category  String?
  link      String?
  readAt    DateTime?
  metadata  Json?
  createdAt DateTime  @default(now())
  @@index([tenantId, userId, readAt])
  @@schema("app_quikcrm")
}

model CrmOutboundMessageLog {
  id        String    @id @default(cuid())
  tenantId  String
  channel   String
  to        String
  subject   String?
  body      String?
  status    String    @default("queued")
  metadata  Json?
  sentAt    DateTime?
  createdAt DateTime  @default(now())
  @@index([tenantId])
  @@schema("app_quikcrm")
}

model CrmAttendanceLog {
  id        String    @id @default(cuid())
  tenantId  String
  userId    String
  checkIn   DateTime
  checkOut  DateTime?
  metadata  Json?
  createdAt DateTime  @default(now())
  @@index([tenantId, userId])
  @@schema("app_quikcrm")
}

model CrmSalesTeam {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  managerId String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([tenantId, name])
  @@index([tenantId])
  @@schema("app_quikcrm")
}

model CrmSalesGroup {
  id        String   @id @default(cuid())
  tenantId  String
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  members   CrmSalesGroupMember[]
  managers  CrmSalesGroupManager[]
  accounts  CrmSalesGroupAccount[]
  @@unique([tenantId, name])
  @@index([tenantId])
  @@schema("app_quikcrm")
}

model CrmSalesGroupMember {
  groupId String
  userId  String
  group   CrmSalesGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  @@id([groupId, userId])
  @@schema("app_quikcrm")
}

model CrmSalesGroupManager {
  groupId String
  userId  String
  group   CrmSalesGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  @@id([groupId, userId])
  @@schema("app_quikcrm")
}

model CrmSalesGroupAccount {
  groupId   String
  accountId String
  group     CrmSalesGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  account   CrmAccount    @relation(fields: [accountId], references: [id], onDelete: Cascade)
  @@id([groupId, accountId])
  @@schema("app_quikcrm")
}

model CrmAuditLog {
  id         String   @id @default(cuid())
  tenantId   String
  userId     String?
  module     String
  action     String
  resourceId String?
  before     Json?
  after      Json?
  metadata   Json?
  createdAt  DateTime @default(now())
  @@index([tenantId, createdAt])
  @@index([tenantId, module, resourceId])
  @@index([tenantId, userId, createdAt])
  @@schema("app_quikcrm")
}

model CrmIntegrationConfig {
  id                   String    @id @default(cuid())
  tenantId             String
  name                 String
  type                 String
  status               String    @default("inactive")
  credentialsEncrypted String?
  config               Json?
  lastSyncAt           DateTime?
  lastError            String?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
  @@unique([tenantId, name])
  @@index([tenantId, status])
  @@schema("app_quikcrm")
}

model CrmPaymentVerification {
  id         String   @id @default(cuid())
  tenantId   String
  leadId     String?
  callLogId  String?
  amount     Float
  currency   String   @default("INR")
  status     String   @default("Pending")
  externalId String?
  metadata   Json?
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
  @@index([tenantId, status])
  @@schema("app_quikcrm")
}
```

---

## Section 3 — Complete API Endpoint Inventory

This section enumerates every `route.ts` under `apps/quikcrm/app/api/`. All routes use `runtime = "nodejs"`. Total file count: **117** route files (verified via `Glob("apps/quikcrm/app/api/**/route.ts")`).

**Common patterns** (apply unless noted otherwise per route):
- **Auth wrapper**: `requireApiUser()` (returns `SessionUser` or 401 `NextResponse`). The `withTenantAuth` HOF exists at [lib/api/withTenantAuth.ts](lib/api/withTenantAuth.ts) but is **not yet used by any route** — every route inlines `requireApiUser() + isResponse() + assertModule()`. Mention this if any P0 work refactors to the wrapper.
- **Tenant filter**: every Prisma query passes `tenantId: user.tenantId` in the `where` clause. Cross-tenant access returns 404 (not 403) to avoid existence disclosure.
- **Error response**: `errorResponse(e)` from [lib/auth/require.ts:70-76](lib/auth/require.ts#L70-L76) returns `{ error: string }` with status from `error.statusCode` or 500. **Note**: shape varies — `{ error }`, `{ error, errors }`, `{ success: false, error }`, `{ success: false, error, fieldErrors }`. Newer routes use the `{ success, data }` envelope per the root CLAUDE.md mandate; older lead/account routes return raw objects. The AI Runtime tool executor must tolerate **both shapes**. See §16.
- **Validation**: every POST/PATCH/PUT runs the request body through a Zod schema. Validation failures return HTTP 400 with `{ error: "Validation failed", errors: <flatten().fieldErrors> }`.
- **Permission gate**: most routes call `await assertModule(user, "<module>", "<action>")` from [lib/auth/permissions.ts:106-124](lib/auth/permissions.ts#L106-L124); Settings routes use `requirePermission(user, "<module>", "<action>")` from [lib/auth/require-permission.ts:23-30](lib/auth/require-permission.ts#L23-L30) (functionally identical wrapper).
- **No audit log on mutations** *except*: lead changes go via `recordLeadChange()` (writes `CrmAuditLog` with `module="leads"`); settings services call the central `audit()` helper. Account/Opportunity/Activity/Task mutations write `CrmActivity` rows instead — that is the change log surface for those entities, **not** `CrmAuditLog`.
- **No search index events**: no route calls `@quikit/search-sdk` or any indexing primitive.

### 3.1 Auth & health

| Method | Path | File | Permission | Notes |
|---|---|---|---|---|
| GET, POST | `/api/auth/[...nextauth]` | `auth/[...nextauth]/route.ts` | public (NextAuth) | Delegates to QuikIT IdP via `createOAuthClientOptions`. Don't customise here. |
| GET | `/api/health` | `health/route.ts` | **public** (no auth) | Postgres `SELECT 1` + Redis PING. Returns `{ ok, checks: { postgres, redis } }` 200 or 503. |
| GET, POST | `/api` | `route.ts` | public (webhook secret only) | Short-URL fallback for IndiaVoice panels — re-exports `/api/telephony/india-voice/webhook` GET+POST. |

### 3.2 Leads (`/api/leads/*`)

#### `GET /api/leads`
- File: [app/api/leads/route.ts:37-124](app/api/leads/route.ts#L37-L124)
- Permission: `leads:view`
- Query (Zod, [lib/validators/lead.ts:80-90](lib/validators/lead.ts#L80-L90)):
  ```
  page          number (default 1)
  pageSize      number (10|25|50|100, default 10)
  q             string (search across name/email/company)
  stage         string
  status        string
  ownerId       string
  isStarred     boolean (coerced)
  sortBy        string (default "createdAt")
  sortDir       "asc"|"desc" (default "desc")
  ```
- Special params: `?onlyDeleted=true` → trash only; `?includeDeleted=true` → both; `?format=csv` or `?format=xlsx` → streamed export via `dispatchExport()`.
- ACL: `accountScopeFilter(user)` — restricts to allowed accounts when caller is non-admin.
- Field masking: each row passed through `maskHiddenLeadFields(user, l)` per the user's permission template `hiddenFields[]`.
- Response: `{ items, total, page, pageSize, totalPages }`.
- 400 / 401 / 403 / 500.

#### `POST /api/leads`
- File: [app/api/leads/route.ts:126-236](app/api/leads/route.ts#L126-L236)
- Permission: `leads:create`
- Body (Zod, [lib/validators/lead.ts:27-61](lib/validators/lead.ts#L27-L61)):
  ```
  name          string  (1..200) REQUIRED
  email         string  (email)  REQUIRED
  phone         string  (E.164 ^\+\d{7,15}$, optional)
  mobile        string  (E.164)  REQUIRED
  company       string?
  jobTitle      string?
  source        string  default "Web"
  stage         string  default "New"     (validated against pipelineConfig.stages)
  status        string  default "Open"    (validated against pipelineConfig.statuses)
  score         number  0..100
  ownerId       string?  (one of ownerId / ownerName REQUIRED)
  ownerName     string?
  accountId     string?
  country, industry, leadQuality, externalId, sourceSystem  string?
  isStarred     boolean
  followupPriority "Low"|"Medium"|"High"
  dynamicFields Record<string, unknown>
  ```
- ACL: `assertAccountAccess(user, accountId)` if `accountId` present.
- Duplicate check: `findDuplicateLead({ email, mobile, phone })` → 409 `{ error: "A lead with this <field> already exists.", errors: { [field]: "Already in use" } }`.
- Pipeline-rule check: rejects unknown stage/status, rejects stage not allowed for source, rejects status not allowed for stage (400).
- Dynamic field validation: against the org's `LeadFieldDefinition[]` (see §14).
- Side effects (non-blocking): `onLeadCreated()` BullMQ trigger, `createDefaultTaskForLead()`, `publishLeadEvent({type: "created"})` to Redis.
- Audit: `recordLeadChange({ action: "CREATE" })` writes `CrmAuditLog` row with `module="leads"`.
- Response: 201 with the full Lead row.

#### `GET /api/leads/[id]`
- File: [app/api/leads/[id]/route.ts:16-34](app/api/leads/[id]/route.ts#L16-L34)
- Permission: `leads:view`. ACL via `assertAccountAccess`. Field-masked.
- Returns `findUnique` (bypasses soft-delete middleware so deleted leads viewable in read-only mode). 404 on cross-tenant or missing.

#### `PATCH /api/leads/[id]`
- File: [app/api/leads/[id]/route.ts:36-113](app/api/leads/[id]/route.ts#L36-L113)
- Permission: `leads:edit`. ACL on existing AND new accountId.
- Body: `updateLeadSchema = createLeadSchema.partial()`.
- 410 if lead is in trash.
- `dynamicFields`: merges incoming over existing, validates against defs (with `requireMissing: false`).
- Restricted-field filtering via `filterRestrictedLeadFields(user, payload)`.
- Audit: `recordLeadChange({ action: "UPDATE" })` (only writes if a tracked field changed; see [lib/services/leads/change-log.ts:13-34](lib/services/leads/change-log.ts#L13-L34) for `TRACKED_FIELDS`).
- Side effects: `onLeadUpdated()` automation trigger + `publishLeadEvent({type: "updated"})`.

#### `DELETE /api/leads/[id]`
- File: [app/api/leads/[id]/route.ts:115-157](app/api/leads/[id]/route.ts#L115-L157)
- Permission: `leads:delete`.
- **Soft delete only** — sets `deletedAt = now()`. Idempotent: re-deleting trashed lead returns `{ ok: true, alreadyDeleted: true }`.
- Audit: `recordLeadChange({ action: "DELETE" })`. Realtime: `publishLeadEvent({type: "deleted"})`.

#### `POST /api/leads/[id]/restore`
- File: [app/api/leads/[id]/restore/route.ts](app/api/leads/[id]/restore/route.ts)
- Permission: `leads:delete` (symmetric — same gate as soft-delete).
- Idempotent: returns `{ ok: true, alreadyActive: true }` if not in trash.
- Audit: `recordLeadChange({ action: "RESTORE" })`.

#### `DELETE /api/leads/[id]/permanent`
- File: [app/api/leads/[id]/permanent/route.ts](app/api/leads/[id]/permanent/route.ts)
- Permission: **Administrator role only** (hard-coded role check, not the matrix).
- Pre-condition: lead must already be soft-deleted (`deletedAt != null`); otherwise 409 `"Lead is not in trash..."`.
- Cascades: hard-deletes the row (FK cascade clears attachments/notes/activities/tasks/callLogs/SLA tracking). Activities are soft-orphaned via `relatedOrphanedAt = now()` so the audit trail survives.
- Audit: `recordLeadChange({ action: "PERMANENT_DELETE" })`.

#### `GET /api/leads/[id]/full`
- File: [app/api/leads/[id]/full/route.ts](app/api/leads/[id]/full/route.ts)
- Permission: `leads:view`.
- Returns aggregated payload from [lib/services/leads/full-record.ts:14-70](lib/services/leads/full-record.ts#L14-L70):
  ```
  { lead, activities[50], tasks[50], notes[50], opportunities[50], callLogs[50], attachments[*] }
  ```
- Lead is field-masked. **This is the closest thing to a "summary endpoint" QuikCRM has today**, but it returns the full record + all related — not a summary suitable for AI prompt context (too verbose). See §5.

#### `POST /api/leads/[id]/convert`
- File: [app/api/leads/[id]/convert/route.ts](app/api/leads/[id]/convert/route.ts)
- Permission: `leads:edit`. ACL on lead's accountId.
- Body: `{ createContact: boolean (default true), createOpportunity: boolean (default false), opportunityTitle?: string, opportunityAmount?: number }`.
- 409 if `lead.linkedContactId` already set (already converted).
- Transaction: creates account if missing (from `lead.company`), creates contact, optionally creates opportunity (stage=Prospecting), updates lead `status="Converted"` + `convertedAt + linkedContactId`.
- Response: `{ lead, contactId, opportunityId, accountId }`.

#### `POST /api/leads/[id]/transition`
- File: [app/api/leads/[id]/transition/route.ts](app/api/leads/[id]/transition/route.ts)
- Permission: `leads:edit`. 410 if in trash.
- Body: `{ stage?: string, status?: string, substatus?: string|null, dispositionData?: Record<string, unknown> }`.
- Realtime: `publishLeadEvent({type: "transitioned", fromStage, stage})`.
- Automation trigger: `onLeadUpdated()`.
- **No audit row written** — transition is captured by the realtime event only. Inconsistent with other lead mutations.

#### `PATCH /api/leads/[id]/favorite`
- File: [app/api/leads/[id]/favorite/route.ts](app/api/leads/[id]/favorite/route.ts)
- Permission: `leads:edit`.
- Body: `{ isStarred: boolean }`.
- Returns `{ ok: true, isStarred }`.

#### `GET /api/leads/[id]/changelog`
- File: [app/api/leads/[id]/changelog/route.ts](app/api/leads/[id]/changelog/route.ts)
- Permission: `leads:view`.
- Query: `from?, to? (ISO datetime), userId?, field?, action? (CREATE|UPDATE|DELETE|RESTORE|PERMANENT_DELETE), page (1+), pageSize (1..200, default 50)`.
- Response: `{ success: true, data: { items: ChangeLogEntry[], total, page, pageSize } }`.
- `ChangeLogEntry`: `{ id, action, userId, userName, resourceId, before, after, resolved: { ownerId/accountId/linkedContactId: { before, after } }, fields[], createdAt }`.
- Backfills user/account/contact names from related Prisma reads — useful pattern for AI agent UI.

#### `POST /api/leads/filter`
- File: [app/api/leads/filter/route.ts](app/api/leads/filter/route.ts)
- Permission: `leads:view`.
- Body (Zod, [lib/validators/lead-filter.ts:48-54](lib/validators/lead-filter.ts#L48-L54)):
  ```
  filter: { matchMode: "ALL"|"ANY", conditions: ConditionRow[] }
  page, pageSize, sortBy (default "createdAt"), sortDir
  ```
  `ConditionRow`: `{ field: string, operator: "eq"|"neq"|"contains"|"notContains"|"startsWith"|"endsWith"|"isEmpty"|"isNotEmpty"|"gt"|"gte"|"lt"|"lte"|"between"|"before"|"after"|"on"|"in"|"notIn"|"isTrue"|"isFalse", value?: any, valueTo?: any }`
- Custom dynamic-field filtering supported via `translateFilterToPrismaWhere(filter, customDefs)`.
- Trash flag via `?onlyDeleted=true`.
- Sortable keys: createdAt, updatedAt, name, email, phone, mobile, company, jobTitle, source, stage, status, score, ownerName.

#### `GET, POST /api/leads/saved-views`
- File: [app/api/leads/saved-views/route.ts](app/api/leads/saved-views/route.ts)
- Permission: implicit (per-user, no module gate). Filtered by `tenantId, userId`.
- POST body: `{ name (1..120), filter: FilterPayload, isDefault?: boolean }`. If `isDefault`, clears other defaults in transaction.
- Response: `{ id, name, filter, isDefault, createdAt, updatedAt }` (201 on POST).

#### `PATCH, DELETE /api/leads/saved-views/[viewId]`
- File: [app/api/leads/saved-views/[viewId]/route.ts](app/api/leads/saved-views/[viewId]/route.ts)
- Per-user ownership check inside transaction. 404 if not owned.

#### `GET /api/leads/saved-views/counts`
- File: [app/api/leads/saved-views/counts/route.ts](app/api/leads/saved-views/counts/route.ts)
- Returns `{ counts: { [viewId]: number } }` — runs each saved view's filter and counts.

#### `GET /api/leads/sources`
- File: [app/api/leads/sources/route.ts](app/api/leads/sources/route.ts)
- No explicit module permission. Default filters to `active: true` unless `?includeInactive=true`.
- Returns `{ items: CrmLeadSource[] }`.

#### `POST /api/leads/sources`
- Body: `{ name (1..120), type?: string|null, active?: boolean }`. 409 on case-insensitive duplicate name.

#### `PATCH, DELETE /api/leads/sources/[id]`
- File: [app/api/leads/sources/[id]/route.ts](app/api/leads/sources/[id]/route.ts)
- PATCH body: partial of create. 409 on rename collision.

#### `GET /api/leads/stages`
- File: [app/api/leads/stages/route.ts](app/api/leads/stages/route.ts)
- Returns `{ stages }` — from `crmOrgWorkspaceSettings.settings.leadPipelineConfig.stages` or DEFAULT (`["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"]`).

#### `GET /api/leads/picker`
- File: [app/api/leads/picker/route.ts](app/api/leads/picker/route.ts)
- Permission: `leads:view`. ACL applied.
- Query: `q?: string, limit?: number (1..100, default 25)`.
- Response: `{ success: true, data: { items: { id, name, company }[] } }`.

#### `GET /api/leads/kanban/board`
- File: [app/api/leads/kanban/board/route.ts](app/api/leads/kanban/board/route.ts)
- Permission: `leads:view`. `dynamic = "force-dynamic"`, `revalidate = 0`, `Cache-Control: no-store`.
- Query: `perStage (default 100, max 500), ownerName?, stage?`.
- Response: `{ buckets: { stage, total, items[] }[] }`.

#### `GET /api/leads/stream` (Server-Sent Events)
- File: [app/api/leads/stream/route.ts](app/api/leads/stream/route.ts)
- Permission: `leads:view`. **503 if Redis disabled**.
- Subscribes to `quikcrm:leads:<tenantId>` and forwards each publish as SSE `event: lead`. 25s heartbeat. Client cleanup via `req.signal`.
- **Note**: Vercel function timeout (10s/60s/900s) caps the long-poll. EventSource auto-reconnects.

### 3.3 Contacts (`/api/contacts/*`)

#### `GET /api/contacts`
- File: [app/api/contacts/route.ts:52-126](app/api/contacts/route.ts#L52-L126)
- Permission: `contacts:view`. ACL via `accountScopeFilter`.
- Query: `page, pageSize, q?, accountId?, ownerId?, sortBy (default "createdAt"), sortDir`.
- `?format=csv|xlsx` for export.
- Response: `{ success: true, data: { items, total, page, pageSize, totalPages } }`.
- Sortable: `createdAt, updatedAt, firstName, lastName, email, phone, title, ownerName`.

#### `POST /api/contacts`
- Body (Zod, [lib/validators/contact.ts:16-40](lib/validators/contact.ts#L16-L40)):
  ```
  firstName     string  (regex letters/spaces/dots/hyphens/apostrophes, 1..60) REQUIRED
  lastName      same regex REQUIRED
  email         email (≤200)
  phone         max 40 chars, regex ^[+\d()\-\s]{0,40}$
  title         string?
  accountId, leadId, ownerId  string?
  city, contactStage, source  string?
  ```
- Permission: `contacts:create`. ACL on accountId.
- Duplicate check on email → 409 `{ existingId }`.
- Phone normalised via `normalisePhoneE164`.
- Owner resolved via `resolveOwnerForTenant` (denormalises `ownerName`).
- Account name attached to response via `attachAccountNames`.

#### `GET, PATCH, DELETE /api/contacts/[id]`
- File: [app/api/contacts/[id]/route.ts](app/api/contacts/[id]/route.ts)
- Permissions: `contacts:view|edit|delete`.
- DELETE cascades: every Lead with `linkedContactId == this id` OR `existing.leadId == lead.id` is reset (`status="Open", convertedAt=null, linkedContactId=null`) inside transaction.

#### `POST /api/contacts/filter`
- File: [app/api/contacts/filter/route.ts](app/api/contacts/filter/route.ts)
- Permission: `contacts:view`. Same filter DSL as leads (no custom-field support).

#### `GET /api/contacts/picker`
- File: [app/api/contacts/picker/route.ts](app/api/contacts/picker/route.ts)
- Permission: `contacts:view`. Returns `{ items: { id, name (composed), email }[] }`.

### 3.4 Accounts (`/api/accounts/*`)

#### `GET /api/accounts`
- File: [app/api/accounts/route.ts:47-134](app/api/accounts/route.ts#L47-L134)
- Permission: `accounts:view`.
- Query (Zod, [lib/validators/account.ts:79-89](lib/validators/account.ts#L79-L89)): `search?, page, pageSize, trashed (boolean), view ("all"|"mine")`.
- ACL: scope-based (returns empty page if scope is empty allow-list). `?trashed=true` is **admin-only** (returns empty page for non-admins, not 403 — defence-in-depth).
- Sort: `view=mine` → `renewalDate ASC NULLS LAST, name ASC`; otherwise `name ASC, id DESC`.
- `?format=csv|xlsx` export.
- Response: `{ data: AccountRow[], total, page, pageSize, totalPages }`.

#### `POST /api/accounts`
- Permission: `accounts:create`. **403 if caller is ACL-restricted** (non-admin with allow-list).
- Body (Zod, [lib/validators/account.ts:35-77](lib/validators/account.ts#L35-L77)):
  ```
  name (1..300) REQUIRED
  segment, ownerId, industry, city  string?
  segmentEnum  "Enterprise"|"MidMarket"|"SMB"
  website  URL string (regex)
  status  "Active"|"Prospect"|"Inactive"
  annualRevenueDisplay  string
  annualRevenueAmount  number coerced
  annualRevenueCurrency  ISO 4217 (^[A-Z]{3}$)
  countryCode  ISO 3166-1 alpha-2
  state, postalCode  string
  parentAccountId  string
  healthScore  0..100
  contractStart, contractEnd, renewalDate  date
  npsScore  -100..100
  ```
- Server derives `ownerName` via `deriveOwnerName(ownerId)` (looks up `public.User`).
- Server backfills `annualRevenueAmount/Currency` from `annualRevenueDisplay` if amount missing.
- Server slugifies `industry` → `industryKey`, syncs `segment` text from `segmentEnum`.
- Writes `CrmActivity` "Account created" row.
- Response: 201 + `AccountRow`.

#### `GET, PATCH, DELETE /api/accounts/[id]`
- File: [app/api/accounts/[id]/route.ts](app/api/accounts/[id]/route.ts)
- Permissions: `accounts:view|edit|delete`. ACL via `assertAccountAccess`.
- PATCH derives ownerName on owner change, recomputes display revenue, slugifies industry, validates `parentAccountId` (no cycles via `assertNoParentCycle`), writes a `CrmActivity` "AccountChange" row in same transaction.
- DELETE is **soft delete** (`deletedAt = now()`) plus an "Soft-deleted (moved to trash)" activity row.

#### `POST /api/accounts/[id]/restore`
- File: [app/api/accounts/[id]/restore/route.ts](app/api/accounts/[id]/restore/route.ts)
- Permission: `accounts:delete` (symmetric).
- Writes "Restored from trash" activity row.

#### `GET /api/accounts/[id]/leads`
- File: [app/api/accounts/[id]/leads/route.ts](app/api/accounts/[id]/leads/route.ts)
- Permission: `accounts:view` AND `leads:view`. ACL on the parent account.
- Query: `page (1+), limit (1..200, default 100)`.
- Response: `{ items: { id, name, stage, status, owner (name), ownerId, email, phone, mobile, score }[], total, page, limit }`.

#### `POST /api/accounts/[id]/leads/bulk-assign`
- File: [app/api/accounts/[id]/leads/bulk-assign/route.ts](app/api/accounts/[id]/leads/bulk-assign/route.ts)
- Permission: `accounts:edit` AND `leads:edit`. ACL on account.
- Body (Zod, [lib/validators/account.ts:129-132](lib/validators/account.ts#L129-L132)): `{ leadIds: string[] (1..500), ownerId: string }`.
- Single-transaction `updateMany` + one `BulkOwnershipChange` activity row.
- Response: `{ ok: true, updated: <count> }`.

#### `POST /api/accounts/filter`
- File: [app/api/accounts/filter/route.ts](app/api/accounts/filter/route.ts)
- Permission: `accounts:view`. Body schema [lib/validators/account.ts:120-127](lib/validators/account.ts#L120-L127): `{ conditions: [{ field, operator (eq|ne|contains|startsWith|endsWith|in|notIn|gt|gte|lt|lte|between|isNull|notNull), value?, values? }], combinator: "AND"|"OR" (default AND), page, pageSize, topLevelOnly?: boolean }`.

#### `GET /api/accounts/picker`
- File: [app/api/accounts/picker/route.ts](app/api/accounts/picker/route.ts)
- Permission: `accounts:view`. ACL applied. Returns `{ items: { id, name }[] }`.

#### `GET /api/accounts/health-summary`
- File: [app/api/accounts/health-summary/route.ts](app/api/accounts/health-summary/route.ts)
- Permission: `accounts:view`.
- Query: `ownerId?, segment? ("Enterprise"|"MidMarket"|"SMB"), healthLt? 0..100`.
- Response: `{ red, amber, green, total, renewing30d, renewing90d, byStatus: { Active, Prospect, Inactive } }`.
- Health buckets: red `<40`, amber `40..69`, green `≥70`. Renewal windows: next 30 / next 90 days.

#### `GET /api/accounts/acl-scope`
- File: [app/api/accounts/acl-scope/route.ts](app/api/accounts/acl-scope/route.ts)
- Returns `{ unrestricted: true }` or `{ unrestricted: false, count }`. Used by the ACL banner UI.

### 3.5 Opportunities (`/api/opportunities/*`)

#### `GET /api/opportunities`
- File: [app/api/opportunities/route.ts:37-126](app/api/opportunities/route.ts#L37-L126)
- Permission: `opportunities:view`. ACL via `accountScopeFilter`.
- Query (Zod, [lib/services/opportunities/validators.ts:76-87](lib/services/opportunities/validators.ts#L76-L87)): `page, pageSize, trashed?, stage? (CrmOpportunityStage), ownerId?, accountId?, q?`.
- `?format=csv|xlsx` export.
- Response items decorate each row with `amount` (Decimal→number), `weightedAmount`, `amountDisplay` (formatted via Intl).
- Response envelope: `{ success: true, data: { items, total, page, pageSize, totalPages } }`.

#### `POST /api/opportunities`
- Permission: `opportunities:create`. ACL on accountId.
- Body: `{ name (1..300), accountId REQUIRED, leadId?, stage?, amount?, currency? (ISO 4217), probability? 0..100, closeDate? ISO datetime, ownerId? }`.
- Returns 201 + created row.

#### `GET, PATCH, DELETE /api/opportunities/[id]`
- File: [app/api/opportunities/[id]/route.ts](app/api/opportunities/[id]/route.ts)
- Permissions: `opportunities:view|edit|delete`. ACL on account.
- PATCH **rejects** any body with a `stage` field — must use the `/transition` endpoint (400). Body uses `.strict()` schema → unknown keys also reject.
- DELETE is **soft delete** via `softDelete()` service.

#### `POST /api/opportunities/[id]/transition`
- File: [app/api/opportunities/[id]/transition/route.ts](app/api/opportunities/[id]/transition/route.ts)
- Permission: `opportunities:edit`. ACL.
- Body: `{ toStage (CrmOpportunityStage), closeReason?, closeReasonCategory?, notes? }`.
- Query `?force=true` — admin-only, lets reopening from terminal stages.
- `validateTransition()` enforces business rules. `recordTransition()` writes a `CrmOpportunityStageTransition` row inside the transaction.
- Sets `lastStageChangeAt`, and (when closing) `closeReason` + `closeReasonCategory`.

#### `POST /api/opportunities/[id]/restore`
- File: [app/api/opportunities/[id]/restore/route.ts](app/api/opportunities/[id]/restore/route.ts)
- Permission: `opportunities:delete`. 400 if not in trash.

#### `GET /api/opportunities/[id]/detail`
- File: [app/api/opportunities/[id]/detail/route.ts](app/api/opportunities/[id]/detail/route.ts)
- Permission: `opportunities:view`. Returns `opp + account + clientMeetings (50) + products + transitions (30)` with Decimal→number coercion. Closest to a "summary endpoint" for opportunities.

#### `GET, POST /api/opportunities/[id]/products`
- File: [app/api/opportunities/[id]/products/route.ts](app/api/opportunities/[id]/products/route.ts)
- Permission: `opportunities:view` (GET) / `opportunities:edit` (POST). ACL.
- POST body: `{ productName (1..200), quantity (≥1), unitPrice (≥0), discountPct 0..100 default 0, notes? (≤1000), sortOrder? }`.
- Server computes `lineTotal = qty × unitPrice × (1 - discountPct/100)`.
- `PUT /api/opportunities/[id]/products?recalc=true` triggers Σ lineTotal → opp.amount sync.

#### `PATCH, DELETE /api/opportunities/[id]/products/[productId]`
- File: [app/api/opportunities/[id]/products/[productId]/route.ts](app/api/opportunities/[id]/products/[productId]/route.ts)
- PATCH body `.strict()`. Recomputes lineTotal from merged values.

#### `GET, POST /api/opportunities/[id]/client-meetings`
- File: [app/api/opportunities/[id]/client-meetings/route.ts](app/api/opportunities/[id]/client-meetings/route.ts)
- POST body: `{ subject (1..300), meetingAt ISO datetime, meetingType?, competitorName?, outcome?, attendees? (any JSON), notes? (≤5000) }`.
- Transaction: creates meeting + writes `CrmActivity` "OpportunityClientMeeting" row + touches `opp.lastActivityAt`.

#### `GET /api/opportunities/by-lead/[leadId]`
- File: [app/api/opportunities/by-lead/[leadId]/route.ts](app/api/opportunities/by-lead/[leadId]/route.ts)
- Permission: `opportunities:view`. ACL.
- Returns ordered list with currency formatting.

#### `GET /api/opportunities/pipeline`
- File: [app/api/opportunities/pipeline/route.ts](app/api/opportunities/pipeline/route.ts)
- Permission: `opportunities:view`. ACL. Returns kanban-style board.

#### `GET /api/opportunities/picker`
- File: [app/api/opportunities/picker/route.ts](app/api/opportunities/picker/route.ts)
- Returns `{ items: { id, name, stage }[] }`.

#### `POST /api/opportunities/filter`
- File: [app/api/opportunities/filter/route.ts](app/api/opportunities/filter/route.ts)
- Body: `{ stages?: CrmOpportunityStage[], ownerIds?: string[], accountIds?: string[], currencies?: string[], closeDateFrom?, closeDateTo? ISO, amountMin?, amountMax?: number, search?, page, pageSize }`.

### 3.6 Activities (`/api/activities/*`)

#### `GET /api/activities`
- File: [app/api/activities/route.ts:31-110](app/api/activities/route.ts#L31-L110)
- Permission: `activities:view`. ACL via `buildActivityAclWhere(user)`.
- Query: `leadId?, relatedKind?, relatedObjectId?, page (1+, default 1), pageSize/limit (1..500, default 100)`.
- `?format=csv|xlsx` export. Response: `{ items, success, data: { items, page, pageSize } }` (legacy `items` kept for back-compat).
- Each row passed through `toListRow(tenantId, item, tz)` which composes the display-friendly `ActivityListRow` shape.
- **Pagination defaults distinct** from the shared 10/25/50/100 contract — this route powers timeline/detail-panel where larger pages are needed; the list explorer uses `POST /api/activities/filter`.

#### `POST /api/activities`
- Permission: `activities:create`. If `ownerId` differs from caller, also requires `activities:edit`.
- Body (Zod, [lib/validators/activity.ts:20-35](lib/validators/activity.ts#L20-L35)):
  ```
  type            string (1..80) REQUIRED
  relatedKind     enum(ACTIVITY_PRIMARY_KINDS) REQUIRED
  relatedObjectId string (1+) REQUIRED
  subject         string (≤500)
  outcome         string (≤500)
  occurredAt      ISO datetime
  detailNotes     string (≤5000)
  followUpAt      ISO datetime
  leadId, opportunityId, ownerId  string
  outreach        Record<string, unknown>
  externalId      string (≤200)
  sourceSystem    string (≤80)
  ```
- `assertActivityTargetExists(tenantId, relatedKind, relatedObjectId)` validates target.
- `getRelatedAccountId(...)` then `assertAccountAccess(user, accountId)`.
- `logActivity(...)` writes the row. Response: 201 + `ActivityListRow`.

#### `GET, PATCH, DELETE /api/activities/[id]`
- File: [app/api/activities/[id]/route.ts](app/api/activities/[id]/route.ts)
- Permission: `activities:view|edit|delete`. ACL via parent target lookup; soft-orphaned rows skip ACL.

#### `POST /api/activities/filter`
- File: [app/api/activities/filter/route.ts](app/api/activities/filter/route.ts)
- Same filter DSL as leads/contacts. Sortable: `occurredAt, createdAt, updatedAt, type, ownerName, subject`.

#### `POST /api/activities/lead-log`
- File: [app/api/activities/lead-log/route.ts](app/api/activities/lead-log/route.ts)
- Permission: `activities:create` AND `leads:view`.
- Body: `{ leadId, activityCode (LEAD_LOG_ACTIVITY_CODES enum), logOutcome (LEAD_LOG_OUTCOMES enum), detailNotes?, followUpAt?, opportunityId?, ownerId? }`.
- Creates a structured "lead log" `CrmActivity` with denormalised `activityCode + logOutcome` for fast filtering.

#### `GET /api/activities/meta/lead-log`
- File: [app/api/activities/meta/lead-log/route.ts](app/api/activities/meta/lead-log/route.ts)
- Permission: `activities:view`. Returns the lead-log enum metadata (`{ activityCodes, logOutcomes }`).

#### `POST /api/activities/smb-outreach`
- File: [app/api/activities/smb-outreach/route.ts](app/api/activities/smb-outreach/route.ts)
- Permission: `activities:create` AND `leads:view`.
- Body (Zod, [lib/validators/activity.ts:60-74](lib/validators/activity.ts#L60-L74)): heavy SMB outreach payload (country, followupPriority, channel, competitor, disposition triple, detailNotes, scheduledAt, ownerId).
- Validates disposition chain via `validateSmbDispositionChain`.
- Side effect: patches the parent lead's `country` and `followupPriority` in the same transaction.

#### `GET /api/activities/smb-outreach/meta`
- File: [app/api/activities/smb-outreach/meta/route.ts](app/api/activities/smb-outreach/meta/route.ts)
- Permission: `activities:view`. Returns `{ countries, priorities, channels, competitors, disposition chain }`.

### 3.7 Tasks (`/api/tasks/*`)

#### `GET /api/tasks`
- File: [app/api/tasks/route.ts](app/api/tasks/route.ts)
- Permission: `tasks:view`.
- Query (Zod, [lib/validators/task.ts:42-59](lib/validators/task.ts#L42-L59)): `status?, relatedKind?, relatedObjectId?, leadId?, smartView? ("bd_manager_review"|"client_meeting"|"intro_call"|"outreach"|"follow_up"), duePreset? ("overdue"|"today"|"tomorrow"|"this_week"|"next_week"|"no_date"), assignedContains?, assignedToUserId?, mine?, q?, page, pageSize`. Back-compat `?limit=` overrides pageSize and forces page 1 (max 500).
- `?format=csv|xlsx` export.

#### `POST /api/tasks`
- Permission: `tasks:create`.
- Body: `{ subject (1..500), taskType?, priority? "Low"|"Medium"|"High", status? CrmTaskStatus, dueDate? ISO, assignedToUserId?, relatedKind? "Lead"|"Opportunity"|"Contact"|"Account", relatedObjectId?, leadId? }`.

#### `GET, PATCH, DELETE /api/tasks/[id]`
- Permissions: `tasks:view|edit|delete`. **`status="Completed"` requires the separate `tasks:markComplete` permission** (not `edit`).
- `status="Cancelled"` requires `cancellationReason` (400 otherwise) — stored on the resulting CrmActivity audit row (no column on CrmTask yet).

#### `POST /api/tasks/filter`
- Body (Zod, [lib/validators/task.ts:61-72](lib/validators/task.ts#L61-L72)): `{ status[]?, priority[]?, relatedKind[]?, assignedToUserId[]?, dueFrom?, dueTo? ISO, q?, smartView?, page, pageSize }`.

#### `POST /api/tasks/[id]/snooze`
- File: [app/api/tasks/[id]/snooze/route.ts](app/api/tasks/[id]/snooze/route.ts)
- Permission: `tasks:edit`. Body `{ minutes? (positive int) | until? (ISO datetime) }` with `.refine` requiring at least one.

### 3.8 Notes (`/api/notes`)

#### `GET, POST /api/notes`
- File: [app/api/notes/route.ts](app/api/notes/route.ts)
- **No module permission gate** (relies on session only — known gap, see §20 P0).
- GET query `?relatedObjectId=<id>` filters; returns last 100 by `createdAt desc`.
- POST body: `{ content (1..10_000), relatedKind, relatedObjectId, leadId? }`.

### 3.9 Dashboard (`/api/dashboard/*`)

All require `dashboard:view`. All `dynamic = "force-dynamic"`.

#### `GET /api/dashboard`
- File: [app/api/dashboard/route.ts](app/api/dashboard/route.ts)
- Returns the headline summary via `buildSummary(user, parsedFilters)`. Filters parsed by `parseFilters(req, user)`.

#### `GET /api/dashboard/timeseries`
- File: [app/api/dashboard/timeseries/route.ts](app/api/dashboard/timeseries/route.ts)
- Query: `?metric=activities|calls|leads-created` (default `activities`). Plus shared dashboard filters (range, ownerId).
- Response: `{ metric, points: { label, iso, count }[] }`.

#### `GET /api/dashboard/funnel`
- File: [app/api/dashboard/funnel/route.ts](app/api/dashboard/funnel/route.ts)
- Cumulative funnel using `cfg.funnelStages` from `CrmOrgWorkspaceSettings.settings.dashboard`. Top-of-funnel = 100 %.
- Response: `{ steps: { stage, count, pct }[] }`.

#### `GET /api/dashboard/at-risk`
- File: [app/api/dashboard/at-risk/route.ts](app/api/dashboard/at-risk/route.ts)
- Returns `{ overdueTasks, staleLeads, stuckOpportunities, callsWithoutDispo }` each shaped as `{ count, samples: [{ id, primary, secondary, ownerName, iso }] }`.
- Thresholds: stale lead > 7 days, stuck opp > 30 days, missing dispo > 24 h. 3 sample rows per bucket.

#### `GET, POST, PATCH, DELETE /api/dashboard/pinned-reports`
- File: [app/api/dashboard/pinned-reports/route.ts](app/api/dashboard/pinned-reports/route.ts)
- Server-side pins replacing legacy localStorage. Whitelisted reportIds: `calls-by-disposition, day-wise, hourly, metrics-by-user, duration-by-user, total-volume`.
- POST `{ reportId }` (upsert). PATCH `{ order: string[] }` (reorder). DELETE `{ reportId }`.

### 3.10 Settings (`/api/settings/*`)

All Settings routes use `requirePermission()` (not `assertModule()`).

#### `GET, POST /api/settings/users`
- File: [app/api/settings/users/route.ts](app/api/settings/users/route.ts)
- Permissions: `users:view` / `users:create`.
- POST body (Zod, [lib/validators/settings-users.ts:6-17](lib/validators/settings-users.ts#L6-L17)): `{ firstName, lastName (1..80), email (lowercase, trim), phone?, role: "Administrator"|"SalesManager"|"SalesUser"|"MarketingUser"|"FinanceUser" (default SalesUser), status: "Active"|"Inactive" (default Active), password? (8..128, server generates if absent), permissionTemplateIds[], allowedAccountIds[], reportingManagerId? }`.
- 409 via `SettingsConflictError` (e.g. duplicate email).

#### `GET, PATCH, DELETE /api/settings/users/[id]`
- File: [app/api/settings/users/[id]/route.ts](app/api/settings/users/[id]/route.ts)
- Permissions: `users:view|edit|delete`.

#### `POST /api/settings/users/[id]/{disable,enable,reset-password}`
- Files: respective `route.ts`.
- Permission: `users:edit`. Each delegates to `setUserStatus(...)` / `resetUserPassword(...)`.

#### `GET, POST /api/settings/teams`, `PATCH, DELETE /api/settings/teams/[id]`
- Permissions: `settings:view|create|edit|delete`.
- Body: `{ name (1..80), managerId? }`.

#### `GET, POST /api/settings/sales-groups`, `GET/PATCH/DELETE /api/settings/sales-groups/[id]`
- Body: `{ name (1..80) }`.
- Sub-routes:
  - `POST /api/settings/sales-groups/[id]/members` — body `{ userIds[], asManager: boolean }`. `DELETE` accepts `?userId&asManager`.
  - `POST /api/settings/sales-groups/[id]/accounts` — body `{ accountIds[] }`. `DELETE` accepts `?accountId`.

#### `GET, POST /api/settings/permission-templates`, `GET/PATCH/DELETE /api/settings/permission-templates/[id]`
- Permissions: `settings:view|create|edit|delete`.
- Body (Zod, [lib/validators/settings-permission-templates.ts:20-23](lib/validators/settings-permission-templates.ts#L20-L23)): `{ name (1..80), matrix: ModulePermRow[] (≥1) }` where each `ModulePermRow = { module: string, actions: ModuleAction[], hiddenFields[]: default [], restrictedFields[]: default [] }`.

#### `GET /api/settings/audit`
- File: [app/api/settings/audit/route.ts](app/api/settings/audit/route.ts)
- Permission: `settings:view`. Tenant-wide AuditLog read.
- Query: `module?, action?, userId?, resourceId?, from?, to? (ISO datetime), page, pageSize (1..200, default 50)`.

#### `GET, PATCH /api/settings/workspace`
- File: [app/api/settings/workspace/route.ts](app/api/settings/workspace/route.ts)
- **No explicit permission gate** (auth-only). Used by Add-Lead form.
- GET returns `{ leadPipelineConfig: { stages, statuses, dependentRules } }`.
- PATCH body: `{ stages?[], statuses?[], dependentRules?: { sourceToStages?, stageToStatuses? } }`.

#### `GET, POST /api/settings/fields`, `GET/PATCH/DELETE /api/settings/fields/[key]`
- Files: respective `route.ts`.
- **No explicit permission gate.** GET supports `?customOnly=true`.
- Body: see §14 (Lead field templates).

#### `GET, PATCH /api/settings/[...slug]`
- File: [app/api/settings/[...slug]/route.ts](app/api/settings/[...slug]/route.ts)
- Catch-all for the `OrgWorkspaceSettings.settings` JSON tree at a dotted path.
- GET returns `{ value }`. PATCH body `{ value }` (or raw value) upserts at the path. **No permission gate** — auth-only.

### 3.11 Telephony (`/api/telephony/*`)

#### `POST /api/telephony/call`
- File: [app/api/telephony/call/route.ts](app/api/telephony/call/route.ts)
- **No module permission gate** (auth-only). Body: `{ to (1+), partyA?, leadId? }`.

#### `GET, POST /api/telephony/call-logs`
- File: [app/api/telephony/call-logs/route.ts](app/api/telephony/call-logs/route.ts)
- GET: tenant-wide list (last 200) OR lead-scoped via `?leadId=<id>` (also surfaces calls placed before lead-link via last-10-digit phone tail match). `?format=csv|xlsx` for tenant-wide export.
- POST body: `{ toNumber, fromNumber?, durationSec?, callDispositionId, linkedLeadId?, providerCallSid?, status?, subStage?, reason?, nextStage?, notes?, followUpAt? ISO, demoScheduledBy?, demoScheduledOn? ISO, endedBy? ("agent"|"customer"|"system"|"unknown") }`.
- **No module permission gate.**

#### `GET, POST /api/telephony/dispositions`
- File: [app/api/telephony/dispositions/route.ts](app/api/telephony/dispositions/route.ts)
- GET seeds default dispositions if empty: `interested, not_interested, not_reachable, callback_requested, demo_scheduled, not_connected, discussion_pending, payment_done, payment_verification`.
- POST body: `{ code (1+), label (1+), category?, triggersPaymentVerification?, config? }`.

#### `GET /api/telephony/member-list`, `POST /api/telephony/register-member`
- IndiaVoice provider passthrough. POST body: `{ memberName (1+), memberNum (10+) }`.

#### `GET /api/telephony/recording`
- File: [app/api/telephony/recording/route.ts](app/api/telephony/recording/route.ts)
- Auth-gated streaming proxy for IndiaVoice recordings (CORS workaround). Allow-list: `*.rpdigitalphone.com` only. Forwards Range header. Returns audio stream with same-origin headers.

#### Webhooks (no auth — provider-secret validated):
- `GET, POST /api/telephony/webhook` — alias re-export of `/api/telephony/india-voice/webhook` for legacy panel URLs.
- `GET, POST /api/telephony/india-voice/webhook` — canonical IndiaVoice webhook. Accepts JSON / form-urlencoded / form-data / text. Hands payload + headers (`authorization`, `x-webhook-secret`) to `handleWebhook`.
- `GET /api/telephony/india-voice/call-session-status?callSid=...` — auth-gated polled status. Returns `{ found, callSid, campid, status, callEnded, duration, recordingUrl }`. `callEnded` is true when `endTime` is set OR `recordingUrl` set OR `callDurationSec > 0` OR status matches `/answer|busy|cancel|abandonment|no_answer|failed/i`.
- `POST /api/telephony/twilio/click-to-call` — re-export of `POST /api/telephony/call` (legacy frontend address).
- `GET /api/telephony/twilio/status` — returns `{ configured: boolean }` (env vars present).

### 3.12 Marketing (`/api/marketing/*`)

All four sub-routes follow the same minimalist pattern, **no permission gates**, tenant-scoped queries:

| Method | Path | Body schema |
|---|---|---|
| GET, POST | `/api/marketing/campaigns` | `{ name, status?, type?, config? }` |
| GET, POST | `/api/marketing/forms` | `{ name, fields[]?, config? }` |
| GET, POST | `/api/marketing/landing-pages` | `{ name, slug, status?, content }` |
| GET, POST | `/api/marketing/widgets` | `{ name, type, config }` |

### 3.13 Automations (`/api/automations/*`)

#### `GET, POST /api/automations/workflows`
- Permissions: `automations:view` / `automations:create`.
- POST body: `{ name, status? "Draft"|"Active"|"Paused"|"Archived", triggerType?, triggerSummary?, graphNodes[]?, graphEdges[]? }`.

#### `POST /api/automations/workflows/[id]/execute`
- Permission: `automations:edit`. **503 if Redis disabled** via `requireRedisOr503()`.
- Body: `{ leadId }`. Looks up the workflow, finds the entry node from `triggerType`, enqueues a BullMQ job. Response `{ ok: true, jobId }`.

### 3.14 Lead Lists (`/api/lead-lists/*`) — distinct from saved-views

Per-user, tenant-scoped lists of saved filters. **No module permission gate**.

- `GET, POST /api/lead-lists` — list / create. POST body `{ name (1..120), filter: FilterPayload, isDefault? }`.
- `GET (PATCH/DELETE) /api/lead-lists/[id]` — see file.
- `GET /api/lead-lists/[id]/leads?page&pageSize (1..200)` — materialises the saved filter and returns matching leads (field-masked + ACL-scoped).

### 3.15 Quick Filters (`/api/quick-filters/*`)

- `GET ?module= /api/quick-filters` — per-user, tenant-scoped filter presets.
- `POST` body `{ module, name, filterConfig: Record<string, unknown> }`.
- `DELETE ?id=` — per-user delete.
- `PUT /api/quick-filters/last-applied` body `{ module, filterId? }` — sets the per-module last-applied flag (clears others first).

### 3.16 Imports (`/api/imports/*`)

#### `GET /api/imports/jobs` — last 200 jobs for the tenant.
#### `GET /api/imports/jobs/[id]/reconciliation` — `{ job: { id, status, totalRows, importedCount, attempts, rowErrors, lastError } }`.
#### `POST /api/imports/jobs/[id]/retry` — re-enqueues a job (resets attempts + clears `lastError`).

#### Queue-enqueue routes (all **503 if Redis disabled**):
| Path | Permission | Body |
|---|---|---|
| `POST /api/imports/queue/leads` | `leads:import` | `{ fileName?, csvText (1+), sourceSystem?, idempotencyKey?, batchId? }` → 202 `{ jobId, bullJobId, status: "queued" }` |
| `POST /api/imports/queue/activities` | `activities:import` | `{ fileName?, jsonText (1+), sourceSystem?, idempotencyKey?, batchId? }` |
| `POST /api/imports/queue/sla` | none (auth only) | same |
| `POST /api/imports/queue/workflows` | `automations:import` | same |

### 3.17 Reports (`/api/reports/*`)

#### `GET /api/reports/canned`
- Permission: `reports:view`. Returns `{ success, data: { items: CannedReportSummary[] } }` from the 15-card catalog (callbacks stripped).

#### `GET /api/reports/canned/[id]`
- Permission: `reports:view` (CSV/XLSX export gated on `reports:export` inside `dispatchExport`).
- Query: `from?, to? (ISO), ownerId?, format=csv|xlsx`.
- Date range falls back to the report's `defaultDateRange` resolved in the user's tz.
- Response: `{ success, data: CannedReportResult }` with rows enriched by `_drillUrl` (per-row deep link).

#### `GET /api/reports/canned/previews?ids=`
- Permission: `reports:view`.
- Bulk-runs the headline metric for each requested report. Failed reports return `preview: null` so the hub doesn't break.

### 3.18 Misc

- `GET /api/notifications` — per-user tenant-scoped, last 50 + `unread` count.
- `PATCH /api/notifications/[id]/read` — mark one as read.
- `GET /api/search?q=` — minimum 2 chars. Parallel queries on `crmLead, crmAccount, crmContact`. Returns `{ leads[10], accounts[10], contacts[10] }` (no ACL applied at this layer).
- `GET /api/users/picker` — lists `Membership.status="active"` users in caller's tenant. Returns `{ items: { id, name, email, role }[] }`.
- `POST /api/payment-verifications` — body `{ leadId?, callLogId?, amount, currency? "INR", reference?, paymentMode?, notes? }`.

### 3.19 Internal (`/api/internal/*`)

#### `POST /api/internal/accounts/reconcile-owner-names`
- File: [app/api/internal/accounts/reconcile-owner-names/route.ts](app/api/internal/accounts/reconcile-owner-names/route.ts)
- **Administrator-only** (hard role check, not matrix). Auth: same NextAuth session as user routes (no `x-internal-secret`).
- Walks every CrmAccount with non-null `ownerId`, looks up `public.User`, updates `ownerName` if drifted.
- Response: `{ ok, updated, total }`.
- **This is the only endpoint under `/api/internal/`.** No `/api/internal/manifest`, no `/api/internal/seed-fields`, no service-JWT support anywhere.

---

## Section 4 — Manifest Analysis

### 4.1 Manifest verbatim ([apps/quikcrm/manifest.ts](manifest.ts))

```typescript
export interface AppManifest {
  appId: string;
  name: string;
  description: string;
  routePrefix: string;
  icon: string;
  permissions: string[];
  navigation: { label: string; href: string; icon: string }[];
}

const manifest: AppManifest = {
  appId: "quikcrm",
  name: "QuikCRM",
  description: "Leads, accounts, contacts, automations, and telephony — sales execution.",
  routePrefix: "/quikcrm",
  icon: "Users",
  permissions: [],
  navigation: [
    { label: "Dashboard", href: "/quikcrm", icon: "LayoutDashboard" },
    { label: "Leads", href: "/quikcrm/leads", icon: "Target" },
    { label: "Accounts", href: "/quikcrm/accounts", icon: "Building2" },
    { label: "Contacts", href: "/quikcrm/contacts", icon: "UserSquare2" },
    { label: "Activities", href: "/quikcrm/activities", icon: "ListChecks" },
    { label: "Automations", href: "/quikcrm/automations", icon: "Zap" },
    { label: "Imports", href: "/quikcrm/imports", icon: "Upload" },
  ],
};

export default manifest;
```

### 4.2 Modules declared

| Module ID | Module name (from navigation) |
|---|---|
| dashboard | Dashboard (also implicit in `permissions.ts#ALL_MODULES`) |
| leads | Leads |
| accounts | Accounts |
| contacts | Contacts |
| activities | Activities |
| automations | Automations |
| imports | Imports |

The manifest lists 7 navigation modules. The actual permission catalog (`lib/auth/permissions.ts`) declares **14** modules (see §4.4).

### 4.3 Entities declared

The manifest **does not declare entities**. There is no `entities[]` array in `AppManifest`. The AI Runtime team will need either:
1. A new `entities` field on `AppManifest` (cross-app contract change), or
2. A `GET /api/internal/manifest` endpoint that returns the augmented manifest at runtime.

| Entity type | Module | Has `[id]` route? | Has `/full` or `/detail` route? | Has `/picker`? | Has `/summary` route? |
|---|---|---|---|---|---|
| lead | leads | yes | `/full` (aggregate) | yes | **no** |
| contact | contacts | yes | no | yes | **no** |
| account | accounts | yes | no (use `/leads`, `/health-summary`) | yes | **no** |
| opportunity | opportunities | yes | `/detail` | yes | **no** |
| activity | activities | yes | no | n/a | **no** |
| task | tasks | yes | no | n/a | **no** |
| note | notes | n/a (collection-only) | n/a | n/a | **no** |
| call_log | telephony | n/a | n/a | n/a | **no** |

### 4.4 Permissions catalog (complete)

Source of truth: [lib/auth/permissions.ts:21-46](lib/auth/permissions.ts#L21-L46).

`ALL_MODULES`: `dashboard, leads, accounts, contacts, opportunities, activities, tasks, notes, campaigns, automations, imports, reports, settings, telephony` (14 modules).
`ALL_ACTIONS`: `view, create, edit, delete, export, import, markComplete` (7 actions).

Permission strings are formed as `"<module>:<action>"`. The full catalog (cartesian product, with admin bypass via `Administrator` role) — only the gates **actually enforced in route handlers** (verified via grep) are shown:

| Permission string | Routes that enforce it |
|---|---|
| `leads:view` | `/api/leads`, `/api/leads/[id]`, `/api/leads/[id]/full`, `/api/leads/filter`, `/api/leads/picker`, `/api/leads/kanban/board`, `/api/leads/stream`, `/api/leads/[id]/changelog`, `/api/lead-lists/*` (implicit via filter), `/api/accounts/[id]/leads`, `/api/activities/lead-log`, `/api/activities/smb-outreach` |
| `leads:create` | `POST /api/leads` |
| `leads:edit` | `PATCH /api/leads/[id]`, `POST /api/leads/[id]/transition`, `POST /api/leads/[id]/convert`, `PATCH /api/leads/[id]/favorite`, `POST /api/accounts/[id]/leads/bulk-assign` |
| `leads:delete` | `DELETE /api/leads/[id]`, `POST /api/leads/[id]/restore` |
| `leads:import` | `POST /api/imports/queue/leads` |
| `contacts:view` | `/api/contacts`, `/api/contacts/[id]`, `/api/contacts/filter`, `/api/contacts/picker` |
| `contacts:create` | `POST /api/contacts` |
| `contacts:edit` | `PATCH /api/contacts/[id]` |
| `contacts:delete` | `DELETE /api/contacts/[id]` |
| `accounts:view` | `/api/accounts`, `/api/accounts/[id]`, `/api/accounts/filter`, `/api/accounts/picker`, `/api/accounts/health-summary`, `/api/accounts/[id]/leads` |
| `accounts:create` | `POST /api/accounts` |
| `accounts:edit` | `PATCH /api/accounts/[id]`, `POST /api/accounts/[id]/leads/bulk-assign` |
| `accounts:delete` | `DELETE /api/accounts/[id]`, `POST /api/accounts/[id]/restore` |
| `opportunities:view` | `/api/opportunities*`, `/api/opportunities/by-lead/[leadId]`, `/api/opportunities/pipeline`, `/api/opportunities/picker` |
| `opportunities:create` | `POST /api/opportunities` |
| `opportunities:edit` | `PATCH /api/opportunities/[id]`, `POST /api/opportunities/[id]/transition`, `POST/PATCH /api/opportunities/[id]/products*`, `POST /api/opportunities/[id]/client-meetings` |
| `opportunities:delete` | `DELETE /api/opportunities/[id]`, `POST /api/opportunities/[id]/restore` |
| `activities:view` | `/api/activities*` |
| `activities:create` | `POST /api/activities`, `POST /api/activities/lead-log`, `POST /api/activities/smb-outreach` |
| `activities:edit` | `PATCH /api/activities/[id]` (and as cross-user write gate inside POST) |
| `activities:delete` | `DELETE /api/activities/[id]` |
| `activities:import` | `POST /api/imports/queue/activities` |
| `tasks:view` | `/api/tasks*` |
| `tasks:create` | `POST /api/tasks` |
| `tasks:edit` | `PATCH /api/tasks/[id]` (when status ≠ Completed), `POST /api/tasks/[id]/snooze` |
| `tasks:markComplete` | `PATCH /api/tasks/[id]` when `status="Completed"` |
| `tasks:delete` | `DELETE /api/tasks/[id]` |
| `dashboard:view` | `/api/dashboard*` |
| `automations:view` | `GET /api/automations/workflows` |
| `automations:create` | `POST /api/automations/workflows` |
| `automations:edit` | `POST /api/automations/workflows/[id]/execute` |
| `automations:import` | `POST /api/imports/queue/workflows` |
| `reports:view` | `/api/reports/canned*` |
| `reports:export` | enforced inside `dispatchExport` (CSV/XLSX gating) |
| `settings:view` | `/api/settings/audit`, all settings GET routes |
| `settings:create` | POSTs in `/api/settings/{teams,sales-groups,permission-templates}` |
| `settings:edit` | PATCH/POST in `/api/settings/{teams,sales-groups,sales-groups/[id]/members,sales-groups/[id]/accounts,permission-templates}` |
| `settings:delete` | DELETEs in `/api/settings/{teams,sales-groups,permission-templates}` |
| `users:view` | `GET /api/settings/users*` |
| `users:create` | `POST /api/settings/users` |
| `users:edit` | `PATCH /api/settings/users/[id]`, `POST /api/settings/users/[id]/{disable,enable,reset-password}` |
| `users:delete` | `DELETE /api/settings/users/[id]` |

**Permission strings declared in `permissions.ts#ALL_MODULES` but NOT enforced anywhere**: `notes:*`, `campaigns:*`, `imports:*` (the per-entity `*:import` action is used; module `imports` itself is unused), `telephony:*`, `dashboard:create|edit|delete|export|import|markComplete`. **Routes for those modules currently have no module permission gate** — only auth check (Notes, Marketing/Campaigns, Telephony call/dispositions/member-list/register-member). See §20 P1 list.

---

## Section 5 — Entity Shapes for AI Context

For each primary entity, this section documents the fields the AI Runtime will receive when calling the existing endpoints, plus the recommended **summary shape** the AI team should request to be added.

### 5.1 Lead

**Full record (from `GET /api/leads/[id]`)** — entire `CrmLead` row (see §2.3 for the model). Notable fields for AI context: `id, tenantId, name, email, phone, mobile, company, jobTitle, source, stage, status, substatus, score, ownerId, ownerName, accountId, linkedContactId, country, industry, leadQuality, isStarred, followupPriority, addressLine1/2, area, cityName, stateName, postalCode, lat, long, convertedAt, dynamicFields (JSON), createdAt, updatedAt, deletedAt`.

**Aggregate (`GET /api/leads/[id]/full`)** — see [lib/services/leads/full-record.ts:14-72](lib/services/leads/full-record.ts#L14-L72):
```
{
  lead: <CrmLead, field-masked>,
  activities: CrmActivity[]   // last 50, ordered occurredAt desc
  tasks: CrmTask[]            // last 50, ordered status asc, dueDate asc
  notes: CrmNote[]            // last 50, ordered createdAt desc
  opportunities: CrmOpportunity[]   // last 50
  callLogs: CrmCallLog[]      // last 50
  attachments: CrmLeadAttachment[]  // all
}
```

**Summary endpoint**: **does not exist.** Recommended shape:
```ts
GET /api/leads/[id]/summary
{
  id: string,
  displayName: string,         // = lead.name
  subtitle: string,            // = `${company || jobTitle || ""}`.trim()
  url: string,                 // = `/quikcrm/leads/${id}`
  email: string | null,
  phone: string | null,        // prefer mobile when present
  stage: string,
  status: string,
  ownerName: string | null,
  score: number,
  accountId: string | null,
  accountName: string | null,  // resolved from CrmAccount
  isConverted: boolean,        // = !!convertedAt
  isStarred: boolean,
  isInTrash: boolean,          // = !!deletedAt
  recentActivity: { type, occurredAt, outcome | null } | null,  // most recent CrmActivity
  updatedAt: string
}
```
**Sensitive fields to exclude** from any AI prompt context: `dynamicFields` keys flagged `requirement: "System"`; `addressLine1/2/lat/long` for Indian PII compliance unless user explicitly invokes a location tool.

### 5.2 Contact

**Full record (from `GET /api/contacts/[id]`)** — `CrmContact` row plus `accountName` injected by `attachAccountNames` (see [lib/services/contacts/account-name-batch.ts](lib/services/contacts/account-name-batch.ts)). Wire shape:
```
{ success: true, data: { id, tenantId, firstName, lastName, email, phone, title, accountId, accountName, leadId, ownerId, ownerName, city, contactStage, source, createdAt, updatedAt } }
```

**Summary endpoint**: does not exist. Recommended:
```ts
GET /api/contacts/[id]/summary
{
  id, displayName: `${firstName} ${lastName}`.trim() || email,
  url: `/quikcrm/contacts/${id}`,
  email, phone, title, accountName, ownerName,
  contactStage, source, updatedAt
}
```

### 5.3 Account

**Full record (from `GET /api/accounts/[id]`)** — `AccountRow` shape (see `ACCOUNT_ROW_SELECT` in `lib/services/accounts`). Filters out `deletedAt: null`.

**Summary endpoint**: does not exist. Recommended:
```ts
GET /api/accounts/[id]/summary
{
  id, displayName: name,
  url: `/quikcrm/accounts/${id}`,
  industry, segment, status,
  ownerName,
  city, countryCode,
  annualRevenueDisplay, annualRevenueAmount, annualRevenueCurrency,
  healthScore, renewalDate,
  parentAccountId, parentAccountName,  // resolved
  contactCount, leadCount, opportunityCount,  // computed
  updatedAt
}
```
**Available aggregate**: `GET /api/accounts/health-summary` returns tenant-level health buckets (red/amber/green/total/renewing30d/renewing90d/byStatus). Useful for "what's on fire?" agent queries.

### 5.4 Opportunity

**Full record (from `GET /api/opportunities/[id]`)** — base `CrmOpportunity` row. **Detail variant `GET /api/opportunities/[id]/detail`** is the closest summary surface today and returns:
```
{
  ...opportunity,
  amount, weightedAmount, amountDisplay,
  account: { id, name, status },
  clientMeetings[] (50, meetingAt desc),
  products[] (sortOrder asc, with unitPrice/lineTotal as numbers),
  transitions[] (30, occurredAt desc)
}
```
**Recommended `/summary` shape** (smaller than `/detail`):
```ts
GET /api/opportunities/[id]/summary
{
  id, displayName: name,
  url: `/quikcrm/opportunities/${id}`,
  stage,
  amount, currency, amountDisplay,
  probability, weightedAmount,
  closeDate, lastStageChangeAt, lastActivityAt,
  ownerName,
  account: { id, name },
  competitorName, closeReason,
  isInTrash: !!deletedAt
}
```

### 5.5 Activity

**Full record (from `GET /api/activities/[id]`)** — wrapped via `toListRow(tenantId, item, tz)` which returns the display-ready `ActivityListRow` shape (composes related labels, formats `occurredAt` per tz cookie). Base columns: see `CrmActivity` model in §2.3.

**Recommended `/summary` shape**:
```ts
{
  id, type, subject, outcome, occurredAt,
  url: `/quikcrm/activities/${id}`,
  ownerName,
  related: { kind: relatedKind, id: relatedObjectId, label: <resolved> },
  followUpAt
}
```

### 5.6 Task

**Full record (from `GET /api/tasks/[id]`)** — base `CrmTask` row from `getTask(user, id)` in `lib/services/tasks/index.ts`.

**Recommended `/summary` shape**:
```ts
{
  id, subject, taskType, priority, status, dueDate,
  url: `/quikcrm/tasks/${id}`,
  assignedToUserId, assignedToName: <resolved>,
  related: { kind: relatedKind, id: relatedObjectId, label: <resolved> },
  isOverdue: dueDate < now && status not in ["Completed", "Cancelled"]
}
```

### 5.7 Call Log, Note

No `[id]` GET routes — these entities are returned as part of `/api/leads/[id]/full` aggregate or via tenant-scoped list endpoints (`/api/telephony/call-logs`, `/api/notes`). AI tools should fetch via the parent lead.

---

## Section 6 — Search Indexing

**Status: NOT integrated.** No `@quikit/search-sdk` in `apps/quikcrm/package.json`. No grep matches for `searchIndex`, `indexEntity`, `removeFromIndex` in the entire `apps/quikcrm/` tree.

The only "search" surface is `GET /api/search?q=` ([app/api/search/route.ts](app/api/search/route.ts)) which runs three parallel Prisma `contains` queries (case-insensitive ILIKE) on `CrmLead, CrmAccount, CrmContact`, top-10 each. Returns `{ leads, accounts, contacts }`. **No ACL applied** at this layer (known gap, see §20).

| Entity | indexableText fields (suggested) | displayName field | snippet template (suggested) | Index events on create / update / delete |
|---|---|---|---|---|
| lead | `name, email, company, jobTitle, dynamicFields.* (text-typed only)` | `name` | `${company} — ${stage} — ${ownerName}` | **none** — needs to be wired |
| account | `name, industry, city, website` | `name` | `${segment || segmentEnum} — ${city}` | **none** |
| contact | `firstName, lastName, email, title, city` | `${firstName} ${lastName}` | `${title} @ ${accountName}` | **none** |
| opportunity | `name, competitorName, closeReason` | `name` | `${stage} · ${amountDisplay} · ${ownerName}` | **none** |
| activity | `subject, outcome, detailNotes` | `subject ?? type` | `${type} on ${relatedKind} · ${ownerName}` | **none** |
| task | `subject, taskType` | `subject` | `${priority} · ${status} · due ${dueDate}` | **none** |

**Entities that should be indexed but currently are not**: lead, account, contact, opportunity, activity, task. **All six.**

---

## Section 7 — Audit Logging

**Status: partially integrated** via in-house `lib/services/audit.ts` and `lib/services/leads/change-log.ts`. **`@quikit/audit` is NOT installed.**

### 7.1 Central audit helper ([lib/services/audit.ts:25-38](lib/services/audit.ts#L25-L38))

```ts
audit({
  tenantId, userId, module, action,
  resourceId?, before?, after?, metadata?
}, tx?)
```
Writes to `CrmAuditLog`. Called only by Settings services.

### 7.2 Per-route audit coverage

| Route | Action string | Before/after included | actorType aware | Audit helper used |
|---|---|---|---|---|
| `POST /api/leads` | `lead.create` (action="CREATE", module="leads") | after only | **no** | `recordLeadChange` |
| `PATCH /api/leads/[id]` | `lead.update` (UPDATE) | diff (only changed tracked fields) | **no** | `recordLeadChange` |
| `DELETE /api/leads/[id]` | `lead.delete` (DELETE) | before only | **no** | `recordLeadChange` |
| `POST /api/leads/[id]/restore` | `lead.restore` (RESTORE) | before/after | **no** | `recordLeadChange` |
| `DELETE /api/leads/[id]/permanent` | `lead.permanent_delete` (PERMANENT_DELETE) | before only | **no** | `recordLeadChange` |
| `POST /api/leads/[id]/transition` | none — no audit row | n/a | n/a | **MISSING** |
| `PATCH /api/leads/[id]/favorite` | none | n/a | n/a | **MISSING** |
| `POST /api/leads/[id]/convert` | none | n/a | n/a | **MISSING** |
| `POST/PATCH/DELETE /api/accounts*` | "AccountChange" / "BulkOwnershipChange" — written as `CrmActivity` rows, **not** `CrmAuditLog` | n/a | **no** | inline transaction |
| `POST/PATCH/DELETE /api/opportunities*` | `CrmOpportunityStageTransition` row (transition only) | yes (fromStage→toStage + close fields) | **no** | `recordTransition` |
| `POST/PATCH/DELETE /api/activities*` | none | n/a | n/a | **MISSING** |
| `POST/PATCH/DELETE /api/tasks*` | "TaskChange" — written as `CrmActivity` row | n/a | **no** | inline (in `lib/services/tasks/index.ts`) |
| `POST /api/settings/users` | `users` create | after only | **no** | `audit()` central helper |
| `PATCH /api/settings/users/[id]` | `users` update | yes | **no** | `audit()` |
| `DELETE /api/settings/users/[id]` | `users` delete | before only | **no** | `audit()` |
| `POST /api/settings/teams` etc. | `teams` create | after only | **no** | `audit()` |
| Sales groups CRUD | `sales_groups` * | yes/diff | **no** | `audit()` |
| Permission templates CRUD | `permission_templates` * | yes/diff | **no** | `audit()` |

### 7.3 Gaps

- **No `actorType` / `actingAs` field** anywhere in `AuditOptions` — AI agent calls cannot be distinguished from human user calls. **P2 fix: extend `AuditOptions` with `actorType: "user"|"ai_agent"|"system"` and `actingAgentId?: string`.**
- **Three pattern split** for tracking writes: `recordLeadChange` → `CrmAuditLog`; Account/Opportunity/Task → `CrmActivity`; Settings → `CrmAuditLog` via `audit()`. Reading "what changed on entity X" requires querying both tables.
- **Lead transition / favorite / convert** are not audited.
- **No retention policy / pruning logic**.

---

## Section 8 — Permission Implementation

### 8.1 How permissions are checked

Representative example ([app/api/leads/route.ts:39-41](app/api/leads/route.ts#L39-L41)):
```ts
const user = await requireApiUser();
if (isResponse(user)) return user;
await assertModule(user, "leads", "view");
```

`assertModule` ([lib/auth/permissions.ts:106-124](lib/auth/permissions.ts#L106-L124)) flow:
1. If `user.role === "Administrator"` → **bypass** (always allowed).
2. Load `getEffectiveMatrix(user.userId)` from `CrmUserPermissionTemplate` joined with `CrmPermissionTemplate`. Merge across multiple templates: actions = union, hiddenFields = intersection, restrictedFields = intersection.
3. **Backwards-compat: if user has zero templates configured, treat as unrestricted.** (Same legacy "no ACL = full org access" behaviour as `account-acl.ts`.)
4. Otherwise: find `matrix.module == "leads"`. If absent, or if action not in `actions[]`, throw `Error` with `statusCode = 403`.

### 8.2 Field-level masking

`maskHiddenLeadFields(user, record)`: nulls out any key listed in the user's `hiddenFields` for module `leads`.
`filterRestrictedLeadFields(user, payload)`: deletes any key listed in `restrictedFields` from incoming write payload.
Both bypass for Administrators.

**Currently only the `leads` module uses field masking.** Other modules don't have helpers — `hiddenFields` / `restrictedFields` for accounts/contacts/opps/etc. are stored in templates but **not enforced anywhere**. Known gap.

### 8.3 Account ACL (account-scope)

`getScope(user)` ([lib/auth/account-acl.ts:28-71](lib/auth/account-acl.ts#L28-L71)):
- Admin → `{ unrestricted: true }`.
- Non-admin: union of (a) `CrmUserAccountAccess` direct grants + (b) accounts attached to any `CrmSalesGroup` the user is member or manager of.
- **Backwards-compat: empty allow-list (no rows in any of the three tables) → unrestricted.**

`assertAccountAccess(user, accountId)` throws 403 if accountId not in scope (skips if accountId is null).
`accountScopeFilter(user)` returns a Prisma `OR` fragment: `[{ accountId: { in: allowedIds } }, { accountId: null }]` (or `null` when unrestricted).

### 8.4 Routes with no permission gate

Verified by grep — these routes only check `requireApiUser()` (auth-only, no module check):
- `/api/notes` (GET, POST)
- `/api/quick-filters/*`
- `/api/lead-lists/*`
- `/api/leads/sources/*` — only on user list filtering (no module gate)
- `/api/leads/saved-views/*`
- `/api/leads/stages`
- `/api/marketing/{campaigns,forms,landing-pages,widgets}`
- `/api/notifications`, `/api/notifications/[id]/read`
- `/api/users/picker`
- `/api/payment-verifications`
- `/api/telephony/{call,call-logs,dispositions,member-list,register-member,recording}`
- `/api/telephony/twilio/{status,click-to-call}`
- `/api/telephony/india-voice/call-session-status`
- `/api/settings/workspace`
- `/api/settings/fields/*`
- `/api/settings/[...slug]` (catch-all OrgWorkspaceSettings tree)
- `/api/imports/queue/sla` (no `sla:import` permission exists)
- `/api/imports/jobs*`

**Known gap, see §20 P1.**

---

## Section 9 — Org / Tenant Isolation

### 9.1 Pattern

Tenant ID source: `session.user.tenantId` is stamped onto the OAuth JWT by the QuikIT IdP after the user picks an org. Read verbatim in `requireApiUser()` ([lib/auth/require.ts:39-49](lib/auth/require.ts#L39-L49)) — no DB lookup.

Every Prisma query passes `tenantId: user.tenantId` in `where`. Soft-delete middleware (registered in `packages/database`) auto-filters `deletedAt: null` for models in `SOFT_DELETE_MODELS`.

Representative query ([app/api/leads/[id]/route.ts:25-27](app/api/leads/[id]/route.ts#L25-L27)):
```ts
const lead = await prisma.crmLead.findUnique({ where: { id } });
if (!lead || lead.tenantId !== user.tenantId) {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
```
Cross-tenant rows return 404 (not 403) to avoid existence disclosure.

### 9.2 Soft-delete handling

The shared soft-delete middleware only inspects **top-level `where` keys**. Routes that use `AND: [...]` must put `deletedAt` AT THE TOP LEVEL — see [app/api/leads/route.ts:63-75](app/api/leads/route.ts#L63-L75) for the documented workaround:
- `?onlyDeleted=true` → top-level `deletedAt: { not: null }` (trash view)
- `?includeDeleted=true` → top-level `deletedAt: undefined` (opt-out: both active and deleted)
- default → middleware injects top-level `deletedAt: null` (active only)

`findUnique` bypasses the middleware so deleted leads can be loaded for read-only viewing or restore.

### 9.3 Potential leak risks

- `/api/search` does **not** apply `accountScopeFilter` — a user with limited account scope could see lead/contact/account names outside their scope. **Known gap, see §20 P1.**
- `/api/users/picker` lists all members of the tenant regardless of scope (probably intentional — users need to know each other's names).
- Catch-all `/api/settings/[...slug]` accepts arbitrary JSON value PATCHes from any authenticated user — no settings module ACL. **Known gap, P1.**

---

## Section 10 — Internal Endpoints

**Total: one route under `/api/internal/`.**

### `POST /api/internal/accounts/reconcile-owner-names`
- File: [app/api/internal/accounts/reconcile-owner-names/route.ts](app/api/internal/accounts/reconcile-owner-names/route.ts)
- Auth: NextAuth session (no `x-internal-secret` header). **Administrator role required.**
- Idempotent: yes (re-runnable; only updates rows whose `ownerName` drifted).
- Purpose: re-derive `CrmAccount.ownerName` from `public.User` after bulk renames/imports.
- Request body: empty.
- Response: `{ ok, updated: number, total: number }`.

**Endpoints expected by the AI Runtime contract that DO NOT exist:**
- `POST /api/internal/seed-fields` — does not exist.
- `GET /api/internal/manifest` — does not exist.
- `POST /api/internal/ai/*` — does not exist.

---

## Section 11 — AI Runtime Tool Compatibility

For each candidate endpoint that the AI Runtime might call as a tool, this section lists permission, risk class, suggested tool name, input schema (≈Zod), output shape, and per-route blockers.

**Risk classes:**
- READ — fetches data only
- DRAFT — generates content for human review (not yet present in QuikCRM)
- SOFT_WRITE — creates/updates low-consequence data
- MEDIUM_WRITE — modifies business-critical records (lead stage, opp transition, account owner)
- HIGH_RISK — sends external comms / financial operations

### 11.1 READ tools (safe to call autonomously)

| Endpoint | Tool name | Permission | Risk | Input | Output | Ready? |
|---|---|---|---|---|---|---|
| `GET /api/leads/[id]` | `fetch_lead` | leads:view | READ | `{ lead_id }` | CrmLead row | yes (no summary, returns full row) |
| `GET /api/leads/[id]/full` | `fetch_lead_with_related` | leads:view | READ | `{ lead_id }` | aggregate (lead + activities + tasks + notes + opps + callLogs + attachments) | yes (response is verbose for prompt context — needs trimming) |
| `GET /api/leads/[id]/changelog` | `fetch_lead_changelog` | leads:view | READ | `{ lead_id, action?, userId?, from?, to?, page, pageSize }` | `{ items: ChangeLogEntry[], total }` | yes |
| `POST /api/leads/filter` | `search_leads_by_filter` | leads:view | READ | `{ filter: { matchMode, conditions[] }, page, pageSize, sortBy, sortDir }` | `{ items, total }` | yes |
| `GET /api/leads/picker` | `lookup_leads` | leads:view | READ | `{ q, limit }` | `{ items: { id, name, company }[] }` | yes |
| `GET /api/contacts/[id]` | `fetch_contact` | contacts:view | READ | `{ contact_id }` | `{ success, data: CrmContact + accountName }` | yes |
| `POST /api/contacts/filter` | `search_contacts` | contacts:view | READ | filter DSL | items[] | yes |
| `GET /api/accounts/[id]` | `fetch_account` | accounts:view | READ | `{ account_id }` | AccountRow | yes |
| `GET /api/accounts/[id]/leads` | `fetch_account_leads` | accounts:view + leads:view | READ | `{ account_id, page, limit }` | items[] | yes |
| `GET /api/accounts/health-summary` | `fetch_account_health` | accounts:view | READ | `{ ownerId?, segment?, healthLt? }` | health buckets | yes |
| `POST /api/accounts/filter` | `search_accounts` | accounts:view | READ | filter DSL | items[] | yes |
| `GET /api/opportunities/[id]/detail` | `fetch_opportunity_with_detail` | opportunities:view | READ | `{ opp_id }` | opp + account + meetings + products + transitions | yes |
| `POST /api/opportunities/filter` | `search_opportunities` | opportunities:view | READ | filter body | items[] | yes |
| `GET /api/opportunities/by-lead/[leadId]` | `fetch_opportunities_for_lead` | opportunities:view | READ | `{ lead_id }` | items[] | yes |
| `GET /api/opportunities/pipeline` | `fetch_opportunity_pipeline` | opportunities:view | READ | none | board | yes |
| `GET /api/activities` | `list_activities` | activities:view | READ | `{ leadId?, relatedKind?, relatedObjectId?, page, pageSize }` | items[] | yes |
| `POST /api/activities/filter` | `search_activities` | activities:view | READ | filter body | items[] | yes |
| `GET /api/tasks` | `list_tasks` | tasks:view | READ | many filter params | result | yes |
| `POST /api/tasks/filter` | `search_tasks` | tasks:view | READ | filter body | items[] | yes |
| `GET /api/notes?relatedObjectId=` | `list_notes_for_entity` | none (auth only) | READ | `{ relatedObjectId }` | items[] | yes — but **needs `notes:view` gate added** |
| `GET /api/dashboard*` | `fetch_dashboard_*` | dashboard:view | READ | filters | DTOs | yes |
| `GET /api/reports/canned/[id]` | `run_canned_report` | reports:view | READ | `{ from?, to?, ownerId? }` | CannedReportResult | yes |
| `GET /api/search?q=` | `search_global` | none (auth only) | READ | `{ q }` | `{ leads, accounts, contacts }` | partial — **needs ACL applied + 4-char floor** |

### 11.2 SOFT_WRITE tools

| Endpoint | Tool name | Permission | Risk | Blockers |
|---|---|---|---|---|
| `POST /api/leads` | `create_lead` | leads:create | SOFT_WRITE | None blocking, but recommend wrapping in feature-flag for AI calls until duplicate-detection is tuned |
| `POST /api/contacts` | `create_contact` | contacts:create | SOFT_WRITE | None |
| `POST /api/notes` | `create_note` | none | SOFT_WRITE | **Add notes:create permission** |
| `POST /api/activities` | `log_activity` | activities:create | SOFT_WRITE | None |
| `POST /api/activities/lead-log` | `log_lead_activity` | activities:create + leads:view | SOFT_WRITE | None |
| `POST /api/tasks` | `create_task` | tasks:create | SOFT_WRITE | None |
| `POST /api/tasks/[id]/snooze` | `snooze_task` | tasks:edit | SOFT_WRITE | None |
| `POST /api/leads/[id]/favorite` | `toggle_lead_star` | leads:edit | SOFT_WRITE | None |

### 11.3 MEDIUM_WRITE tools

| Endpoint | Tool name | Permission | Risk | Blockers |
|---|---|---|---|---|
| `PATCH /api/leads/[id]` | `update_lead` | leads:edit | MEDIUM_WRITE | None — but `recordLeadChange` is the only audit; no actorType field |
| `POST /api/leads/[id]/transition` | `transition_lead_stage` | leads:edit | MEDIUM_WRITE | **No audit row written** — add audit |
| `POST /api/leads/[id]/convert` | `convert_lead` | leads:edit | MEDIUM_WRITE | **No audit row** — irreversible (no unconvert endpoint) |
| `DELETE /api/leads/[id]` (soft) | `trash_lead` | leads:delete | MEDIUM_WRITE | None |
| `POST /api/leads/[id]/restore` | `restore_lead` | leads:delete | MEDIUM_WRITE | None |
| `PATCH /api/contacts/[id]` | `update_contact` | contacts:edit | MEDIUM_WRITE | None |
| `DELETE /api/contacts/[id]` | `delete_contact` | contacts:delete | MEDIUM_WRITE | **Hard delete; cascade resets lead status** — flag in tool description |
| `POST /api/accounts` | `create_account` | accounts:create | MEDIUM_WRITE | Server-side cascade on owner change — fine |
| `PATCH /api/accounts/[id]` | `update_account` | accounts:edit | MEDIUM_WRITE | None |
| `DELETE /api/accounts/[id]` (soft) | `trash_account` | accounts:delete | MEDIUM_WRITE | None |
| `POST /api/accounts/[id]/leads/bulk-assign` | `bulk_reassign_leads` | accounts:edit + leads:edit | MEDIUM_WRITE | None — bounded to 500 IDs |
| `POST /api/opportunities` | `create_opportunity` | opportunities:create | MEDIUM_WRITE | None |
| `PATCH /api/opportunities/[id]` | `update_opportunity` | opportunities:edit | MEDIUM_WRITE | Stage rejected — must use transition tool |
| `POST /api/opportunities/[id]/transition` | `transition_opportunity` | opportunities:edit | MEDIUM_WRITE | Closed-state reopens require `?force=true` and Administrator |
| `POST /api/opportunities/[id]/products` | `add_opportunity_product` | opportunities:edit | MEDIUM_WRITE | None |
| `POST /api/opportunities/[id]/client-meetings` | `log_opp_meeting` | opportunities:edit | MEDIUM_WRITE | None |
| `PATCH /api/tasks/[id]` (status=Completed) | `complete_task` | **tasks:markComplete** (separate gate) | MEDIUM_WRITE | None |
| `PATCH /api/tasks/[id]` (status=Cancelled) | `cancel_task` | tasks:edit | MEDIUM_WRITE | Requires `cancellationReason` |

### 11.4 HIGH_RISK tools

| Endpoint | Tool name | Permission | Risk | Blockers |
|---|---|---|---|---|
| `POST /api/telephony/call` | `place_call` | none (auth only) | HIGH_RISK | **Real outbound call** — must be human-confirmed even when AI initiates. Add `telephony:call` permission. |
| `POST /api/telephony/twilio/click-to-call` | alias of above | same | HIGH_RISK | same |
| `POST /api/telephony/call-logs` | `log_call_disposition` | none | HIGH_RISK | Recording + writing call disposition can change lead stage via `targetLeadStage` mapping. **Add audit + permission.** |
| `DELETE /api/leads/[id]/permanent` | `permanently_delete_lead` | Administrator only | HIGH_RISK | Should not be exposed to AI tools at all |
| `POST /api/imports/queue/leads` | `enqueue_lead_import` | leads:import | HIGH_RISK | Batch creates many leads — restrict to admin agents only |
| `POST /api/automations/workflows/[id]/execute` | `execute_workflow` | automations:edit | HIGH_RISK | Triggers downstream side effects (emails / SMS / queue) |
| `POST /api/payment-verifications` | `submit_payment_verification` | none | HIGH_RISK | Financial signal — **add permission + audit** |

### 11.5 Universal blockers

These apply across all tools, not per-endpoint:

1. **No `actingAs` / `actingAgentId` propagation.** The AI Runtime cannot tell QuikCRM "this call is from agent X"; QuikCRM cannot record it. Every audit row will look like the impersonated user clicked the button.
2. **No service JWT validation.** All routes use NextAuth cookie sessions. The runtime needs to mint or carry a session — there's no "machine token" path today. Either:
   - The runtime impersonates the human user via NextAuth session forwarding, OR
   - QuikCRM adds an `Authorization: Bearer <service-JWT>` validator that mints a `SessionUser` with `actingAs="ai_agent"`.
3. **Inconsistent response envelope** (see §16) — runtime tool result parsers must handle both `{ items, total }` and `{ success, data: { items, total } }` shapes. Migration plan recommended.
4. **No idempotency keys** on most write endpoints. AI tool retries could create duplicates. Lead create has email/mobile dedup; contact create has email dedup; everything else duplicates on retry.

---

## Section 12 — Planned AI Use Cases

**No AI use cases are coded today.** Grep for `ai_agent`, `aiRuntime`, `agentTool`, `summary` returned no matches in the repo other than in this document. The list below is **recommended candidates** the AI Runtime team may want to wire up first, ordered by value × ease.

| Use case | Description | Output type | Entity | Status | Tools needed |
|---|---|---|---|---|---|
| `lead.summary` | One-paragraph lead briefing for the rep before a call | text | Lead | not built | `fetch_lead`, `list_activities`, `list_notes_for_entity`, `fetch_opportunities_for_lead` |
| `lead.next_action` | Suggest the next outreach action given current stage / activities | text | Lead | not built | `fetch_lead_with_related`, `fetch_lead_changelog` |
| `lead.draft_email` | Draft a follow-up email tailored to recent activity | DRAFT (text) | Lead | not built | `fetch_lead_with_related` |
| `lead.extract_from_notes` | Extract structured fields (industry, employees, budget) from `dynamicFields.notes` | json | Lead | not built | `fetch_lead`, `update_lead` (write back) |
| `account.health_brief` | Summarise account health, renewal risk, and opportunity pipeline | text | Account | not built | `fetch_account`, `fetch_account_leads`, `fetch_account_health` |
| `account.qbr_brief` | Quarterly Business Review prep doc | DRAFT | Account | not built | `fetch_account`, `run_canned_report` (account-specific reports) |
| `opportunity.next_step` | Recommend next stage transition + reasoning | text | Opportunity | not built | `fetch_opportunity_with_detail` |
| `opportunity.competitor_brief` | Brief on competitor presence given `clientMeetings.competitorName` history | text | Opportunity | not built | `fetch_opportunity_with_detail` |
| `task.daily_briefing` | Morning summary of overdue + due-today tasks for the user | text | Task | not built | `list_tasks` (smartView/duePreset) |
| `activity.disposition_suggestion` | After a call ends, suggest a disposition + next step | json | Activity / Call | not built | `fetch_lead`, `list_activities` |
| `dashboard.what_changed` | "Since yesterday" delta narrative | text | Dashboard | not built | `fetch_dashboard_*`, all timeseries |

For each use case, **`contextData` to pass to the model** should be the entity's recommended `/summary` shape from §5 (NOT the full row), plus the trimmed related collections (last N activities/tasks/notes). For each, **never include**: `password*`, `credentialsEncrypted` (CrmIntegrationConfig), AES-GCM crypto blobs, raw call recording URLs (the storage URL leaks the IndiaVoice host).

---

## Section 13 — Entity Relationships Relevant to AI

### 13.1 What context the AI should receive per use case

```
lead.summary context:
  - lead.summary fields (name, email, stage, status, ownerName, score, accountName, isStarred, updatedAt)
  - last 5 activities (type, subject, outcome, occurredAt) ← from /api/activities?leadId=
  - last 3 open tasks (subject, dueDate, priority) ← from /api/tasks?leadId=
  - last 3 notes (content) ← from /api/notes?relatedObjectId=
  - active opportunities (name, stage, amountDisplay, probability) ← /api/opportunities/by-lead/

account.health_brief context:
  - account.summary fields
  - count of leads, contacts, opportunities for this account
  - latest health score + renewalDate
  - last 3 AccountChange activities

opportunity.next_step context:
  - opportunity.summary fields
  - last 3 transitions (fromStage, toStage, occurredAt, notes)
  - last 3 client meetings (subject, outcome, competitorName)
  - product line items (productName, lineTotal)

task.daily_briefing context:
  - all tasks with smartView=overdue + smartView=today (subject, priority, dueDate, related entity name)
```

### 13.2 Fields that MUST be excluded from any AI context

| Source | Field | Reason |
|---|---|---|
| `CrmIntegrationConfig` | `credentialsEncrypted` | AES-GCM blob; never decrypt outside the integration runtime |
| `CrmCallLog` | `recordingUrl` (raw) | Use `/api/telephony/recording?url=...` proxy if needed |
| `CrmIndiaVoiceWebhookLog` | `rawPayload` | Provider PII + credentials |
| `CrmCtcCallAudit` | `providerResponse, errorMessage` | May contain provider session ids |
| `CrmPaymentVerification` | `metadata.reference` | Payment reference — financial PII |
| `CrmLead` | `dynamicFields[*]` where `requirement: "System"` | Internal tracking fields |
| `CrmLead` | `lat, long, addressLine1, addressLine2` | Granular location PII unless specifically requested |
| `User` (public schema) | `password`, `passwordResetToken` | Never send to model |

---

## Section 14 — Field Templates

### 14.1 Lead — standard fields ([types/field-definition.ts:48-62](types/field-definition.ts#L48-L62))

| key | label | type | required | values |
|---|---|---|---|---|
| name | Lead Name | Text | Required | — |
| email | Email | Email | Optional | — |
| phone | Phone | Phone | Optional | — |
| mobile | Mobile | Phone | Optional | — |
| company | Company | Text | Optional | — |
| jobTitle | Job title | Text | Optional | — |
| source | Source | Text | Optional | — (dynamic enum from `CrmLeadSource`) |
| stage | Stage | Select | Required | New, Contacted, Qualified, Proposal, Negotiation, Closed (default; org-overridable via `crmOrgWorkspaceSettings.settings.leadPipelineConfig.stages`) |
| status | Status | Select | Required | Open, Working, Disqualified, Converted (org-overridable) |
| score | Score | Number | System | — |
| ownerName | Owner | Text | Optional | — |

### 14.2 Lead — custom (org-customisable) fields

Stored as JSON array on `CrmOrgWorkspaceSettings.settings.leadFieldDefinitions`. Each entry follows `LeadFieldDefinition`:
```ts
{
  key: string,                                             // ^[a-z][a-zA-Z0-9_]{0,40}$
  label: string,
  fieldType: "Text"|"TextArea"|"Number"|"Email"|"Phone"|"Date"|"Boolean"|"Select"|"MultiSelect",
  requirement: "Required"|"Optional"|"System",
  visible: boolean,
  defaultValue?: string|number|boolean|null,
  helpText?: string,
  options?: string[],                                      // required for Select/MultiSelect
  isStandard?: boolean,
  showInList?: boolean
}
```
Stored values land in `CrmLead.dynamicFields` (JSON object, key → coerced value).
CRUD via `GET/POST /api/settings/fields`, `GET/PATCH/DELETE /api/settings/fields/[key]`.
Standard fields can be partially edited (label/visible/showInList) but cannot be retyped or rekeyed.

### 14.3 Other modules

**Accounts, Contacts, Opportunities, Activities, Tasks** — no custom-field system today. Schema columns are fixed.

### 14.4 Workspace settings catalog (also stored on `CrmOrgWorkspaceSettings.settings`)

| key | shape | consumed by |
|---|---|---|
| `leadPipelineConfig` | `{ stages[], statuses[], dependentRules: { sourceToStages, stageToStatuses } }` | Lead create/update validation, `/api/leads/stages` |
| `leadFieldDefinitions` | `LeadFieldDefinition[]` | Lead form + dynamicFields validation |
| `dashboard` | `{ qualifiedStages[], funnelStages[] }` | `/api/dashboard/funnel`, `/api/dashboard` |
| arbitrary path | any JSON | accessible via catch-all `GET/PATCH /api/settings/[...slug]` |

---

## Section 15 — Pagination and Filtering

### 15.1 Pagination contract ([lib/validators/pagination.ts](lib/validators/pagination.ts))

- **Type**: offset/limit — `page` (1+) + `pageSize` (allow-list `[10, 25, 50, 100]`, default `10`).
- **No cursor support in production.** A cursor iterator (`createPrismaCursorIterator`) exists in `lib/services/reports/prisma-cursor.ts` but is used only for streaming CSV/Excel exports.
- **Response envelope**: `{ items|data, total, page, pageSize, totalPages }` for new routes; older lead routes return raw `{ items, total, page, pageSize }`.
- **Sort tiebreaker**: every list query adds `id desc` as a secondary sort to keep page boundaries stable.

### 15.2 Filter parameter matrix per entity

**Leads (GET /api/leads query):** `q, stage, status, ownerId, isStarred, sortBy (createdAt|updatedAt|name|email|company|jobTitle|source|stage|status|score|ownerName|id), sortDir (asc|desc), onlyDeleted, includeDeleted`. Plus `format=csv|xlsx`.

**Leads (POST /api/leads/filter body):** filter DSL with operators `eq, neq, contains, notContains, startsWith, endsWith, isEmpty, isNotEmpty, gt, gte, lt, lte, between, before, after, on, in, notIn, isTrue, isFalse`. Both standard and custom fields supported. Custom fields use Prisma JSON path filters against `dynamicFields`.

**Contacts (GET /api/contacts query):** `q, accountId, ownerId, sortBy, sortDir`.
**Contacts (POST /api/contacts/filter):** same DSL as leads, **standard fields only**.

**Accounts (GET /api/accounts query):** `search, page, pageSize, trashed (admin), view (all|mine)`.
**Accounts (POST /api/accounts/filter):** body `{ conditions: [{ field, operator (eq|ne|contains|startsWith|endsWith|in|notIn|gt|gte|lt|lte|between|isNull|notNull), value?, values? }], combinator: AND|OR, page, pageSize, topLevelOnly }`.

**Opportunities (GET):** `trashed, stage, ownerId, accountId, q`.
**Opportunities (POST /api/opportunities/filter):** `{ stages[]?, ownerIds[]?, accountIds[]?, currencies[]?, closeDateFrom?, closeDateTo?, amountMin?, amountMax?, search? }`.

**Activities (GET):** `leadId, relatedKind, relatedObjectId, page, pageSize/limit (1..500)`.
**Activities (POST /api/activities/filter):** filter DSL with JSON-path support for `outreach.<key>` fields (Prisma `string_contains`/`equals`/etc.).

**Tasks (GET):** see §3.7 (smartView, duePreset, mine, etc.).
**Tasks (POST /api/tasks/filter):** `{ status[]?, priority[]?, relatedKind[]?, assignedToUserId[]?, dueFrom?, dueTo?, q?, smartView? }`.

### 15.3 Saved views & quick filters

- `crmLeadListView` (saved-views) — per-user, per-tenant.
- `crmLeadSavedList` (lead-lists) — per-user, per-tenant. Materialised via `GET /api/lead-lists/[id]/leads`.
- `crmQuickFilter` — per-user, per-module. `?module=` filter; `PUT /api/quick-filters/last-applied` sets the per-module "last applied" flag.

---

## Section 16 — Error Response Shapes

**Two envelope styles co-exist.** All routes return JSON.

**Style A — newer routes** (Contacts, Opportunities, Activities, Tasks/filter, Reports, Dashboard pinned-reports, Internal):
```
{ success: true, data: <result> }
{ success: false, error: "<message>", fieldErrors?: { [key]: string }, errors?: { [key]: string } }
```

**Style B — older routes** (Leads, Accounts list, Settings, Notes, Notifications, Telephony, Marketing, Imports):
```
{ items, total, page, pageSize, totalPages }   // success
{ error: "<message>", errors?: { [key]: string }, issues?: ZodFlatten }   // failure
```

### Standard error codes

| HTTP | Trigger | Body |
|---|---|---|
| 400 | Zod validation failure / bad query / `stage` field on Opp PATCH | `{ error: "Validation failed" \| "Invalid query" \| "Invalid body", errors|fieldErrors|issues }` |
| 401 | No NextAuth session | `{ error: "Unauthorized" }` (or `{ success: false, error: "Unauthorized" }`) |
| 403 | `assertModule` / `assertAccountAccess` failure / non-admin trash view / non-admin Account create with ACL | `{ error: "Forbidden: <action> on <module>" }` (status code from `error.statusCode = 403`) |
| 404 | Cross-tenant or missing entity | `{ error: "Not found" }` |
| 409 | Email/mobile/phone duplicate (lead, contact); name collision (lead source, settings entities); already-converted lead; lead not in trash for permanent delete | `{ error: "<entity>-specific message", errors?: { field: msg }, existingId? }` |
| 410 | Lead in trash (PATCH/transition) | `{ error: "Lead is in trash. Restore it before editing." }` |
| 422 | Saved list with malformed filters | `{ error: "Saved list has malformed filters" }` |
| 429 | **none — no rate limiting wired** | n/a |
| 500 | Unhandled exception | `{ error: error.message }` (Style B) or `{ success: false, error }` (Style A) |
| 503 | Redis required but disabled (queue routes, `/api/leads/stream`) | `{ error: "..." }` plain text body in some routes |

There is **no machine-readable error code field** (`{ code: "VALIDATION_ERROR" }` is not implemented). The AI Runtime tool executor must parse `error` strings if it needs to differentiate.

---

## Section 17 — Rate Limits

**No per-route rate limiting is configured anywhere in `apps/quikcrm/`.** Grep for `rateLimit, throttle, limiter, ratelimit` returns no application-level matches.

The env config exposes `THROTTLE_TTL_MS` (60000) and `THROTTLE_LIMIT` (120) defaults via [lib/env.ts:17-18](lib/env.ts#L17-L18) but **no code consumes them** — they're holdovers from the legacy NestJS backend.

| Concern | Status |
|---|---|
| AI tool burst calls | No protection |
| Webhook flood | No protection (telephony webhooks rely on provider rate-limits) |
| Auth brute force | Delegated to NextAuth / QuikIT IdP |
| Import worker concurrency | BullMQ-controlled, not per-route |
| Search query cost | No throttling — minimum 2 chars |

429 responses are not produced anywhere. If the AI Runtime hammers `POST /api/leads/filter`, every request is served until Postgres saturates.

**Recommendation (P3)**: add a Redis-backed sliding window limiter on writes (especially `POST /api/leads`, `POST /api/contacts`, `POST /api/telephony/call`).

---

## Section 18 — Environment Variables

### 18.1 `.env.example` verbatim

```
# Copy to .env.local and fill in your local-dev values. Never commit .env.local.
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/quikit_dev"
MIGRATION_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/quikit_dev"

# NextAuth — generate with `openssl rand -base64 32`. Replace before first run.
NEXTAUTH_SECRET="REPLACE_WITH_OPENSSL_RAND_BASE64_32"
NEXTAUTH_URL="http://localhost:3009"

# QuikIT OAuth (SSO from the launcher).
QUIKIT_CLIENT_ID="dev-client-id-placeholder"
QUIKIT_CLIENT_SECRET="dev-client-secret-placeholder"
QUIKIT_ISSUER_URL="http://localhost:3000"

# Optional: only set if your app needs Sentry locally. Leave blank for dev.
NEXT_PUBLIC_SENTRY_DSN=""
SENTRY_AUTH_TOKEN=""
```

### 18.2 Required for basic operation

| Variable | What it's for |
|---|---|
| `DATABASE_URL` | Postgres pooled connection (runtime) |
| `MIGRATION_DATABASE_URL` | Postgres direct connection (Prisma migrate) — `lib/env.ts` reads as `DATABASE_URL_DIRECT` (mismatch — see gap below) |
| `NEXTAUTH_SECRET` | NextAuth JWT signing |
| `NEXTAUTH_URL` | Local: `http://localhost:3009` |
| `QUIKIT_CLIENT_ID`, `QUIKIT_CLIENT_SECRET`, `QUIKIT_ISSUER_URL` | OAuth client to QuikIT IdP |
| `JWT_SECRET` (read by `lib/env.ts`, ≥16 chars; ≥32 chars in production) | Legacy NestJS-era token signing — still consumed at module load time |

### 18.3 Required for AI Runtime integration

**None today.** When the AI Runtime is wired up:

| Variable | What it's for |
|---|---|
| `INTERNAL_AI_RUNTIME_URL` (NEW) | Base URL of the AI Runtime to call from this app (e.g. for `summary` requests) |
| `INTERNAL_AI_RUNTIME_SECRET` (NEW) | Shared secret to validate inbound AI Runtime tool calls |
| `AI_TOOL_DRY_RUN` (NEW) | Boolean — if true, all SOFT/MEDIUM/HIGH writes log only |

### 18.4 Optional / feature-gated

| Variable | Feature |
|---|---|
| `REDIS_URL` | BullMQ queue, `/api/leads/stream` SSE, automation execution |
| `RP_DIGITAL_BASE_URL`, `RP_DIGITAL_AUTHCODE` (or `RP_DIGITAL_BASIC_USER`+`PASSWORD`), `RP_DIGITAL_DESKPHONE`, `RP_DIGITAL_CALLING_PARTY_A`, `RP_DIGITAL_WAITTIME`, `RP_DIGITAL_CALL_LIMIT`, `RP_DIGITAL_UID`, `RP_DIGITAL_CALL_FROM_DID`, `RP_DIGITAL_HTTP_TIMEOUT_MS` | IndiaVoice / RP Digital telephony |
| `RP_DIGITAL_WEBHOOK_SECRET` | Webhook signature validation (required when `WEBHOOK_REQUIRE_SECRET=true`) |
| `WEBHOOK_DEFAULT_ORG_ID`, `WEBHOOK_TRUST_PAYLOAD_ORG_ID`, `WEBHOOK_REQUIRE_SECRET` | Webhook handler config |
| `IMPORT_MAX_ATTEMPTS`, `IMPORT_WORKER_NAME` | BullMQ import worker tuning |
| `THROTTLE_TTL_MS`, `THROTTLE_LIMIT` | **Not consumed by any code today** |
| `COOKIE_SECURE`, `COOKIE_SAMESITE`, `COOKIE_DOMAIN` | Cookie config |
| `DEFAULT_ORG_ID`, `SEED_DEMO_PASSWORD` | Seed data |
| `NEXT_PUBLIC_APP_URL` | Public app URL for absolute links |
| `NEXT_PUBLIC_DASHBOARD_REFRESH_MS` | Dashboard auto-refresh (default 60000) |
| `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN` | Sentry instrumentation |

### 18.5 Variables referenced in code but missing from `.env.example`

These names are required by `lib/env.ts` (the env validator) or used elsewhere but **not documented** in `.env.example`:

`JWT_SECRET, JWT_ACCESS_EXPIRES_IN, JWT_REFRESH_EXPIRES_IN, COOKIE_SECURE, COOKIE_SAMESITE, COOKIE_DOMAIN, DEFAULT_ORG_ID, SEED_DEMO_PASSWORD, THROTTLE_TTL_MS, THROTTLE_LIMIT, IMPORT_MAX_ATTEMPTS, IMPORT_WORKER_NAME, REDIS_URL, RP_DIGITAL_*` (all), `WEBHOOK_DEFAULT_ORG_ID, WEBHOOK_TRUST_PAYLOAD_ORG_ID, WEBHOOK_REQUIRE_SECRET, NEXT_PUBLIC_APP_URL, DATABASE_URL_DIRECT` (read by Prisma directly; `.env.example` documents `MIGRATION_DATABASE_URL` instead — **inconsistent**).

---

## Section 19 — Dependencies

### Platform packages (from [package.json](package.json))

| Package | Version | Used? | AI-Runtime relevance |
|---|---|---|---|
| `@quikit/auth` | `*` | yes | session + middleware |
| `@quikit/database` | `*` | yes | Prisma client + types |
| `@quikit/shared` | `*` | yes | constants only |
| `@quikit/ui` | `*` | yes | UI components |
| `@quikit/audit` | — | **no** | audit log writes |
| `@quikit/ai-sdk` | — | **no** | tool registration / context |
| `@quikit/search-sdk` | — | **no** | search indexing |

### Notable runtime deps

`next 14.0.4`, `react 18.2.0`, `next-auth 4.24`, `bullmq 5.34`, `ioredis 5.4.2`, `axios 1.7.9`, `zod 3.24.1`, `recharts 2.13.3`, `xlsx 0.18.5`, `libphonenumber-js 1.12.42`, `@xyflow/react 12.10.2`, `@dnd-kit/core 6.3.1`, `@tanstack/react-query 5.28`, `jose 5.9.6`, `bcryptjs 2.4.3`, `next-themes 0.2.1`, `cookie 1.0.2`, `react-country-flag 3.1.0`, `react-hook-form 7.54.2`, `date-fns 4.1.0`.

### Dev deps

`vitest 4.1.4`, `vitest-mock-extended 4.0`, `jsdom 25`, `@testing-library/react 16.3.2`, `tailwindcss 3.4.17`, `eslint 8.57.1`, `eslint-config-next 14.2.18`, `tsx 4.19.2`, `typescript 5.7.2`.

### Platform packages NOT yet installed but needed for AI Runtime

- `@quikit/ai-sdk` — for tool definition, summary endpoint scaffolding, `actingAs`/`actingAgentId` propagation.
- `@quikit/audit` — to migrate the in-house `audit()` to the platform contract and add `actorType` field.
- `@quikit/search-sdk` — for cross-entity semantic / full-text search.

---

## Section 20 — Required Changes (P0 → P3)

### P0 — Required before any AI tool can call this app

1. [ ] **Install `@quikit/ai-sdk`** and add the canonical `withTenantAuth` wrapper that supports `actingAs: "user"|"ai_agent"|"system"` and `actingAgentId?: string`. Refactor at least `requireApiUser()` + `assertModule()` shim to read those fields.
2. [ ] **Create `GET /api/internal/manifest`** returning the augmented manifest: `{ ...manifest, entities: EntityDescriptor[], permissions: Permission[], schemaVersion }` so the platform registry can discover capabilities.
3. [ ] **Populate `manifest.permissions[]`** with the ~40 actually-enforced strings from §4.4. Currently empty — launcher has no idea what QuikCRM declares.
4. [ ] **Add `/summary` endpoints for the 6 primary entities**: lead, contact, account, opportunity, activity, task. Shapes per §5. Each returns a deep-link `url`, displayName, ownerName, status indicators, `recentActivity` where applicable.
5. [ ] **Add a service-JWT validator** so the AI Runtime can call without forging a NextAuth cookie. Either accept `Authorization: Bearer <signed JWT>` minted by the platform with `tenantId, userId, actingAs, actingAgentId` claims, OR add a server-to-server NextAuth credential provider.
6. [ ] **Add ACL to `/api/search`** — currently leaks lead/contact/account names across account scopes.
7. [ ] **Add `notes:view, notes:create, notes:edit, notes:delete` enforcement** to `/api/notes`.
8. [ ] **Add module gates** to `/api/quick-filters/*` (`settings:edit`?), `/api/lead-lists/*` (`leads:view`), `/api/leads/saved-views/*` (`leads:view`), `/api/leads/sources/*` (`settings:*`), `/api/leads/stages` (`leads:view`).
9. [ ] **Audit `POST /api/leads/[id]/transition`, `POST /api/leads/[id]/convert`, `PATCH /api/leads/[id]/favorite`** — currently silent.
10. [ ] **Document `ownerName` derivation** for AI tools — it is server-managed; AI tools must NOT pass `ownerName` on create/update (it gets ignored / overwritten).

### P1 — Required for specific AI use cases to work

1. [ ] **Add `@quikit/search-sdk`** integration — index lead/account/contact/opportunity/activity/task on create/update/delete. Snippet templates per §6.
2. [ ] **Add module gates for Telephony** routes (`telephony:call`, `telephony:disposition`, `telephony:configure`).
3. [ ] **Add module gates for Marketing** routes (`campaigns:view|create`, `forms:view|create`, etc.).
4. [ ] **Add module gates for Settings catch-all** (`/api/settings/[...slug]`, `/api/settings/workspace`, `/api/settings/fields`) — currently auth-only.
5. [ ] **Add ACL filtering** to `/api/users/picker` (or document as tenant-wide).
6. [ ] **Add idempotency keys** on `POST /api/leads`, `POST /api/contacts`, `POST /api/opportunities`, `POST /api/activities`, `POST /api/tasks` — header `Idempotency-Key`, stored in a small Redis cache, returns the original response on retry.
7. [ ] **Standardise the response envelope.** Migrate Style B routes to `{ success, data }` per the root CLAUDE.md mandate. Or formalise both styles in the AI Runtime tool result parser.
8. [ ] **Add `recentActivity` field** to entity summaries (lead/account/opportunity) — derived from a fast `crmActivity.findFirst` keyed on `(tenantId, relatedKind, relatedObjectId, occurredAt desc)`. Already indexed.
9. [ ] **Add `relatedCounts` to account/opportunity summaries** — `leadCount, contactCount, opportunityCount, openTaskCount` for at-a-glance briefings.

### P2 — Required for full audit trail of AI actions

1. [ ] **Migrate to `@quikit/audit`** OR extend `lib/services/audit.ts` with `actorType: "user"|"ai_agent"|"system"` + `actingAgentId`. Plumb through `recordLeadChange`, `writeAccountActivity`, `recordTransition`, `audit()` (Settings), and the inline `crmActivity.create` calls in account/opportunity/task routes.
2. [ ] **Unify the change-log surface** — currently three separate writers (`recordLeadChange` → `CrmAuditLog`, account/opportunity/task → `CrmActivity`, settings → `CrmAuditLog` via `audit()`). Reads of "what changed on entity X" should hit one table.
3. [ ] **Audit telephony actions**: `POST /api/telephony/call`, `POST /api/telephony/call-logs`, dispositions create/update.
4. [ ] **Audit `POST /api/payment-verifications`** (currently no audit, no permission).
5. [ ] **Add audit retention policy** (current `CrmAuditLog` grows unboundedly).

### P3 — Recommended improvements

1. [ ] **Add per-route rate limiting** (Redis-backed sliding window) to writes, `/api/search`, `/api/leads/stream` connection establishment, `/api/imports/queue/*`. Use the existing `THROTTLE_TTL_MS` / `THROTTLE_LIMIT` env vars.
2. [ ] **Add cursor pagination** for AI agents that page through large lead lists (`POST /api/leads/filter` with `cursor` instead of `page`). Already supported by `createPrismaCursorIterator` in `lib/services/reports/prisma-cursor.ts` — just needs a route flag.
3. [ ] **Standardise `createdByUserId`** on every model that mutates — currently only `CrmAccount`, `CrmOpportunity`, `CrmLeadImportJob` have it.
4. [ ] **Add `/api/internal/health/ai`** that pings the AI Runtime + reports tool execution latency P50/P95.
5. [ ] **Migrate the legacy `recordLeadChange` schema** to record top-level `changedFields[]` so `?field=` filtering on the changelog can be a SQL filter rather than in-memory.
6. [ ] **Document the dual response envelope** in a top-level README so AI Runtime engineers know which routes return which shape.
7. [ ] **Consolidate webhook entry points** — `/api`, `/api/telephony/webhook`, `/api/telephony/india-voice/webhook` all do the same thing.

---

## Section 21 — Data the AI Runtime Will Need to Read

Per use case from §12, here is the chain of API calls each agent run requires.

### `lead.summary`
```
1. GET /api/leads/[id]                       → lead row
2. GET /api/activities?leadId=&pageSize=5    → recent 5 activities
3. GET /api/tasks?leadId=&pageSize=3&status=Open  → open tasks
4. GET /api/notes?relatedObjectId=[id]       → notes (last 100 by default; trim to 3)
5. GET /api/opportunities/by-lead/[id]       → active opps
```
**Missing endpoint to add: `GET /api/leads/[id]/summary`** — would collapse 1+5 into a single round trip and trim payload to summary fields only.

### `lead.next_action`
```
1. GET /api/leads/[id]/full     → already aggregates everything
2. GET /api/leads/[id]/changelog?pageSize=20  → recent stage/owner changes
```

### `account.health_brief`
```
1. GET /api/accounts/[id]                              → account row
2. GET /api/accounts/[id]/leads?limit=50               → leads on account
3. GET /api/contacts?accountId=[id]&pageSize=50        → contacts
4. POST /api/opportunities/filter { accountIds: [id] } → opportunities
5. GET /api/accounts/health-summary?ownerId=<owner>    → tenant-level health context
```
**Missing endpoint to add**: `GET /api/accounts/[id]/summary` with embedded counts.

### `opportunity.next_step`
```
1. GET /api/opportunities/[id]/detail   → opp + meetings + products + transitions
```
Already a single round trip — this is the most "AI ready" entity.

### `task.daily_briefing`
```
1. GET /api/tasks?duePreset=overdue&assignedToUserId=<self>&pageSize=100
2. GET /api/tasks?duePreset=today&assignedToUserId=<self>&pageSize=100
3. (optional) GET /api/dashboard/at-risk → for cross-cutting staleness
```

### `dashboard.what_changed`
```
1. GET /api/dashboard?from=<yesterday>&to=<today>
2. GET /api/dashboard?from=<-2d>&to=<yesterday>   → for delta
3. GET /api/dashboard/timeseries?metric=activities&from=&to=
```

### Endpoints flagged as needed but missing
- `GET /api/{lead,contact,account,opportunity,activity,task}/[id]/summary` — all six.
- `GET /api/internal/manifest` — to discover what's available without reading the codebase.
- Cursor-paginated `/api/leads/filter` — for agents that scan large datasets.

---

## Section 22 — Anything Else the AI Team Should Know

### Authentication quirks
- **NextAuth session is the only accepted credential.** EventSource calls (`/api/leads/stream`) work because cookies are sent same-origin. The AI Runtime calling cross-origin will need either cookie forwarding or the new service-JWT path (P0).
- **Role mapping** in [lib/auth/require.ts:26-37](lib/auth/require.ts#L26-L37) maps QuikIT membership roles into legacy CRM roles: `admin/owner/super_admin/administrator → "Administrator"`, `manager → "SalesManager"`, `marketing → "MarketingUser"`, `finance → "FinanceUser"`, anything else → `"SalesUser"`. AI agents inheriting an Admin user's session will bypass every permission gate.
- **Empty permission template = unrestricted access** ([lib/auth/permissions.ts:113-117](lib/auth/permissions.ts#L113-L117)) — backwards-compat behaviour. AI agents using new dev tenants where templates aren't seeded will pass every gate.

### Request behaviour for service vs. user calls
- No code path differentiates today.
- When service-JWT is added (P0), the recommendation is: service calls **bypass field masking** (`maskHiddenLeadFields` is a UI concern, not a security concern) but **still respect `accountScopeFilter`** when the JWT carries an impersonated `userId`.

### Planned schema migrations
- The `CrmCallDisposition.name` column is intentionally nullable for backfill — integration owner is expected to make it `NOT NULL` in a follow-up migration. AI tools that read `name` should fall back to `label`.
- The `CrmTask` model lacks `description, completedAt/By, cancellationReason, snoozedFromDueDate, parentTaskId, recurrenceRule, sourceCallLogId`, and the `Waiting` status. Tracked for the next PR (see comments in [lib/services/tasks/index.ts:1-10](lib/services/tasks/index.ts#L1-L10)).

### Third-party integrations touching AI-relevant data
- **IndiaVoice / RP Digital** — telephony provider. Webhook payloads land in `CrmIndiaVoiceWebhookLog.rawPayload` (provider-secret validated). Inbound calls auto-create `CrmCallLog` rows with `agentUserId, leadId` correlation; AI agents reading call history should join through `lead.callLogs`.
- **No CRM-side email/SMS sender today** (`CrmOutboundMessageLog` exists but no route writes it).

### Performance concerns
- `GET /api/leads/[id]/full` runs **6 parallel Prisma queries**, each capped at 50 rows. Returns up to ~250 rows + the lead — large for prompt context. Trim before sending to model.
- `GET /api/activities` defaults to `pageSize=100, max=500` — distinct from the standard 10/25/50/100 contract. AI agents should pass `pageSize=10` explicitly when only a sample is needed.
- `/api/leads/stream` SSE subscriber is created per-connection (Redis duplicate). Vercel function timeout (10s/60s/900s by tier) ends the stream — EventSource auto-reconnects. **For production AI observability use Pusher / Ably / a long-lived host** (per inline comment in the route).
- The settings catch-all `/api/settings/[...slug]` deep-clones the entire `settings` JSON tree on every PATCH — fine for ≤10 KB blobs, slow at scale.

### Things that confused me / look incomplete
- **`withTenantAuth` HOF exists but is unused** ([lib/api/withTenantAuth.ts](lib/api/withTenantAuth.ts)). Routes inline the same boilerplate. Migration would simplify the audit-flag plumbing in P0.
- **`withTenantAuthForModule` is a placeholder** that returns the same thing as `withTenantAuth` — module feature-gating is "wired in later via @quikit/auth/feature-gate".
- **The settings module has TWO "audit" surfaces**: `audit()` from `lib/services/audit.ts` and the change-log writers (`recordLeadChange`, `recordTransition`, inline `crmActivity.create` for accounts/tasks). Reading audit history requires querying both `CrmAuditLog` AND `CrmActivity`.
- **`ownerName`** is a denormalised column on Lead/Account/Contact/Opportunity that is server-managed via `deriveOwnerName(ownerId)`. Clients should never set it on create/update; it gets ignored on accounts (PATCH explicitly comments "ownerName is server-managed; ignore any client-supplied value") and overwritten elsewhere.
- **The dual-pattern audit** (lead changes → `CrmAuditLog`, account/opp changes → `CrmActivity`) is **historical drift**, not a deliberate split — collapsing them is a P2 change with significant testing surface.
- **`/api` short-URL fallback** exists only because IndiaVoice's panel sometimes rejects deeper paths — re-export of the webhook handler. Surprising on first read.
- **`/api/telephony/twilio/*` routes** exist for legacy URL compatibility only; the actual provider is IndiaVoice. The `twilio/status` endpoint reports `isConfigured()` for IndiaVoice env vars, not Twilio.
- **`TASK_RELATED_KINDS = ["Lead", "Opportunity", "Contact", "Account"]`** is PascalCase in the validator but the legacy DB has lowercase variants too (handled in queries via `OR: [{ relatedKind }, { relatedKind: relatedKind.toLowerCase() }]`). Don't normalise without checking historical data.
- **`CrmActivity.relatedKind`** has no enum constraint at the DB level; values like `"Lead"`, `"lead"`, `"Account"`, `"Opportunity"`, `"OpportunityClientMeeting"`, `"AccountChange"`, `"BulkOwnershipChange"`, `"TaskChange"` all coexist. AI tools filtering by relatedKind should use a case-insensitive match or a fixed `IN [...]` list.

---

## Appendix A — Module → Route Index (for quick lookup)

```
auth     /api/auth/[...nextauth]
health   /api/health
root     /api  (re-export of india-voice webhook)

leads    /api/leads
         /api/leads/[id]
         /api/leads/[id]/full
         /api/leads/[id]/restore
         /api/leads/[id]/permanent
         /api/leads/[id]/transition
         /api/leads/[id]/convert
         /api/leads/[id]/favorite
         /api/leads/[id]/changelog
         /api/leads/filter
         /api/leads/picker
         /api/leads/kanban/board
         /api/leads/stream      (SSE)
         /api/leads/stages
         /api/leads/sources, /api/leads/sources/[id]
         /api/leads/saved-views, /api/leads/saved-views/[viewId], /api/leads/saved-views/counts

contacts /api/contacts, /api/contacts/[id], /api/contacts/filter, /api/contacts/picker

accounts /api/accounts, /api/accounts/[id], /api/accounts/[id]/restore
         /api/accounts/[id]/leads, /api/accounts/[id]/leads/bulk-assign
         /api/accounts/filter, /api/accounts/picker
         /api/accounts/health-summary, /api/accounts/acl-scope

opps     /api/opportunities, /api/opportunities/[id]
         /api/opportunities/[id]/transition, /api/opportunities/[id]/restore
         /api/opportunities/[id]/detail
         /api/opportunities/[id]/products, /api/opportunities/[id]/products/[productId]
         /api/opportunities/[id]/client-meetings
         /api/opportunities/by-lead/[leadId]
         /api/opportunities/pipeline, /api/opportunities/picker
         /api/opportunities/filter

acts     /api/activities, /api/activities/[id], /api/activities/filter
         /api/activities/lead-log, /api/activities/meta/lead-log
         /api/activities/smb-outreach, /api/activities/smb-outreach/meta

tasks    /api/tasks, /api/tasks/[id], /api/tasks/[id]/snooze, /api/tasks/filter

notes    /api/notes
notif    /api/notifications, /api/notifications/[id]/read

dash     /api/dashboard, /api/dashboard/timeseries
         /api/dashboard/funnel, /api/dashboard/at-risk, /api/dashboard/pinned-reports

settings /api/settings/users, /api/settings/users/[id]
         /api/settings/users/[id]/{disable,enable,reset-password}
         /api/settings/teams, /api/settings/teams/[id]
         /api/settings/sales-groups, /api/settings/sales-groups/[id]
         /api/settings/sales-groups/[id]/{members,accounts}
         /api/settings/permission-templates, /api/settings/permission-templates/[id]
         /api/settings/audit, /api/settings/workspace
         /api/settings/fields, /api/settings/fields/[key]
         /api/settings/[...slug]   (catch-all OrgWorkspaceSettings tree)

mktg     /api/marketing/{campaigns,forms,landing-pages,widgets}
auto     /api/automations/workflows, /api/automations/workflows/[id]/execute

tel      /api/telephony/{call,call-logs,dispositions,member-list,register-member,recording}
         /api/telephony/{webhook,india-voice/webhook,india-voice/call-session-status}
         /api/telephony/twilio/{status,click-to-call}

import   /api/imports/jobs, /api/imports/jobs/[id]/{reconciliation,retry}
         /api/imports/queue/{leads,activities,sla,workflows}

lists    /api/lead-lists, /api/lead-lists/[id], /api/lead-lists/[id]/leads
qf       /api/quick-filters, /api/quick-filters/last-applied

reports  /api/reports/canned, /api/reports/canned/[id], /api/reports/canned/previews

misc     /api/search, /api/users/picker, /api/payment-verifications

internal /api/internal/accounts/reconcile-owner-names   (the only internal route)
```

---

**End of document.**

