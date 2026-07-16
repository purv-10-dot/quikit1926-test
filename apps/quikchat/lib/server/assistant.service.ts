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
 */
export function buildHistory(messages: MessageDto[], currentPrompt?: string): AssistHistoryItem[] {
  const items = messages
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
