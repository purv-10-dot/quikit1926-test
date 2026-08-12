# Architecture Decision Records

> **Phase 2 · formal current state.** Baseline `7e372adc3`.

---

## The rule this folder follows

An ADR records a decision, its context, and **why it was taken**. This programme does not invent rationale.

Twenty-eight architectural decisions are observable in CrmExpress's code. For **ten** of them, the repository states the reasoning — in a docblock, an inline comment, or a platform architecture document. Those ten are written up here as ADRs.

For the remaining **eighteen**, the decision is real and observable but the *why* is not recoverable from the repository. Those are listed in [`adr-candidates-register.md`](adr-candidates-register.md) with the rationale field left as:

> *Rationale: UNKNOWN — requires team input.*

**That split is itself a finding.** Nine of the ten documented decisions concern security or data integrity; the undocumented eighteen are concentrated in frontend architecture, deployment, and the decisions inherited from the fork. The team wrote down its reasoning where it judged the stakes highest.

## Status legend

| Status | Meaning |
|---|---|
| **Accepted** | The decision is in force, and the repository states why |
| **Accepted (rationale partial)** | In force; the repository explains *what* and part of *why* |
| **Candidate** | Observable decision, rationale UNKNOWN — see the register |
| **Superseded** | Not used in this phase; no decision here has been formally superseded |

Every ADR below is **Accepted** or **Accepted (rationale partial)**. None describes a proposal.

## Index

| ADR | Decision | Status | Risk it drives |
|---|---|---|---|
| [0001](adr-0001-shared-database-schema-per-application.md) | One PostgreSQL database with a Postgres schema per application | Accepted | `AR-13`, `AR-16` |
| [0002](adr-0002-oidc-delegation-with-per-request-membership-revalidation.md) | Delegate identity to QuikIT over OIDC **and** re-read `OrgMember` on every request | Accepted | — (this is a strength) |
| [0003](adr-0003-application-enforced-tenant-isolation.md) | Enforce tenant isolation in application code, not in the database | Accepted (rationale partial) | `AR-06` |
| [0004](adr-0004-modular-monolith-with-detached-worker.md) | Modular monolith with one detached BullMQ worker | Accepted (rationale partial) | `AR-01`, `AR-12` |
| [0005](adr-0005-redis-as-an-optional-dependency.md) | Treat Redis as optional, with an explicit degradation path per feature | Accepted | `AR-09` |
| [0006](adr-0006-global-lead-status-lookup-tables.md) | Store lead statuses in **global** lookup tables with no tenant column | Accepted (rationale partial) | `AR-03` |
| [0007](adr-0007-owner-scope-is-user-facing-only.md) | Owner-scope and account-ACL helpers are for user-facing paths only | Accepted | — (this is a strength) |
| [0008](adr-0008-handoff-token-hardening.md) | Harden the cross-app hand-off: app binding, tightened freshness, single use | Accepted | `AR-09` (the fail-open gap) |
| [0009](adr-0009-state-transitions-as-action-endpoints.md) | Express state transitions as action endpoints; reject state fields on PATCH | Accepted | — |
| [0010](adr-0010-allow-lists-as-the-filter-and-report-security-boundary.md) | Use allow-lists as the security boundary for filtering and reporting | Accepted | — (this is a strength) |
| — | [**Eighteen further candidates**](adr-candidates-register.md) | Candidate | various |

## ADR format used here

Each record carries:

- **Status** and date of record (the date this ADR was *written*, not when the decision was taken — that is usually unknown).
- **Context** — the forces evidenced in the repository.
- **Decision** — what is in force, with file-level evidence.
- **Rationale** — **quoted from the repository**, or explicitly marked UNKNOWN.
- **Consequences** — observed today, positive and negative, cross-referenced to the risk register.
- **Alternatives** — only where the repository evidences that one was considered. Otherwise: *"Not evidenced."*

## How to promote a candidate

For each entry in [`adr-candidates-register.md`](adr-candidates-register.md), promotion requires adding:

1. the alternatives available at the time,
2. the forces that selected this one,
3. the consequences now visible (the register already lists several), and
4. the current status — accepted, superseded, or to-revisit.

**The rationale field must stay `UNKNOWN` until a person who was present states it.** Eighteen of twenty-eight decisions having no recoverable rationale is itself a finding worth carrying forward, and it should not be erased by plausible reconstruction.
