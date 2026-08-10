# QuikCRM Core Data Model — Lead, Account, Contact, Opportunity

> **Source of truth:** [`packages/database/prisma/schema.prisma`](../packages/database/prisma/schema.prisma)
> All four CRM modules live in the shared database package (not in `apps/quikcrm`) and are defined in the PostgreSQL schema **`app_quikcrm`** (`@@schema("app_quikcrm")`).
>
> **Naming note:** In Prisma the models are prefixed with `Crm` — `CrmLead`, `CrmAccount`, `CrmContact`, `CrmOpportunity`. There is a separate `Account` model in the schema, but it is the **NextAuth/OAuth** account (in the `auth` schema) and is unrelated to the CRM.
>
> **Type legend:** Prisma types map to logical types as: `String` → String · `Int` → Number (integer) · `Float` → Number (float) · `Decimal @db.Decimal(18,2)` → Number (fixed-precision money) · `Boolean` → Boolean · `DateTime` → DateTime · `Json` → JSON · `String[]` → Array of String · a model name (e.g. `CrmAccount`) → Relation. A trailing `?` means **Optional**; no `?` means **Required**. Fields with `@default(...)` are effectively optional on write (the DB supplies a value).

---

## 1. Lead (`CrmLead`)

| Field | Data Type | Required / Optional | Notes |
|---|---|---|---|
| `id` | String | Required | `@id @default(cuid())` — primary key |
| `orgId` | String | Required | Tenant scoping column (indexed) |
| `name` | String | Required | |
| `email` | String | Optional | |
| `phone` | String | Optional | |
| `mobile` | String | Optional | |
| `company` | String | Optional | |
| `jobTitle` | String | Optional | |
| `source` | String | Optional | |
| `stage` | String | Required | `@default("New")` |
| `status` | String | Required | `@default("Open")` |
| `substatus` | String | Optional | |
| `score` | Number (Int) | Required | `@default(0)` |
| `ownerId` | String | Optional | |
| `ownerName` | String | Optional | |
| `accountId` | String | Optional | **FK → CrmAccount.id** |
| `linkedContactId` | String | Optional | Soft link (column only — no Prisma relation) |
| `externalId` | String | Optional | Part of unique key `lead_external_uk` |
| `sourceSystem` | String | Optional | Part of unique key `lead_external_uk` |
| `country` | String | Optional | |
| `industry` | String | Optional | |
| `secondaryEmail` | String | Optional | |
| `website` | String | Optional | |
| `linkedinUrl` | String | Optional | |
| `annualRevenueDisplay` | String | Optional | |
| `leadQuality` | String | Optional | |
| `isDisengaged` | Boolean | Required | `@default(false)` |
| `isStarred` | Boolean | Required | `@default(false)` (indexed) |
| `followupPriority` | String | Optional | |
| `addressLine1` | String | Optional | |
| `addressLine2` | String | Optional | |
| `area` | String | Optional | |
| `cityName` | String | Optional | |
| `stateName` | String | Optional | |
| `postalCode` | String | Optional | |
| `lat` | Number (Float) | Optional | |
| `long` | Number (Float) | Optional | |
| `convertedAt` | DateTime | Optional | |
| `dynamicFields` | JSON | Optional | Custom/extensible fields |
| `firstName` | String | Optional | |
| `lastName` | String | Optional | |
| `leadType` | String | Optional | |
| `descriptionInformation` | String | Optional | |
| `topic` | String | Optional | |
| `technology` | JSON | Optional | |
| `requirementDetails` | JSON | Optional | |
| `budgetAmount` | Number (Decimal 18,2) | Optional | |
| `budgetCurrency` | String | Optional | |
| `purchaseTimeframe` | String | Optional | |
| `sourceDetails` | String | Optional | |
| `contactLinkedinUrl` | String | Optional | |
| `nextFollowUpAt` | DateTime | Optional | |
| `lastContactedAt` | DateTime | Optional | |
| `followupNotes` | String | Optional | |
| `internalRemarks` | String | Optional | |
| `createdAt` | DateTime | Required | `@default(now())` |
| `updatedAt` | DateTime | Required | `@updatedAt` |
| `deletedAt` | DateTime | Optional | Soft-delete marker (indexed) |
| `account` | Relation → CrmAccount | Optional | Via `accountId` |
| `contacts` | Relation → CrmContact[] | — | One-to-many (Lead has many Contacts) |
| `attachments` | Relation → CrmLeadAttachment[] | — | One-to-many |
| `activities` | Relation → CrmActivity[] | — | One-to-many |
| `tasks` | Relation → CrmTask[] | — | One-to-many |
| `notes` | Relation → CrmNote[] | — | One-to-many |
| `callLogs` | Relation → CrmCallLog[] | — | One-to-many |
| `slaTracking` | Relation → CrmSlaLeadTracking[] | — | One-to-many |

