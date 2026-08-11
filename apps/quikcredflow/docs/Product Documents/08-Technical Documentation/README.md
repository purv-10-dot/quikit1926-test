# CredFlow — Technical Architecture Documentation

> **Programme:** CredFlow Technical Documentation · **Phase 2 — Formal Current-State Architecture**
> **Subject:** `apps/credflow` — platform slug `quikcredflow`, UI brand "QuikCRM", dev port 3076 — inside the QuikIT monorepo, plus the platform surfaces it depends on.
> **Baseline:** branch `feature/credflow-standalone-app`, commit `7e372adc3`, re-verified against source on 2026-08-10.
> **Scope:** current state only. **No target architecture. No redesign. No migration plan. No application code was modified.**

---

## 1. What this documentation set is

This is an engineering-grade description of **the architecture CredFlow has today**: how it is built, how it interacts with the QuikIT platform, and what its real boundaries, dependencies and constraints are.

It answers one question:

> *What is the technical architecture of CredFlow today, how does it interact with the Quikit platform, and what are the important architectural boundaries, dependencies and constraints?*

It deliberately does **not** answer "what should it be", "should CredFlow and QuikCRM merge", or "how do we fix X". Those are later-phase questions. Where this set names a risk, it names the next *investigation*, not a solution.

## 2. Evidence standard

Every material statement carries one of three tags. This is not decoration — it is the contract that makes the set usable for decisions.

| Tag | Meaning |
|---|---|
| **FACT** | Directly established from source code, the Prisma schema, configuration, a CI workflow, or a deployment artefact in this repository. A path is cited. |
| **INFERENCE** | Strongly implied by the implementation but not directly established. The inferential step is stated explicitly. |
| **UNKNOWN** | Cannot be determined from this repository. Requires team input, a running environment, or an out-of-repo artefact (deploy manifests, cloud consoles, DNS, secret stores). |

Absence is recorded as **NOT FOUND / NOT EVIDENCED**, never as an invented implementation.

**Rationale is recorded only where the repository states it.** Otherwise the document says, verbatim:

> *Rationale: UNKNOWN — requires team input.*

Nothing in this set invents architectural rationale, historical decisions, business rationale, scalability guarantees, security guarantees, operational guarantees, or design intent.

### 2.1 What Phase 2 verified

Phase 1 discovery was **not** treated as authoritative. Every load-bearing claim was re-derived from the current repository before being carried forward. That re-verification confirmed the large majority of Phase 1 and produced **seven corrections**, recorded in [`corrections-against-phase-1.md`](corrections-against-phase-1.md) and applied throughout this set.

Three of those corrections change the architecture picture materially:

- CredFlow reads a **fourth platform-owned table** (`public.SessionEvent`) that Phase 1 did not record — and **nothing writes the rows it queries for**, so the dashboard metric built on it is structurally always empty.
- CredFlow **writes `auth.User`**, not only `quikit.UserAppAccess`. Its write surface outside its own schema is larger than Phase 1 stated.
- `@quikit/redis` **is** imported (Phase 1 said it was not), which means two independent Redis client factories run in one process and the SSO replay guard is governed by the platform package rather than by CredFlow's own Redis configuration.

## 3. Document map

### 3.1 Architecture

| Document | Covers |
|---|---|
| [`Architecture/system-architecture.md`](Architecture/system-architecture.md) | System context, actors, external systems, containers, trust zones, system classification |
| [`Architecture/application-architecture.md`](Architecture/application-architecture.md) | Layer model, boundary responsibilities, runtime composition, the three real process boundaries |
| [`Architecture/component-architecture.md`](Architecture/component-architecture.md) | Component inventory — platform components, CredFlow route groups, service domains, cross-cutting modules |
| [`Architecture/dependency-architecture.md`](Architecture/dependency-architecture.md) | Package graph, internal module coupling, external dependency surface, failure modes per dependency |
| [`Architecture/frontend-architecture.md`](Architecture/frontend-architecture.md) | App Router structure, client/server split, state, data fetching, realtime client, permission UI |
| [`Architecture/backend-architecture.md`](Architecture/backend-architecture.md) | Runtime, entry points, route-handler pattern, service layer, data access, transactions, concurrency, idempotency, validation |
| [`Architecture/quikit-platform-architecture.md`](Architecture/quikit-platform-architecture.md) | **Quikit Platform ↔ CredFlow** — topology, sharing model, communication, platform contracts, gotchas, unknowns |
| [`Architecture/performance-and-scalability.md`](Architecture/performance-and-scalability.md) | Code-level scalability characteristics. **No capacity claims.** |
| [`Architecture/architecture-risks.md`](Architecture/architecture-risks.md) | Prioritised architectural risk register |

