# QuikChat — Program Plan

**Scope:** everything owned by Suyash — QuikChat app, AI Runtime, Search service.
Because all three are the same owner, the dependencies between them are *sequencing
decisions*, not external blockers.

**Source of truth for feature status:** `QuikChat_Production_GoLive_Checklist` (47 rows),
validated against a full codebase sweep. Counts below refer to that sheet.

---

## 0. Blockers — clear before starting anything new

| # | Item | Owner | Notes |
|---|---|---|---|
| 0.1 | **31 excluded Vitest files** | Us | `vitest.config.ts` excludes 31 DB-backed test files "pending re-home to Playwright". This is real written coverage that never runs. Includes 5 of Sagar's new calling route tests and `app/api/uploads/sign/route.test.ts`. Same failure shape as the gitignore bug: green suite, silent gap. |
| 0.2 | **`QUIKCHAT_MERGE_PLAN.md` is missing** | Us | Referenced by `vitest.config.ts` as the definition of "Bucket 2". File does not exist. Either restore it or rewrite the exclusion comment to stand alone. |
| 0.3 | **UAT upload rebuild** | Vinayak | Root cause found (routes missing from build + stale CSP build-arg). Awaiting rebuild + redeploy. |
| 0.4 | **UAT GCS write 400** | Us / Vinayak | Logging fix shipped; needs one reproduction to read `errCode`/`errStatus`. **Read `apps/quikchat/docs/GCS_CREDS_SESSION.md` first** — prior work on this may already have the answer. |
| 0.5 | **Draft persistence per channel** | Us | Composer text is destroyed on channel switch. Deliberate side-effect of the remount, but wrong behaviour vs. Slack/Teams/WhatsApp. Fixable without undoing the remount (save on unmount, restore on mount). |
| 0.6 | **Privacy-switch fast-toggle revert** | Us | `SettingsModule`'s mount GET clobbers an optimistic flip; PUT persists, so server holds the new value while UI shows the old. Worst possible shape for a privacy control. Found by Playwright. |
| 0.7 | **Presence self-healing gap** | Us | Client online-set is seeded once at connect and only corrected by live events. No re-sync if it ever drifts. Observed once tonight; self-corrected. |

---

## 1. Track 1 — QuikChat-only, zero dependencies

Fastest checklist movement. Nothing external blocks any of these.

| Work | Rows | Notes |
|---|---|---|
| **Drag & Drop upload** | 1 | Smallest item on the sheet. `handleDrop` exists only as a recording guard today; needs the staging path. Code comment confirms: *"No paste-to-upload path exists today."* |
| **Link Preview** | 1 | De-risked: `apps/quiklms/lib/ssrf.ts` is a production-grade SSRF guard (validates on **resolved IP**, blocks RFC1918/loopback/link-local/CGNAT/IPv4-mapped-v6). Copy it, add an OpenGraph fetcher + card component. |
| **Audit Logs** | 1 | Confirmed absent in QuikChat. Platform `AuditLog` exists (used by quikscale with `actorRole`). Needs a scope decision: which QuikChat actions are auditable? |

---

## 2. Track 2 — Search (3 rows, largest gap)

**Architecture is decided and is NOT what the April plan said.** The plan described an
in-monorepo `search_index` table + `SearchAdapter` interface. What HRMS actually built
(`apps/quikhrms/lib/search/search-index.ts`) targets an **external service over HTTP**:

```
POST {SEARCH_SERVICE_URL}/api/internal/index-event
header: x-internal-secret
body:   { operation, entityType, entityId, orgId, displayName, indexableText, snippet, url }
```

That emitter is **inert** — it no-ops when the env vars are unset, because the Search
service and `@quikit/search-sdk` don't exist in the monorepo yet.

**QuikChat writes an emitter, not a search engine.** ~1 day following the HRMS pattern,
once two things are settled:

### DECISION REQUIRED — does chat message content get indexed at all?
Materially different from every other app. HRMS indexes org-visible entities; QuikChat
would be indexing private DM bodies.

- **(a) Metadata only** — channel/group/file names, no message bodies. Closes Global +
  File Search, not Message Search. Safest.
- **(b) Public/group channels only** — index bodies for joinable channels, exclude DMs.
- **(c) Everything with per-entity ACL** — full message search; only viable if access
  control is genuinely airtight.

### Hard requirements if past (a)
1. **Per-entity ACL, not just tenant scoping.** Channel membership changes over time. A
   private-channel message must never surface for a non-member. If the service can't
   filter at query time, post-filtering breaks pagination semantics.
2. **Prompt deletion propagation** — soft delete, delete-for-everyone, channel deletion.
3. **Edit re-indexing** — messages are editable; confirm replace-not-append.
4. **Volume/backpressure** — chat is continuous, unlike HRMS entity changes. Batching?
   Rate limits? Buffering when the service is down?
5. **Scoped query** — filter by `app_code`, `entity_type`, and ideally `channelId`
   (for "search in this conversation").

---

## 3. Track 3 — AI composer actions (3 rows)

