# OPSP Critical # Review — Color Coding Logic

**Owner:** Ashwin Singh
**Module:** OPSP → Critical # Review
**Function:** `resolveCritTier(achieved, [SG, LG, Y, R])` in `lib/utils/opspHelpers.ts`

## Problem

Each Critical # card carries 4 user-defined threshold values, one per tier:

| Tier | Slot |
|---|---|
| Super Green | bullets[0] |
| Light Green | bullets[1] |
| Yellow | bullets[2] |
| Red | bullets[3] |

When a manager enters an **Achieved** value, the system must resolve it to exactly one tier (color). The threshold values are not always laid out in a fixed direction — three real-world cases exist:

1. **Descending** — higher achieved is better (e.g. revenue, customers).
2. **Ascending** — lower achieved is better (e.g. defects, churn, cost).
3. **Random / unordered** — thresholds neither strictly increase nor strictly decrease as you walk SG → R.

## Unified Algorithm

> **Sort the four (threshold, tier) pairs ascending by threshold value, then place the achieved value into the band whose lower bound it meets.**

Pseudo-code:

```
pairs = [(SG, sgValue), (LG, lgValue), (Y, yellowValue), (R, redValue)]
filter out pairs where the threshold is missing or non-numeric
sort pairs ascending by threshold value

if achieved < lowest threshold        → use the LOWEST pair's tier
for each adjacent pair (a, b):
    if a.value <= achieved < b.value  → use a.tier
if achieved >= highest threshold      → use the HIGHEST pair's tier
```

Equality is treated as "in the band that **starts** at this threshold" (boundary inclusive on the lower side, exclusive on the upper).

## Condition 1 — Descending (higher is better)

**Example thresholds:** SG = 90, LG = 60, Y = 40, R = 20

Sorted ascending: `R 20 → Y 40 → LG 60 → SG 90`

| Achieved value | Falls in | Color |
|---|---|---|
| 10 | below 20 | **Red** |
| 25 | [20, 40) | **Red** |
| 45 | [40, 60) | **Yellow** |
| 75 | [60, 90) | **Light Green** |
| 100 | ≥ 90 | **Super Green** |

**Why:** the lowest threshold is `R=20`, so anything at or below the Red tier (and even below it) is Red. Each band moves up one color until we reach Super Green at the top.

## Condition 2 — Ascending (lower is better)

**Example thresholds:** SG = 20, LG = 40, Y = 60, R = 90

Sorted ascending: `SG 20 → LG 40 → Y 60 → R 90`

| Achieved value | Falls in | Color |
|---|---|---|
| 10 | below 20 | **Super Green** |
| 25 | [20, 40) | **Super Green** |
| 45 | [40, 60) | **Light Green** |
| 80 | [60, 90) | **Yellow** |
| 120 | ≥ 90 | **Red** |

**Why:** the lowest threshold is `SG=20`, so achieving below or at the SG band keeps you at SG. As achieved climbs, you walk Light Green → Yellow → Red.

## Condition 3 — Random / unordered

**Example thresholds:** SG = 60, LG = 20, Y = 40, R = 90

Sorted ascending: `LG 20 → Y 40 → SG 60 → R 90`

| Achieved value | Falls in | Color |
|---|---|---|
| 15 | below 20 | **Light Green** |
| 30 | [20, 40) | **Light Green** |
| 50 | [40, 60) | **Yellow** |
| 80 | [60, 90) | **Super Green** |
| 105 | ≥ 90 | **Red** |

**Why:** when thresholds are not strictly ordered, sorting them turns the problem into the same "find the nearest lower bound" lookup. The mapping (`threshold → tier`) is preserved, so visiting them in sorted order automatically gives the correct color regardless of how the user typed them in.

## Edge cases

| Case | Behavior |
|---|---|
| Achieved is null / empty / non-numeric | Return `null` (no tier) — UI shows no color |
| One or more threshold values missing | Drop those pairs from the sort, place by the remaining ones |
| Every threshold missing | Fallback: **Red** (matches legacy behavior) |
| Two thresholds with the same value | Whichever comes first in the original `[SG, LG, Y, R]` order wins for that exact boundary (stable sort) |
| Achieved exactly at a threshold | Belongs to the **starting** band (lower bound inclusive) |

## Why one algorithm covers all three

Conditions 1 and 2 are just the "extremes" of the sorted-thresholds approach. In Condition 1, the sort order is reversed `R, Y, LG, SG`. In Condition 2, the sort order equals the source order `SG, LG, Y, R`. Condition 3 produces an interleaved order — but the band logic is identical. We never branch on direction; we just sort and look up.

This means:
- The same function handles all three. No `if (ascending) ... else ...` fork.
- Adding a fifth tier (e.g. "Blue / Exceptional") later is a one-pair insertion, not a new branch.
- The behavior is fully determined by the threshold values the user enters — no extra "direction" flag needed in the data model.

## Test coverage

Three test groups in `__tests__/unit/opspHelpers.test.ts`:

1. **Descending** (existing) — boundaries + below-lowest case (currently green-on-CI).
2. **Ascending** — preserves Condition 2 examples.
3. **Random** — covers Condition 3 examples + non-monotonic permutations.

Plus: null achieved, string achieved, missing thresholds, all-missing → red.
