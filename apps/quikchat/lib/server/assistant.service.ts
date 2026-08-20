/**
 * In-chat AI assistant (S12) — server helpers: the synthetic bot identity, the
 * per-org/channel enable flag, and pushed-context assembly. The invoke + SSE
 * relay lives in the route; the runtime call lives behind the RuntimeClient seam.
 */
import { db as prisma } from "@quikit/database";
import { ASSISTANT_BOT_USER_ID, type MessageDto, type OrgContext } from "@/lib/shared";
import type { AssistHistoryItem } from "./runtime/types";

/** Stable, QuikChat-owned bot identity (a synthetic `ai_agent` participant). */
export { ASSISTANT_BOT_USER_ID };
export const ASSISTANT_BOT_AGENT_ID = "quikchat-assistant";
export const ASSISTANT_BOT_NAME = "Assistant";

/** How many recent messages to push as context. */
export const ASSIST_HISTORY_LIMIT = 25;

/**
 * `data.kind` on the "New chat" marker — an ordinary `SystemActivity` message
 * row, deliberately NOT a new column.
 *
 * The AI chat is a find-or-create singleton per user, so "New chat" cannot mint a
 * second conversation without changing that contract. It does not need to: the
 * runtime holds no conversation state of its own (`channelId` is telemetry only —
 * see docs/RUNTIME.md), so everything the model can see arrives in the pushed
 * `history` built below. Starting that window at a marker is therefore a complete
 * context reset, while the transcript itself survives untouched.
 *
 * A message row rather than a column because it needs no migration, it already
 * fans out to every member, `MessageRow` already renders `SystemActivity` as a
 * centred divider, and `buildHistory` already drops it from the context. Deleting
 * the rows instead would also strand this channel's KB scope, which is derived
 * from ingest markers on Media messages (kb.service#listChannelKbSourceFileIds) —
 * the documents stay in the runtime's KB while the chat silently loses every
 * pointer to them.
 */
export const AI_CONTEXT_RESET_KIND = "ai_context_reset";

/** The user-visible divider text carried on a reset marker. */
export const AI_CONTEXT_RESET_TEXT = "New chat started";

/** Is this row a context-reset marker? */
export function isContextResetMarker(m: MessageDto): boolean {
  return m.type === "SystemActivity" && m.data?.kind === AI_CONTEXT_RESET_KIND;
}

/**
 * Ensure the bot exists as a User and is a member of the channel so its posted
 * reply attributes correctly (senderId = bot) and serializes a display name.
 * Idempotent.
 */
export async function ensureAssistantBot(orgId: string, channelId: string): Promise<void> {
  await prisma.user.upsert({
    where: { id: ASSISTANT_BOT_USER_ID },
    update: {},
    create: {
      id: ASSISTANT_BOT_USER_ID,
      email: "assistant@quikchat.local",
      firstName: ASSISTANT_BOT_NAME,
      lastName: "",
    },
  });
  await prisma.qcChannelMember.upsert({
    where: {
      orgId_channelId_userId: { orgId, channelId, userId: ASSISTANT_BOT_USER_ID },
    },
    update: {},
    create: { orgId, channelId, userId: ASSISTANT_BOT_USER_ID, role: "member" },
  });
}

/**
 * Is the assistant enabled for this channel? Resolution: a per-channel config
 * row wins, else the org-level row (channelId ""), else the built-in default
 * (enabled).
 */
export async function isAssistantEnabled(orgId: string, channelId: string): Promise<boolean> {
  const channelCfg = await prisma.qcAssistantConfig.findUnique({
    where: { orgId_channelId: { orgId, channelId } },
  });
  if (channelCfg) return channelCfg.enabled;
  const orgCfg = await prisma.qcAssistantConfig.findUnique({
    where: { orgId_channelId: { orgId, channelId: "" } },
  });
  if (orgCfg) return orgCfg.enabled;
  return true; // default on
}

/** Set the enable flag for an org (channelId omitted → "") or a specific channel. */
export async function setAssistantEnabled(
  orgId: string,
  channelId: string | null,
  enabled: boolean,
): Promise<void> {
  const key = channelId ?? "";
  await prisma.qcAssistantConfig.upsert({
    where: { orgId_channelId: { orgId, channelId: key } },
    update: { enabled },
    create: { orgId, channelId: key, enabled },
  });
}

/**
 * Map recent messages (newest-first, as `messages.list` returns) into pushed
 * `history[]` (oldest→newest). Text-only: skip deleted/system/empty rows. The
 * bot's own prior messages become `assistant` turns.
 *
 * `currentPrompt` (option b): the AI-chat conversation type persists the user's
 * turn BEFORE invoking assist, so the newest history item would duplicate the
 * live `prompt` and the runtime would see the current turn twice. When the
 * caller passes the prompt, drop a trailing `user` turn whose text matches it so
 * the current turn is sent exactly once. Normal `/ai` never persists the prompt,
 * so the trailing item is genuine prior context and nothing is dropped.
 *
 * A "New chat" marker truncates the window: nothing at or before the NEWEST one
 * is sent. Newest, not first — resetting several times in one conversation is the
 * normal case, and anchoring on the first would re-admit everything the later
 * resets existed to hide. `messages` arrives newest-first, so the newest marker is
 * simply the first one found and `slice(0, idx)` keeps what came after it.
 *
 * The cut happens BEFORE the filter below, because the marker is itself a
 * `SystemActivity` row that the filter would otherwise remove. A marker older than
 * the fetched window needs no handling: every row in the window is then newer than
 * it, which is already the right answer.
 */
export function buildHistory(messages: MessageDto[], currentPrompt?: string): AssistHistoryItem[] {
  const resetAt = messages.findIndex(isContextResetMarker);
  const sinceReset = resetAt === -1 ? messages : messages.slice(0, resetAt);

  const items = sinceReset
    .filter(
      (m) => m.type !== "Delete" && m.type !== "SystemActivity" && m.content.trim().length > 0,
    )
    .slice(0, ASSIST_HISTORY_LIMIT)
    .map((m) => ({
      role: m.actorType === "ai_agent" ? ("assistant" as const) : ("user" as const),
      text: m.content,
      createdAt: m.createdAt,
    }))
    .reverse();

  if (currentPrompt !== undefined) {
    const last = items[items.length - 1];
    if (last && last.role === "user" && last.text.trim() === currentPrompt.trim()) items.pop();
  }
  return items;
}

/** The OrgContext used to POST the bot's reply (attributed to the bot user). */
export function botContext(orgId: string): OrgContext {
  return { orgId, userId: ASSISTANT_BOT_USER_ID };
}
