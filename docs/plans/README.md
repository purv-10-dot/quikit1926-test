# QuikIT Remediation Plans — Index

Living index of implementation plans derived from the scalability audit (`docs/architecture/10k-users-iaas-rollout.md`). Each row links to a full-spec plan document.

**Planning philosophy:** plans are written in **waves** matching the rollout roadmap, not all at once. Writing plans for P1/P2 today would waste effort because the P0 work reshapes the later items. A plan is written when we are within ~2 weeks of executing it.

**Depth policy:** non-trivial items get a **full spec** (context, options, code, migration, tests, rollback, risks). Items that are genuinely a one-line change get a **change note** — a short "apply this, here's the risk" entry in §4 of this index, not a separate doc.

---

## Status legend

| Status | Meaning |
|---|---|
| 📝 Draft | In progress — not yet ready for review |
| 👀 In review | Ready for human review before execution |
| ✅ Approved | Greenlit; may start execution |
| 🚧 In progress | Someone is actively implementing |
| ✔ Done | Shipped and verified in prod |
| 🧊 Deferred | Decided to postpone — see plan for reason |
| ❌ Dropped | Not doing this — see plan for reason |

---

## 1. Wave 1 — P0 (pre-1000 CCU) — _current wave_

These must ship **before** any further scale-up work. They are written as full specs.

| ID | Title | Status | Owner | Target |
|---|---|---|---|---|
| [P0-1](./P0-1-db-connection-pooling.md) | Postgres connection pooling + `directUrl` split (Neon) | ✔ Done | — | 2026-04-17 |
| [P0-2](./P0-2-apps-enable-n-plus-one.md) | Eliminate N+1 in `POST /api/apps/enable` | ✔ Done | — | 2026-04-17 |
| [P0-3](./P0-3-distributed-rate-limiter.md) | Distributed rate limiter (Upstash) + wire into IdP login | ✔ Done | — | 2026-04-17 |
| [P0-4](./P0-4-oauth-token-hardening.md) | Rate-limit `/api/oauth/token` + cache client lookup | ✔ Done | — | 2026-04-17 |
| [VERCEL-PROD-SETUP](./VERCEL-PROD-SETUP.md) | Vercel + Neon + Upstash env checklist (companion doc) | ✔ Done | — | 2026-04-17 |

**Wave 1 exit criteria (before unblocking Wave 2):**
- All four plans approved, implemented, merged to `main`, deployed to prod.
- 48-hour burn-in on Vercel prod with no `connection pool timeout` errors.
- Load-test script (`k6`) retained in repo at `tests/load/oauth-login.js` as regression gate.

---

## 2. Wave 2 — P1 (before 1000 CCU sustained)

Partially shipped with Wave 1. Remaining items will be planned in a later session.

| ID | Title | Type | Status |
|---|---|---|---|
| P1-1 | Pagination sweep on 7 unbounded `findMany` endpoints | Full spec | ⏳ Open — deferred (touches UI contracts) |
| [P1-2](./P1-2-cache-control-headers.md) | `Cache-Control` headers on 4 hot read endpoints | Change note | ✔ Done (2026-04-17) |
| [P1-3](./P1-3-composite-indexes.md) | Composite indexes (regular, not CONCURRENTLY — see doc) | Full spec | ✔ Done (2026-04-17) |
| P1-4 | Dynamic-import heavy export deps (`jspdf`, `html2canvas`, `docx`) | Change note | ⏳ Open — deferred |
| P1-5 | Remove 13 localhost fallbacks from runtime code | Full spec | ✔ Done (2026-04-17, shipped with prod-safety gate) |

---

## 3. Wave 3 — P2 (pre-10 000 CCU) + IaaS rollout

Plans will be written in Weeks 3-4. Full rollout architecture lives in `docs/architecture/10k-users-iaas-rollout.md`.

| ID | Title | Type |
|---|---|---|
| P2-1 | Horizontal app tier + load balancer | Full spec |
| P2-2 | Postgres read replica + read-path routing | Full spec |
| P2-3 | `/metrics` endpoint + Prometheus scrape | Full spec |
| P2-4 | Sentry Performance across all 3 apps | Change note |
| P2-5 | Super-admin routes separate rate-limit bucket | Change note |
| P2-6 | Background job runner (BullMQ / pg-boss) | Full spec |
| P2-7 | Per-route `maxDuration` / memory config | Change note |
| IAS-1 | IaaS provisioning (VMs, Caddy, Docker) | Full spec |
| IAS-2 | CI/CD via GitHub Actions | Full spec |
| IAS-3 | Cutover runbook | Full spec |

---

## 4. Change notes — trivial items

Items that genuinely do not need a full plan. Applied as PRs with a brief reviewer note.

_(Empty until items get promoted from the P1/P2 queues above.)_

---

## 5. Cross-cutting decisions

These decisions apply to multiple plans and should be made once, up-front.

| Decision | Needed by | Status |
|---|---|---|
| Managed Postgres provider | P0-1 | ✅ **Neon** |
| Redis host | P0-3 | ✅ **Upstash** (TLS) |
| Observability stack (Grafana self-host / Grafana Cloud / Datadog) | P2-3 | ⏳ Open |
| Long-term platform | IAS-1 | ⏳ Open — **Wave 1 stays on Vercel**; IaaS is a later-wave decision |

For the Wave 1 Neon + Upstash + Vercel wiring (exact env vars per project, smoke tests, rollback): see **[VERCEL-PROD-SETUP.md](./VERCEL-PROD-SETUP.md)**.

---

## 6. How to use this index

- Every plan has a fixed ID (`P0-1`, `P0-2`, …). Don't renumber.
- Status is updated in this index **and** in the plan's frontmatter. When they disagree, the index wins (it's the dashboard).
- When a plan ships, set status `✔ Done`, add the deploy date + commit SHA, and link the retro entry if one exists.
- When a plan is dropped or deferred, update the status and write a **one-paragraph reason** at the top of the plan doc. Do not delete the doc — future-us will want to know why.

---

_Last updated: 2026-04-17 (Wave 1 drafted, awaiting review)_