No new AI plumbing needed. `assist-client.ts` (SSE) + `assistant.service.ts` (bot
identity, per-org gating, KB retrieval) already work. These are new `use_case` entry
points.

**Build order: Rewrite → Translate → Smart Replies.**

| use_case | Trigger | Output | Latency budget |
|---|---|---|---|
| `quikchat_rewrite` | User-initiated (toolbar) | Rewritten text + `tone` param | 2–3s OK |
| `quikchat_translate` | User-initiated (per message) | Translated text + detected source | 2–3s OK |
| `quikchat_smart_replies` | **Automatic, per inbound message** | JSON array, 2–3 suggestions | **sub-1s or drop it** |

### DECISION REQUIRED — Smart Replies cost
Fires on every inbound message for every user. Categorically different spend profile
from `/ai`-triggered assist. Need per-call cost, a gating decision (per-org flag? DMs
only? focused-window only?), and confirmation the Runtime can absorb the volume.
**Entirely acceptable outcome: kill this row.** Cheaper to decide now than after build.

### Translate — Hinglish is the real test case
Not hypothetical. Real QuikChat messages today mix Hindi and English in one sentence,
often Hindi in Roman script. Test against actual message samples, not clean
single-language input.

### Governance (SDK golden rules apply)
Never call an LLM SDK directly · always pass `use_case` · always implement a fallback.
Degraded states: Rewrite/Translate → error toast, composer untouched. Smart Replies →
chips don't render, no error, no layout shift.

---

## 4. Track 4 — Calls (3 rows)

**Code is done.** Sagar's `feature/quikchat-paid-calling-integration` merged: 1:1 migrated
off the WebRTC mesh to LiveKit, group calls hardened, LiveKit webhook endpoint, host
controls (mute-all, remove participant), token minting.

The mesh implementation and its tests (`lib/webrtc.test.ts`, `ice-provider.test.ts`) were
removed — that's why the suite count moved; it is correct, not a loss.

**The rows do not move on code.** They move when `SFU_MODE=live` + `LIVEKIT_URL` +
`LIVEKIT_API_KEY` + `LIVEKIT_API_SECRET` are set in a deployed environment.
`selectSFUMode()` falls back to stub with a warning if any are missing. That's config +
the LiveKit commercial approval — not engineering.

### Open questions for Sagar
- Is the `RejoinBanner` comment about *"1:1 mesh call (participantCount === 2) has no
  clean rejoin path yet"* stale now that 1:1 is on LiveKit?
- His 5 route tests are in the Vitest exclusion list (0.1) — re-home or fix?

---

## 5. Ongoing — Playwright

Harness is live: `apps/quikchat/playwright.config.ts`, cookie-minting auth fixture
against real seeded users, dual webServer (app 3011 + gateway 3099), Redis preflight.

**First test already earned its keep** — the last-seen spec caught the stale-cache
privacy bug that four rounds of manual two-window testing missed.

Extend per feature as it lands. Next candidates:
- **Calling control plane** (ready to scope now): group-call notification fan-out across
  two users, popup window opening, rejoin banner, call history. Needs
  `--use-fake-device-for-media-stream` flags and a group channel with both fixture users.
  Excludes real media (needs LiveKit) and webhooks (route test, not browser test).
- Upload + retry
- Draft persistence, once built

---

## 6. Not ours to build

| Rows | Reality |
|---|---|
| Auth: Email/Password, Google, Microsoft SSO (3) | Lives in `@quikit/auth`, shared. Needs verification of what's enabled, not building. |
| HTTPS/TLS, Backup & DR, Performance (3) | Infra / DBA / measurement. |
| Mobile: Android, iOS (2) | Confirmed absent across all three repos. Own project, own roadmap. |
| Cross-app integration: CRM, Track, HRMS, Finance (4) | `AppSwitcher.tsx` is a generic visibility-filtered launcher, identical for every app. Whether that counts as "integrated" is a definition question for whoever owns the sheet. |

---

## 7. Structural debt surfaced during this work

- **31 excluded Vitest files** (0.1) — the headline item.
- **`.gitignore` pattern shadowing** — fixed for `uploads/`, but the class of bug is worth
  a one-time audit of other unanchored patterns across apps.
- **7 pre-existing `no-unused-vars` lint errors** in quikchat; `npm run lint` is red.
- **1 pre-existing Vitest failure** — `app/api/notifications/settings/route.test.ts`,
  PrismaClient constructed without `DATABASE_URL` in the Vitest env.
- **`state.lastSeen` in `presence-store.ts`** — dead state holding a raw, pre-privacy
  timestamp. Nothing reads it; wiring it into a header would bypass every privacy rule.
  Now commented as such.
- **Typing-indicator + read-receipt privacy toggles are fake** — local `useState`, no
  persistence, no effect. The features themselves work; the toggles don't control them.
- **Voice-note silent-recording UX gap** — the app will happily record, upload, and send a
  completely silent voice note when the wrong mic is selected. No input-level indicator,
  no warning. Cost real debugging time tonight.
