# Technical Documentation Programme — Phase 1: Current-State Architecture Discovery

> **Status:** Phase 1 complete. **Scope:** current state only. No target architecture, no redesign, no code changes.
> **Subject:** `apps/credflow` (product slug `quikcredflow`, UI brand "QuikCRM") inside the QuikIT monorepo, plus the platform surfaces it depends on.
> **Method:** static source, schema, configuration and CI analysis. **The application was not executed** and no database was inspected. One attempt was made to run the CredFlow unit-test suite locally; it failed to boot (see [testing-architecture.md](discovery/testing-architecture.md)).

---

## What this is

An evidence-based reverse-engineering of the architecture that exists **today**, produced as the input to later phases (HLD, application/component/domain/data/API/security/integration/infrastructure/deployment architecture, feature TDDs, ADRs, risk assessment).

It is **not** a design document and contains **no recommendations** other than those in the explicitly scoped [architecture-risks.md](discovery/architecture-risks.md).

## Relationship to the user-documentation workstream

The frozen **User Documentation v1** artefacts under [`01-Product Discovery/` … `07-Security & Technical Findings/`](../../) and [`04-User Documentation/`](../../04-User%20Documentation/) were read as **business/domain context**. They are authoritative about *product behaviour intent*; they are **not** treated as authoritative about implementation. Every technical claim here was re-derived from source. Where this discovery contradicts, extends, or resolves an open question from those documents, it says so explicitly and cites both.

Resolved from the user-doc workstream's open list during this phase:

| Prior open item | Resolution here |
|---|---|
| `SQ-1` — does every `/api/settings/*` handler carry a permission assertion? | **No.** Systematic sweep: 8 ungated `GET` handlers. See [security-boundaries.md §4](discovery/security-boundaries.md) |
| `SQ-2` — what does `WEBHOOK_TRUST_PAYLOAD_ORG_ID=true` permit? | Payload-selected tenant when `WEBHOOK_DEFAULT_ORG_ID` is unset. See [tenant-isolation.md §6](discovery/tenant-isolation.md) |
| `SQ-3` — portal token expiry / rate limiting? | Tokens are SHA-hashed, revocable, optionally expiring. **No rate limiting** on any portal endpoint. See [api-architecture.md §9](discovery/api-architecture.md) |
| `SQ-4` — do document links cascade? | `QcfDocumentLink.refType`/`refId` are bare strings, no FK. Confirmed. See [data-architecture.md §7](discovery/data-architecture.md) |
| `SQ-5` — are lead field masks applied on every read path? | **No.** CSV/XLSX export bypasses `maskHiddenLeadFields`. See [security-boundaries.md §5](discovery/security-boundaries.md) |
| `D3.2` — does Leads export honour the advanced filter? | **It does not** — promoted from INFERENCE to FACT. See [api-architecture.md §7](discovery/api-architecture.md) |
| `D5.1` — `getPipelineConfig` missing `orgId` filter | Superseded by SEC-001 and re-confirmed at schema level. See [tenant-isolation.md §5](discovery/tenant-isolation.md) |

## Evidence classification

Every material statement carries one of:

| Tag | Meaning |
|---|---|
| **FACT** | Directly established from source code, Prisma schema, configuration, CI workflow, or a deployment artefact in this repository. A file path is cited. |
| **INFERENCE** | Strongly implied by the implementation but not directly established. The inferential step is stated. |
| **UNKNOWN** | Cannot be determined from this repository. Requires team input, a running environment, or an out-of-repo artefact (deploy manifests, Vercel/GKE console, DNS, secret stores). |

Absence is recorded as **NOT FOUND / NOT EVIDENCED**, never as an invented implementation.

Rationale for a decision is recorded only when the repository states it. Otherwise: *"Decision rationale: UNKNOWN — requires team input."*

## Terminology (disambiguation — see [technical-discovery.md §2](discovery/technical-discovery.md))

The word "Quikit" is used in this repository for at least five distinct things. This programme uses:

| Term | Meaning here |
|---|---|
| **QuikIT monorepo** | The npm-workspaces + Turborepo repository (`package.json` `name: "quikit"`). |
| **QuikIT platform** | The set of cross-app capabilities: identity, org/tenant registry, app catalogue, launcher, shared Postgres schemas `quikit`/`auth`/`public`, and the shared packages. Not a single deployable. |
| **`quikit` app** | `apps/quikit` — the concrete Next.js application that is the OAuth/OIDC IdP + launcher + super-admin console (dev port 3000). |
| **`auth` app** | `apps/auth` — the central credentials host (dev port 3001). |
| **Quikit shared libraries** | `packages/{auth,database,redis,shared,ui}` — code-shared, compiled into each app's bundle. |
| **"Quikit wrapper"** | See [technical-discovery.md §2.3](discovery/technical-discovery.md). **No component in the repository is named or self-describes as a "wrapper".** The term maps onto three separate mechanisms; using it as one thing is a terminology ambiguity requiring team clarification. |