**Constraints & indexes:** `@@unique([orgId, sourceSystem, externalId])` (named `lead_external_uk`); indexes on `orgId`, `stage`, `ownerId`, `accountId`, `isStarred`, `deletedAt`.

---

## 2. Account (`CrmAccount`)

| Field | Data Type | Required / Optional | Notes |
|---|---|---|---|
| `id` | String | Required | `@id @default(cuid())` — primary key |
| `orgId` | String | Required | Tenant scoping column (indexed) |
| `name` | String | Required | |
| `segment` | String | Optional | Free-text segment |
| `ownerId` | String | Optional | |
| `ownerName` | String | Optional | |
| `industry` | String | Optional | |
| `website` | String | Optional | |
| `city` | String | Optional | |
| `status` | String | Optional | `@default("Active")` |
| `annualRevenueDisplay` | String | Optional | |
| `annualRevenueAmount` | Number (Decimal 18,2) | Optional | |
| `annualRevenueCurrency` | String | Optional | `@default("INR")` |
| `segmentEnum` | Enum `CrmAccountSegment` | Optional | Typed counterpart to `segment` |
| `industryKey` | String | Optional | |
| `countryCode` | String | Optional | |
| `state` | String | Optional | |
| `postalCode` | String | Optional | |
| `parentAccountId` | String | Optional | **FK → CrmAccount.id** (self-reference) |
| `healthScore` | Number (Int) | Optional | |
| `contractStart` | DateTime | Optional | |
| `contractEnd` | DateTime | Optional | |
| `renewalDate` | DateTime | Optional | |
| `npsScore` | Number (Int) | Optional | |
| `tags` | Array of String | Required | `@default([])` |
| `defaultPriceListId` | String | Optional | **FK → CrmPriceList.id** |
| `deletedAt` | DateTime | Optional | Soft-delete marker |
| `createdByUserId` | String | Optional | |
| `createdAt` | DateTime | Required | `@default(now())` |
| `updatedAt` | DateTime | Required | `@updatedAt` |
| `parent` | Relation → CrmAccount | Optional | Self-hierarchy (`CrmAccountHierarchy`), via `parentAccountId` |
| `children` | Relation → CrmAccount[] | — | Self-hierarchy child list |
| `defaultPriceList` | Relation → CrmPriceList | Optional | `AccountDefaultPriceList`, `onDelete: SetNull` |
| `contacts` | Relation → CrmContact[] | — | One-to-many |
| `leads` | Relation → CrmLead[] | — | One-to-many |
| `opportunities` | Relation → CrmOpportunity[] | — | One-to-many |
| `userAccess` | Relation → CrmUserAccountAccess[] | — | One-to-many (access control) |
| `groupAccess` | Relation → CrmSalesGroupAccount[] | — | One-to-many (access control) |

**Indexes:** `orgId` and additional combinations.

---

## 3. Contact (`CrmContact`)

