# CrmExpress Product Documents

## Purpose

This directory holds **all documentation for the CrmExpress application** — product, user-facing, internal, verification, governance, findings, and (in future) technical documentation.

It is a single tree so that anyone joining the product, writing a feature, running a release, or investigating a finding has exactly one place to look, and anyone producing documentation has exactly one place to write.

---

## Canonical Location

```
C:\Projects\QuikCRM\apps\crmexpress\docs\Product Documents\
```

**This is the canonical location for CrmExpress documentation.** It sits inside the application it documents (`apps/crmexpress`), so the docs travel with the app.

---

## Structure

| Folder | Contains | Audience |
|---|---|---|
| **01-Product Discovery** | What CrmExpress is, its information architecture, the complete feature inventory, feature scope and classification | Product, engineering |
| **02-Feature Analysis** | Detailed per-feature behaviour, implementation evidence, permissions, edge cases, behavioural contracts | Product, engineering |
| **03-Product Workflows** | Cross-module business workflows — lead lifecycle, calling and disposition, assignment, conversion, visibility, automation | Product, engineering, support |
| **04-User Documentation** | The shipped end-user manual, split into **User Guide/** and **Admin & Manager Guide/** | End users, administrators, managers |
| **05-Documentation Governance** | Documentation scope decisions, feature → documentation traceability, inclusion/exclusion rationale, release readiness | Documentation owners |
| **06-Verification & Release** | Runtime and UI verification, screenshot planning, validation results, release records | Documentation owners, QA |
| **07-Security & Technical Findings** | Security findings, destructive-operation audits, product bugs, technical debt, documentation risks | Engineering, security |
| **08-Technical Documentation** | Architecture, domain and data, API, security, integrations, infrastructure, operations, design documents and ADRs | Engineering |

### 04 — User Documentation

The only volumes intended for people outside the product and engineering teams.

```
04-User Documentation/
├── User Guide/               end users (Sales User and above)
│   ├── README.md
│   ├── getting-started.md · roles-and-visibility.md
│   ├── leads/                (12 files)
│   ├── telephony/            (2 files)
│   ├── workflows/            (4 files)
│   └── accounts · contacts · opportunities · activities · tasks · dashboard
└── Admin & Manager Guide/    (9 files) elevated-role functionality
```

Everything in **01, 02, 03, 05, 06 and 07 is internal** and must not be published to end users.

### 08 — Technical Documentation

```
08-Technical Documentation/
├── 00-Phase 1 Discovery/     current-state architecture discovery (see note below)
├── Architecture/             reserved
├── Domain & Data/            reserved
├── API/                      reserved
├── Security/                 reserved
├── Integrations/             reserved
├── Infrastructure/           reserved
├── Operations/               reserved
├── Design Documents/         reserved
└── ADRs/                     reserved
```

`00-Phase 1 Discovery/` holds the completed **current-state technical architecture discovery** (23 documents). It is evidence-gathering, not target-state design: it records what the system is today, with every material claim classified FACT / INFERENCE / UNKNOWN. Start at its `README.md`.

The nine category folders are **reserved and currently empty**. Later technical work — HLDs, component and domain architecture, API and data architecture, security and integration architecture, infrastructure and deployment, runbooks, feature TDDs and ADRs — belongs in them.

---

## Documentation Boundary

CrmExpress documentation **MUST NOT** be created under:

```
C:\Projects\QuikCRM\docs\
```

unless the user explicitly instructs otherwise.

That directory is the **QuikIT platform / repository-level** documentation tree. It covers the monorepo, the shared `@quikit/*` packages, the identity and launcher applications, platform conventions and developer onboarding. It is owned by the platform/integration team and is not the CrmExpress documentation repository.

The distinction is by **subject**, not by dependency:

- A document about CrmExpress's leads pipeline, its telephony integration, or its tenant isolation → **here**.
- A document about the QuikIT OAuth flow, the shared Prisma schema conventions, or the monorepo branch strategy → `C:\Projects\QuikCRM\docs\`.

CrmExpress depending on QuikIT platform services does **not** make QuikIT's own documentation part of CrmExpress's documentation, and does not make CrmExpress documentation belong in the platform tree.

---

## Future Documentation Rule

Whenever future work requires creating or modifying CrmExpress documentation:

1. **Look here first.** Locate the relevant category under `Product Documents/`.
2. **Place the document in the correct existing subfolder.**
3. If a genuinely new category is required, **create it under `Product Documents/`** — never outside it.
4. If a new category materially changes the structure, **update this README**.
5. **Never create a parallel CrmExpress documentation tree elsewhere.**
6. **Never use `C:\Projects\QuikCRM\docs\`** for CrmExpress documentation unless the user explicitly overrides this rule.

Verify the destination path before writing any CrmExpress document.

---

## Technical Documentation Rule

All future CrmExpress technical documentation — architecture, design documents, technical design documents, API documentation, data architecture, security architecture, integration architecture, infrastructure and deployment documentation, operational documentation, runbooks and ADRs — belongs under:

```
Product Documents/08-Technical Documentation/
```

in its relevant subfolder. It must not be created under the repository-level `docs/` directory.

---

## Migration note

These documents were produced across several CrmExpress documentation workstreams and were originally written to `C:\Projects\QuikCRM\docs\internal\`, `C:\Projects\QuikCRM\docs\user-guide\` and `C:\Projects\QuikCRM\docs\technical\`. They were **moved** here — content unchanged — and their cross-references were repointed. The old directories no longer exist.

Two statements were deliberately **left as written**, because they are historical records of a workstream rather than navigation:

- `01-Product Discovery/feature-scope-checkpoint.md` — *"The only files created are under `docs/internal/`."*
- `08-Technical Documentation/00-Phase 1 Discovery/README.md` — *"The only files created or changed are under `docs/technical/`."*

Both were true at the time they were written. Rewriting them would falsify the record.

### Documentation not in this tree

CrmExpress also carries older, pre-existing documentation that was **not** part of these workstreams and has been left where it is:

- `apps/crmexpress/docs/claude-project/` — build plans, decision ledgers, session logs, automation capture notes
- `apps/crmexpress/docs/*.md` — module manual, feature inventory, RFCs, migration notes
- `apps/crmexpress/*.md` — specifications, audits and readiness reports at the app root
- `apps/crmexpress/copypaste_code/` — documentation belonging to a vendored pre-migration snapshot of the app

Folding these into `Product Documents/` is a separate decision and has not been made.

---

## Git note

The repository's `.gitignore` ignores `*.md` globally, so most files in this tree are untracked by design. Changes here will not appear in `git status`.
