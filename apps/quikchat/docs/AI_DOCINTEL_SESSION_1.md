# QuikChat — Claude Code Session: AI Doc-Intel Stage 1 (AI-chat conversation type + `/ai`)

**You are Claude Code**, monorepo `C:\Users\user\Desktop\quikit-platform\quikit1926`, `apps/quikchat`, branch `feature/quikchat-port`. Read this whole prompt, **investigate the referenced files**, then **STOP and reply with a readback/plan** (final section). **Do NOT write code or run commands until Suyash replies "go".** Suyash runs all git/terminal; you never run git. Context doc: `apps/quikchat/docs/AI_DOCINTEL_PLAN.md` (read it — the four locked decisions + staging).

## Goal (Stage 1 only)
Add a **dedicated "AI Chat" conversation type** to the messenger (a per-user singleton conversation with the assistant), and confirm the existing **`/ai` slash command** routes end-to-end. Stages 2 (attach+summarize) and 3 (KB) are separate later sessions — do NOT build them now. No file/upload or ingest work in this session.

## What already exists (verified — build ON these, don't duplicate)
- **`/ai` parsing**: `parseAssistCommand()` in `components/chat/Composer.tsx` matches `/ai`/`/ask`, strips the prefix; the composer already splits an assist command (`onAssist`) from a normal send (`onSend`). *Confirm the full client wiring in your readback (see Q1).*
- **Assist relay**: `POST /api/channels/[id]/assist { prompt, threadRootId? }` → `runtime.assist()` (SSE) → on `done` posts the bot reply as an `ai_agent` message (idempotent on `agentRunId`). Works in any channel where the assistant is enabled.
- **Assistant bot identity**: `ASSISTANT_BOT_USER_ID`, `ensureAssistantBot(orgId, channelId)` (joins the bot to a channel), `isAssistantEnabled()` (default on), `QcAssistantConfig`. In `lib/server/assistant.service.ts`.
- **Runtime is env-gated**: `RUNTIME_MODE=http` + `RUNTIME_BASE_URL` → real `HttpRuntimeClient`; else stub (`lib/server/runtime/index.ts`). Suyash sets these in `.env.local`; NOT your concern to wire.
- **Channel model**: `QcChannel.type` is a string; `channels.service.ts` `create()` currently accepts only `"dm"`/`"group"`. `discover`/`join` filter `type="group"`. `toListItem` special-cases `"dm"` naming.

## Scope — the new conversation type

### 1. `lib/server/channels.service.ts` — the `"ai"` type + singleton find-or-create
- Add a dedicated `findOrCreateAiChat(ctx): Promise<ChannelListItem>` — NOT via the public `create()` (keep its dm/group validation intact). It finds the caller's existing `type="ai"` channel (they can have only one) or creates one: a `QcChannel` with `type:"ai"`, `visibility:"private"`, `createdById: ctx.userId`, adds the caller as `admin` member, and calls `ensureAssistantBot(ctx.orgId, channelId)` so the bot is a member. Singleton per user (find first, else create — mirror the spirit of `findExistingDm`).
- **`toListItem`**: handle `type==="ai"` naming — name = "AI Chat" (or "Assistant"), avatar = the bot's (or a fixed asset). Do NOT let the dm "other member" logic run for `"ai"`.
- **Guardrails for the new type across the file**: `discover`/`join` must still only surface `"group"` (an AI chat is never discoverable/joinable); `addMember`/`removeMember`/`updateMemberRole`/`createInvite` must reject `type==="ai"` (it's not a group); `leave` on an AI chat should behave sensibly (deleting it is fine — it's a singleton the user can recreate). Audit every `channel.type` check in the file and state what each does for `"ai"` in your readback.

### 2. Route to open it
- Add `POST /api/channels/ai` (or similar) that calls `findOrCreateAiChat` and returns the `ChannelListItem`, so the client can "open AI Chat" idempotently. Follow the existing channels route conventions (`withOrgAuth`, rate-limit tier).

### 3. Client — an entry point + AI-chat message routing
- **Entry point**: a way to open the AI chat from the messenger UI (e.g. a button in the message-list header / rail). Read `components/chat/ChatShell.tsx` + `ChatWorkspace.tsx` and place it where it fits the existing layout; keep it minimal. Clicking it POSTs the open-route and navigates to that channel.
- **Routing inside an AI chat**: in a `type==="ai"` channel, **every** user message invokes the assistant (not just `/ai`-prefixed). The flow per turn: persist/render the user's message normally (so history + reload work — `buildHistory` reads persisted messages), then call `streamAssist(channelId, { prompt })`. In normal channels, keep today's behavior (only `/ai`/`/ask` → assist). Confirm in readback how the user turn is persisted today for the `/ai` path (Q1) and match it.
- Do NOT change the SSE/`streamAssist` contract or the relay route in this session.

## Constraints
- No file/upload/ingest/RAG work (Stages 2–3).
- Do NOT change `AssistInput`/`RuntimeClient`/the relay route/`streamAssist`.
- No new deps. Tenant isolation preserved (all queries org-scoped, as the service already does).
- Additive: `"dm"`/`"group"` behavior unchanged.

## Verification gate (Suyash runs, after "go")
1. `cd apps/quikchat && npx tsc --noEmit` → 0.
2. `npx vitest run` → green; state the new expected total (you'll add channels.service + route tests for the `"ai"` type + singleton).
3. With `RUNTIME_MODE=http` + `RUNTIME_BASE_URL` set and the cluster running: open "AI Chat" from the UI → a singleton AI conversation opens; sending a plain message streams an assistant reply that persists; reopening shows history. Opening "AI Chat" again reuses the same conversation (no duplicate).
4. In a normal channel, `/ai <prompt>` still invokes the assistant; a normal message does not.

## STOP HERE — readback required
Reply with:
1. **Q1 (the one I need):** how does the CURRENT `/ai` path handle the user's own message — does `onAssist` persist/post the user's prompt as a channel message, or only stream the reply? Quote the `Composer.tsx` `onAssist` wiring + wherever `streamAssist` is called (`ChatWorkspace`?). This decides how the AI-chat persists user turns.
2. `findOrCreateAiChat` shape + the singleton find-or-create logic.
3. Every `channel.type` check in `channels.service.ts` and what it does for `"ai"` (create/discover/join/toListItem/addMember/removeMember/updateMemberRole/createInvite/leave).
4. The open-route + the client entry point (where you'll place it, from reading ChatShell/ChatWorkspace).
5. AI-chat per-turn routing (persist user msg → streamAssist) and how it differs from normal-channel `/ai`.
6. Tests you'll add + new expected total.
7. Anything that contradicts the "what already exists" list above.

Wait for **"go"** before implementing.