| Field | Data Type | Required / Optional | Notes |
|---|---|---|---|
| `id` | String | Required | `@id @default(cuid())` — primary key |
| `orgId` | String | Required | Tenant scoping column (indexed) |
| `firstName` | String | Required | |
| `lastName` | String | Optional | |
| `email` | String | Optional | (indexed) |
| `phone` | String | Optional | (indexed) |
| `title` | String | Optional | |
| `accountId` | String | Optional | **FK → CrmAccount.id** (indexed) |
| `leadId` | String | Optional | **FK → CrmLead.id** |
| `ownerId` | String | Optional | (indexed) |
| `ownerName` | String | Optional | |
| `city` | String | Optional | |
| `contactStage` | String | Optional | |
| `source` | String | Optional | |
| `deletedAt` | DateTime | Optional | Soft-delete marker (indexed) |
| `createdAt` | DateTime | Required | `@default(now())` |
| `updatedAt` | DateTime | Required | `@updatedAt` |
| `account` | Relation → CrmAccount | Optional | Via `accountId` |
| `lead` | Relation → CrmLead | Optional | Via `leadId` |

**Indexes:** `orgId`, `email`, `accountId`, `ownerId`, `phone`, `deletedAt`.

---

## 4. Opportunity (`CrmOpportunity`)

| Field | Data Type | Required / Optional | Notes |
|---|---|---|---|
| `id` | String | Required | `@id @default(cuid())` — primary key |
| `orgId` | String | Required | Tenant scoping column (indexed) |
| `name` | String | Required | |
| `stage` | Enum `CrmOpportunityStage` | Required | `@default(Prospecting)` |
| `probability` | Number (Int) | Required | `@default(10)` |
| `amount` | Number (Decimal 18,2) | Optional | |
| `currency` | String | Optional | `@default("INR")` |
| `closeDate` | DateTime | Optional | |
| `accountId` | String | Optional | **FK → CrmAccount.id** (indexed) |
| `leadId` | String | Optional | Soft link (column only — no Prisma relation) |
| `ownerId` | String | Optional | (indexed) |
| `ownerName` | String | Optional | |
| `weightedAmount` | Number (Decimal 18,2) | Optional | |
| `closeReason` | String | Optional | |
| `closeReasonCategory` | String | Optional | |
| `competitorName` | String | Optional | |
| `lastStageChangeAt` | DateTime | Optional | |
| `lastActivityAt` | DateTime | Optional | |
| `priceListId` | String | Optional | **FK → CrmPriceList.id** |
| `deletedAt` | DateTime | Optional | Soft-delete marker (indexed) |
| `createdByUserId` | String | Optional | |
| `createdAt` | DateTime | Required | `@default(now())` |
| `updatedAt` | DateTime | Required | `@updatedAt` |
| `account` | Relation → CrmAccount | Optional | Via `accountId` |
| `priceList` | Relation → CrmPriceList | Optional | Via `priceListId`, `onDelete: SetNull` |
| `clientMeetings` | Relation → CrmOpportunityClientMeeting[] | — | One-to-many |
| `products` | Relation → CrmOpportunityProduct[] | — | One-to-many |
| `transitions` | Relation → CrmOpportunityStageTransition[] | — | One-to-many (stage history) |

**Indexes:** `orgId`, `stage`, `accountId`, `ownerId`, `deletedAt`, `priceListId`.

---

## 5. Enums

### `CrmOpportunityStage`
Used by `CrmOpportunity.stage` (and by `CrmOpportunityStageTransition.fromStage` / `toStage`).

- `Prospecting`
- `Qualification`
- `Proposal`
- `Negotiation`
- `ClosedWon`
- `ClosedLost`

### `CrmAccountSegment`
Used by `CrmAccount.segmentEnum`.

- `Enterprise`
- `MidMarket`
- `SMB`