### 3.2 Domain & Data

| Document | Covers |
|---|---|
| [`Domain & Data/domain-architecture.md`](Domain%20%26%20Data/domain-architecture.md) | Business domains, ownership of state, coupling, service boundaries |
| [`Domain & Data/data-architecture.md`](Domain%20%26%20Data/data-architecture.md) | Multi-schema layout, entity inventory, tenant columns, indexing, soft delete, integrity, migrations, pooling |
| [`Domain & Data/entity-lifecycle.md`](Domain%20%26%20Data/entity-lifecycle.md) | Create → mutate → archive → delete → restore, per entity class; audit and retention behaviour |
| [`Domain & Data/state-machines.md`](Domain%20%26%20Data/state-machines.md) | Lead, opportunity, quote, order, workflow, form-version, import, portal, task, membership |
| [`Domain & Data/cross-module-mutations.md`](Domain%20%26%20Data/cross-module-mutations.md) | Every operation where acting on one domain writes another |

### 3.3 API

| Document | Covers |
|---|---|
| [`API/api-architecture.md`](API/api-architecture.md) | Style, route organisation, auth/authz on the API, export, bulk, public surface, webhooks, SSE, rate limiting |
| [`API/api-conventions.md`](API/api-conventions.md) | The conventions actually in force — response shapes, status codes, validation, errors, pagination, naming — and where they diverge from the platform standard |

### 3.4 Security

| Document | Covers |
|---|---|
| [`Security/security-architecture.md`](Security/security-architecture.md) | Consolidated security model, trust boundaries, controls that hold, controls that fail open, cryptography |
| [`Security/authentication.md`](Security/authentication.md) | OIDC client model, hand-off, session lifecycle, revocation layers, fallback mode |
| [`Security/authorization-rbac.md`](Security/authorization-rbac.md) | Four authorization layers, role mapping, matrix composition, record-level ACL, field masking, gate coverage |
| [`Security/tenant-isolation.md`](Security/tenant-isolation.md) | Tenancy model, expected vs actual isolation, the three confirmed gaps, context propagation, enforcement |

### 3.5 Integrations

| Document | Covers |
|---|---|
| [`Integrations/integration-architecture.md`](Integrations/integration-architecture.md) | Integration patterns, inbound/outbound surfaces, tenant resolution, resilience posture, configuration model |
| [`Integrations/external-integrations.md`](Integrations/external-integrations.md) | Per-integration reference: QuikIT IdP, auth app, Postgres, Redis, S3, telephony, LeadSquared, email |

### 3.6 Infrastructure

| Document | Covers |
|---|---|
| [`Infrastructure/infrastructure-architecture.md`](Infrastructure/infrastructure-architecture.md) | Evidenced infrastructure, container build, runtime topology, networking, what is unknown |
| [`Infrastructure/deployment-architecture.md`](Infrastructure/deployment-architecture.md) | The two competing deployment paths, CI/CD, database deployment, release topology |
| [`Infrastructure/environment-architecture.md`](Infrastructure/environment-architecture.md) | Environments, configuration architecture, variables with architectural effect, feature flags, secrets |
| [`Infrastructure/observability.md`](Infrastructure/observability.md) | Logging, audit, change history, health, metrics, tracing — implemented / partial / not found |

### 3.7 Operations

| Document | Covers |
|---|---|
| [`Operations/background-processing.md`](Operations/background-processing.md) | Queues, worker, scheduled work, realtime, notifications, async concurrency |
| [`Operations/failure-handling.md`](Operations/failure-handling.md) | Failure taxonomy, degradation matrix, retry/idempotency, the missing outbox, fail-open inventory |
| [`Operations/testing-architecture.md`](Operations/testing-architecture.md) | Test layout, runners, mocking, CI execution, measurable coverage, gaps |

### 3.8 Design Documents

| Document | Covers |
|---|---|
| [`Design Documents/README.md`](Design%20Documents/README.md) | Purpose of the folder and what belongs in it |
| [`Design Documents/credflow-quikcrm-consolidation-considerations.md`](Design%20Documents/credflow-quikcrm-consolidation-considerations.md) | **CredFlow ↔ QuikCRM consolidation considerations** — dependency and risk exposure only. Not a migration plan, no recommendation. |

