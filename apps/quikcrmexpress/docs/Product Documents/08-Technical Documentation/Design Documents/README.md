# Design Documents

> **Phase 2 · formal current-state architecture documentation.**

---

## Purpose of this folder

This folder holds **analysis documents that are not descriptions of the current architecture** but are grounded in it — dependency studies, option analyses, and considerations that a future design decision would need to account for.

It exists because the surrounding documentation set has a strict rule: everything under `Architecture/`, `Domain & Data/`, `API/`, `Security/`, `Integrations/`, `Infrastructure/` and `Operations/` describes **what is**. Anything that looks forward, even by exposing what a decision would have to reckon with, belongs here so the distinction stays visible.

## What belongs here

- Dependency and risk exposure studies for a decision that has not been taken.
- Option analyses that stop short of a recommendation.
- Feature technical design documents (TDDs), when a later phase produces them.

## What does not belong here

- **Target architecture.** Not in scope for this programme phase.
- **Migration or implementation plans.** Not in scope.
- **Recommendations.** Where this phase records a risk, it names the next *investigation*, not a solution.
- **Descriptions of the current system** — those belong in the architecture folders and must not be duplicated here.

## Current contents

| Document | What it is | What it deliberately is not |
|---|---|---|
| [`crmexpress-quikcrm-consolidation-considerations.md`](crmexpress-quikcrm-consolidation-considerations.md) | A measured inventory of every dependency, overlap and collision between `apps/crmexpress` and `apps/quikcrm`, and the information preconditions any consolidation decision would need | **Not** a migration plan, **not** a recommendation about whether to consolidate, and **not** a statement about which application should survive |

## Status

Phase 2 produces exactly one document here. Feature TDDs and design proposals are later-phase deliverables and will be added under this folder when they exist.