## Document index

### Start here

| Document | Contents |
|---|---|
| **[technical-discovery.md](discovery/technical-discovery.md)** | Master document. Executive architecture model, technology stack, system classification, and the mandated **`# Quikit Platform ↔ CredFlow Architecture`** section. |
| [technical-verification-matrix.md](discovery/technical-verification-matrix.md) | Every significant claim → evidence → classification → confidence → verification needed. |

### Structural

| Document | Contents |
|---|---|
| [system-context.md](discovery/system-context.md) | Actors, external systems, system-context and container diagrams. |
| [architecture-map.md](discovery/architecture-map.md) | Layer/boundary model, component inventory, dependency map. (Consolidates the planned `component-inventory.md` and `dependency-map.md`.) |
| [frontend-architecture.md](discovery/frontend-architecture.md) | Next.js App Router structure, client/server split, state, data fetching, permission UI. |
| [backend-architecture.md](discovery/backend-architecture.md) | Runtime, route handlers, service layer, data access, transactions, error handling, validation. |
| [api-architecture.md](discovery/api-architecture.md) | API style, route groups, auth, response/error shapes, pagination, filtering, bulk, export, webhooks, public API. |

### Data & domain

| Document | Contents |
|---|---|
| [data-architecture.md](discovery/data-architecture.md) | Prisma multi-schema layout, entity inventory by domain, indexes, soft delete, audit fields, migrations. |
| [domain-architecture.md](discovery/domain-architecture.md) | Business domains, ownership, coupling, service boundaries. |
| [state-machines.md](discovery/state-machines.md) | Lead, Opportunity, Quote, Order, Workflow, Disposition-form, Import lifecycles. |
| [cross-module-mutations.md](discovery/cross-module-mutations.md) | Every discovered operation where one domain writes another. |

### Security & tenancy

| Document | Contents |
|---|---|
| [security-boundaries.md](discovery/security-boundaries.md) | Authentication, session, RBAC, record-level ACL, field masking, frontend↔backend gate divergence. |
| [tenant-isolation.md](discovery/tenant-isolation.md) | Expected vs actual isolation, global vs tenant data, webhook tenant resolution. |

### Runtime & operations

| Document | Contents |
|---|---|
| [background-processing.md](discovery/background-processing.md) | BullMQ queues, worker process, cron endpoints, SSE/pub-sub, polling. |
| [integration-inventory.md](discovery/integration-inventory.md) | LeadSquared, IndiaVoice/RP Digital, email providers, S3, Redis, QuikIT IdP. |
| [infrastructure-deployment.md](discovery/infrastructure-deployment.md) | Docker, GHCR, GCP Cloud SQL, Vercel gating, CI/CD, environments. (Consolidates `infrastructure-discovery.md` + `deployment-discovery.md`.) |
| [observability.md](discovery/observability.md) | Logging, audit, health, metrics, tracing — implemented / partial / not found. |
| [testing-architecture.md](discovery/testing-architecture.md) | Test layout, frameworks, mocks, CI execution, measurable coverage. |
| [performance-scalability.md](discovery/performance-scalability.md) | Code-level scalability characteristics with evidence. No capacity claims. |

### Findings

| Document | Contents |
|---|---|
| [architecture-risks.md](discovery/architecture-risks.md) | Prioritised risk register (CRITICAL → INFORMATIONAL). |
| [adr-candidates.md](discovery/adr-candidates.md) | Observable decisions, current implementation, evidence, rationale (or UNKNOWN). Not finalised ADRs. |
| [credflow-quikcrm-merge-considerations.md](discovery/credflow-quikcrm-merge-considerations.md) | Dependency/risk discovery for a possible CredFlow → QuikCRM consolidation. **Not a migration plan.** |

## Constraints honoured

- **Read-only.** No application source, schema, migration, dependency, environment file, deployment configuration or infrastructure was modified. The only files created or changed are under `docs/technical/`.
- No secrets, credentials, connection strings or key material are reproduced. Variable **names** are documented where architecturally meaningful; values are not.
- No destructive command was executed. No dependency was installed. No migration was run.

## What Phase 1 deliberately does not do

- Does not propose a target architecture.
- Does not recommend whether CredFlow and QuikCRM should be merged.
- Does not produce polished HLDs.
- Does not create implementation tickets, except where a risk entry names the next investigation step.