### 3.9 ADRs

| Document | Covers |
|---|---|
| [`ADRs/README.md`](ADRs/README.md) | Index, status legend, and the rule for promoting a candidate to an accepted ADR |
| `ADRs/adr-0001` … `adr-0010` | Ten decisions whose rationale **is stated in the repository**, written up as ADRs |
| [`ADRs/adr-candidates-register.md`](ADRs/adr-candidates-register.md) | Eighteen further observable decisions whose rationale is **UNKNOWN** and cannot be written up without team input |

### 3.10 Supporting

| Document | Covers |
|---|---|
| [`corrections-against-phase-1.md`](corrections-against-phase-1.md) | Every Phase 1 claim this phase corrected, with the evidence for the correction |
| [`open-questions.md`](open-questions.md) | Consolidated UNKNOWNs and verification items, with owner and what each blocks |
| [`00-Phase 1 Discovery/`](00-Phase%201%20Discovery/) | The raw discovery evidence base. Retained unmodified as the audit trail. |

## 4. How to read this set

| If you are… | Start with |
|---|---|
| New to CredFlow | [`Architecture/system-architecture.md`](Architecture/system-architecture.md) → [`Architecture/application-architecture.md`](Architecture/application-architecture.md) |
| Assessing platform coupling | [`Architecture/quikit-platform-architecture.md`](Architecture/quikit-platform-architecture.md) |
| Doing a security review | [`Security/security-architecture.md`](Security/security-architecture.md) → [`Security/tenant-isolation.md`](Security/tenant-isolation.md) |
| Planning operational ownership | [`Infrastructure/deployment-architecture.md`](Infrastructure/deployment-architecture.md) → [`Infrastructure/observability.md`](Infrastructure/observability.md) → [`Operations/failure-handling.md`](Operations/failure-handling.md) |
| Changing the data model | [`Domain & Data/data-architecture.md`](Domain%20%26%20Data/data-architecture.md) §Migrations **first** — no safe schema change is currently possible (see `AR-02`) |
| Weighing consolidation | [`Design Documents/credflow-quikcrm-consolidation-considerations.md`](Design%20Documents/credflow-quikcrm-consolidation-considerations.md) |

## 5. The ten facts that most shape this architecture

Stated up front because every downstream document depends on them. All **FACT**.

1. **CredFlow is one Next.js 14 process plus one optional out-of-process BullMQ worker.** There is no internal service mesh, no internal HTTP hop, and no separate backend deployable.
2. **The QuikIT "platform" is not a runtime host.** Capability reaches CredFlow through compile-time packages, a shared database, and two HTTPS calls. Nothing executes CredFlow's code on the platform's behalf.
3. **One PostgreSQL database, sixteen Postgres schemas, one Prisma client.** CredFlow reads and writes platform tables directly, in-process, with no API in between.
4. **Tenant isolation is enforced by application-code convention alone** — no RLS, no query middleware, no lint rule, no CI check.
5. **Middleware does not protect the API.** Its matcher excludes `/api/**` entirely; all 268 route handlers authenticate themselves.
6. **No migration creates CredFlow's 133 tables.** The schema is applied outside the migration history, so no safe, reviewable schema change is currently possible.
7. **CredFlow appears in no CI workflow**, and ships two mutually exclusive deployment artefacts. How it reaches production is UNKNOWN.
8. **Side effects run outside the transaction with no outbox.** A crash between commit and fan-out silently loses change-log entries, automation triggers, realtime events and external sync.
9. **Every external integration is configured process-wide**, so the application is multi-tenant in its data and single-tenant in its integrations.
10. **CredFlow and QuikCRM share Redis channel names, BullMQ queue names and an S3 key prefix, byte-for-byte.** Whether they share the underlying infrastructure is UNKNOWN and is the highest-value open question in this set.

## 6. Constraints honoured in producing this set

- **Read-only with respect to the product.** No application source, schema, migration, dependency, environment file, deployment configuration or infrastructure was modified. The only files created are under this directory.
- **No secrets.** Variable *names* appear where architecturally meaningful; values never do.
- **No platform documentation was modified.** Findings about `packages/*` and sibling apps are recorded here, not there.
- **Phase 1 evidence retained.** `00-Phase 1 Discovery/` is unchanged, so every correction in this phase can be audited against what it replaced.