> Note: `CrmLead` and `CrmContact` reference no enums — their `stage` / `status` / `contactStage` fields are plain `String`. On `CrmAccount`, `segment` is free-text `String` while `segmentEnum` is the typed enum.

---

## 6. Relationships Between Modules

All inter-module relations hold the **foreign key on the "many" (child) side**, with the parent exposing a list (`[]`). None of the four core-to-core relations use `onDelete` cascade.

| Relationship | FK field (holder) | References | Cardinality | Prisma relation |
|---|---|---|---|---|
| **Account → Contact** | `CrmContact.accountId` | `CrmAccount.id` | **One-to-Many** — one Account has many Contacts | `CrmContact.account` ↔ `CrmAccount.contacts` |
| **Account → Lead** | `CrmLead.accountId` | `CrmAccount.id` | **One-to-Many** — one Account has many Leads | `CrmLead.account` ↔ `CrmAccount.leads` |
| **Account → Opportunity** | `CrmOpportunity.accountId` | `CrmAccount.id` | **One-to-Many** — one Account has many Opportunities | `CrmOpportunity.account` ↔ `CrmAccount.opportunities` |
| **Lead → Contact** | `CrmContact.leadId` | `CrmLead.id` | **One-to-Many** — one Lead has many Contacts | `CrmContact.lead` ↔ `CrmLead.contacts` |
| **Account → Account** (self-hierarchy) | `CrmAccount.parentAccountId` | `CrmAccount.id` | **One-to-Many** — one parent Account has many children | `CrmAccount.parent` ↔ `CrmAccount.children` (relation `CrmAccountHierarchy`) |

### Soft links (column only — no enforced relation)

These pairs are wired by an ID column but have **no Prisma `@relation`**, so there is no referential integrity or automatic join:

| Intended link | Column | Points to | Status |
|---|---|---|---|
| **Lead → Contact** | `CrmLead.linkedContactId` | `CrmContact.id` (by convention) | No relation defined — application-managed |
| **Lead → Opportunity** | `CrmOpportunity.leadId` | `CrmLead.id` (by convention) | No relation defined — application-managed |

### Relationships explicitly *not* modeled

The following mappings from the request are **not present** in the schema (neither relation nor FK column):

- **Lead → Account** exists (via `CrmLead.accountId`), but **Lead → Opportunity** exists only as the soft `CrmOpportunity.leadId` column above — there is no navigable relation from Lead to Opportunity.
- **Contact → Opportunity**: no direct relation or FK. A Contact reaches an Opportunity only indirectly, through their shared Account.

### Summary diagram

```
                         CrmAccount ──┐ (self-hierarchy: parentAccountId)
                         (parent)     │
                              ▲        └──► children CrmAccount[]
        accountId │ 1        ┌┴┐ 1        ┌ 1        accountId
                  │          │ │          │
       ┌──────────┘          │ │          └──────────┐
       │ (many)              │ │ (many)               │ (many)
   CrmLead ────────────► CrmContact              CrmOpportunity
       │  leadId (1→many)     ▲                        ▲
       │                      │ accountId (1→many)     │ accountId (1→many)
       │                      │                        │
       └── linkedContactId ··(soft, no FK)··           └── leadId ··(soft, no FK)·· CrmLead
```

**Legend:** solid `──►` = enforced Prisma relation (FK on child); `··(soft)··` = ID column with no enforced relation.

---

## 7. Cross-cutting conventions

- **Primary keys:** every model uses `id String @id @default(cuid())`.
- **Tenant scoping:** every model carries `orgId String` (indexed). Per repo standard, all queries must filter by `orgId`.
- **Soft deletes:** `deletedAt DateTime?` on all four models (indexed) — records are marked deleted rather than hard-deleted.
- **Audit timestamps:** `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt` on all four models.
- **Ownership:** `ownerId` / `ownerName` denormalized pair on all four models.
- **Money:** monetary amounts use `Decimal @db.Decimal(18, 2)` with a companion `*Currency` string (default `"INR"`).
