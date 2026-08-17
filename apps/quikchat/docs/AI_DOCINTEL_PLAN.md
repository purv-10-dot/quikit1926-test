# QuikChat × QuikVerse AI — Document Intelligence in Chat (Build Plan)

**Owner:** Suyash. **Status:** decisions locked (2026-07); Stage 1 prompt pending one code read (client assist trigger + runtime interface). **Lives here** (`apps/quikchat/docs/`, gitignored) so it doesn't ride the `feature/quikchat-port` commit.

## Goal
A dedicated "AI Chat" in the QuikChat messenger: drop a document → AI summary → optionally save to a personal/org knowledge base → ask questions against it. Future path: file documents into specific apps (invoice→QuikFinance, payslip→HRMS).

## Runtime provides (no new AI work for stages 1–3)
- Universal conversational endpoint `POST /ai/chat/assist` (SSE, agent-JWT) — QuikChat already relays to this behind its `RuntimeClient` seam.
- Document-analysis path on that same endpoint (pass a document ref → summarize/answer).
- Knowledge-base pipeline `POST /ai/ingest` → Q&A retrieval with citations.

## Gates — both CLEARED (2026-07)
1. **Real runtime**: confirmed we work against the live runtime (the `RuntimeClient` stub is swapped for the real `/ai/chat/assist` call). *Action carried into Stage 1: verify the runtime client in `lib/server/runtime` is the real impl, not the stub the relay-route comment references.*
2. **GCS**: credentials present in `apps/quikchat/.env.local` (split-cred form, enabled by the merged `gcs.ts`/`index.ts` change). **Remaining check:** confirm QuikChat's `GCS_BUCKET` is the *same bucket the runtime reads*, and the runtime has read access to QuikChat's object prefix (`quikchat/<orgId>/<channelId>/…`). Same bucket = the runtime can fetch by `storageKey`.

## Locked decisions
1. **File reference — hold both, prefer storageKey.** `uploadFile()` already returns `MediaMeta.objectPath` = the `storageKey` (stored on the Media message); the storage layer signs download URLs on demand. Pass the **durable `storageKey`** to the runtime as the primary handle (no expiry); mint a signed `url` only if the runtime wants HTTP fetch. One upload → both refs.
2. **Visibility — PRIVATE by default + explicit "share with org" (ORG).** Least-surprise; tight retrieval scope. No per-channel visibility in v1.
3. **Retrieval trigger — conversation-scoped auto, full-KB on explicit ask.** In the AI-chat, auto-retrieve against docs attached to *that conversation* (follow-up Q&A "just works"); require explicit "search my docs" to widen to the personal/org KB. Not every-turn-whole-KB (latency/cost/noise).
4. **Ingest trigger — explicit "Add to KB" button only, v1.** No auto-ingest; Stage 2's transient analysis covers "just summarize." Revisit auto-ingest later for specific conversation types.

## Grounded architecture (from reading the code)
- **Conversation type** = `QcChannel.type` (string). Today `create()` accepts only `"dm"`/`"group"`. AI-chat = a **new `type`** (proposed `"ai"`), a **per-user singleton** channel containing the user + the assistant bot (find-or-create, mirroring `findExistingDm`). `toListItem` naming + the create/validation paths must learn the new type.
- **Assistant identity** already exists: `ASSISTANT_BOT_USER_ID` (synthetic `ai_agent` user), `ensureAssistantBot()` joins it to a channel, `QcAssistantConfig` gates enable (default on). Bot replies post as `ai_agent` messages and fan out over realtime like any message.
- **Assist relay**: `POST /api/channels/[id]/assist { prompt, threadRootId? }` → `runtime.assist({...})` (SSE) → on `done`, posts the bot reply (idempotent on `agentRunId`). **Note:** the relay posts only the *bot* reply, not the user's prompt — so the AI-chat/`/ai` client path must handle persisting/rendering the user's own message. *(Exact current behavior = the one read still needed before Stage 1.)*
- **Runtime seam**: `lib/server/runtime` (`RuntimeClient`, `RuntimeEvent`, `AssistHistoryItem`). Stage 2 extends `runtime.assist()` input to carry `{ storageKey, url?, filename }` and the real client forwards it to `/ai/chat/assist`.
- **Upload**: `uploadFile()` → sign → PUT → `MediaMeta { objectPath, mediaType, originalName, size }`. Driver-agnostic; `objectPath` is the storageKey.

## Stages
- **Stage 1 — AI-chat surface + `/ai` command.** New `"ai"` conversation type (singleton per user, user + bot), a nav entry to open it, and an `/ai` slash command in any normal channel that routes the message (+ attachment later) to the assist relay instead of a normal send. Depends on: confirming the real runtime client + how the user prompt is persisted.
- **Stage 2 — attach + summarize.** Upload to the shared bucket (already yields `objectPath`), thread `{ storageKey, url?, filename }` through client → relay route → `runtime.assist()` → real `/ai/chat/assist`. Transient per-message analysis (no RAG). Gated on shared-bucket alignment.
- **Stage 3 — "Add to KB?" → Q&A.** After the summary, an "Add to knowledge base?" action → `POST /ai/ingest` with `storageKey`, `sourceFileId` (stable file id = idempotency/replace key), `appId="quikchat"`, `visibility` (PRIVATE default). Then conversation-scoped retrieval wiring (decision 3). Largest chunk.
- **Stage 4 — file into a specific app (FUTURE).** `appId`+`entityId`+`visibility=APP` makes an ingested doc retrievable in a target app's context; the actual agent-*write* into QuikFinance/HRMS is behind the approval-gated write path — separate later phase. Design Stage 3's `appId`/`entityId` metadata with this in mind (the ingest contract already supports it).

## Workflow
Decisions locked above → Claude Code session prompts per stage (readback-first, STOP-before-write, Suyash runs git/terminal). Stage 1 prompt written after the final client-assist/runtime read. Prompts live in `apps/quikchat/docs/`.
