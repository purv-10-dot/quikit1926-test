import { z } from "zod";
import { fail, ok } from "@/lib/api/responses";
import { getPortalLinkByToken } from "@/lib/portals";
import {
  addSupportMessage,
  ensureSupportConversation,
  generateFallbackSupportReply,
  generateSupportReply,
  getPortalSupportState,
  isSupportAssistantConfigured
} from "@/lib/support-chat";

const messageSchema = z.object({
  message: z.string().trim().min(2).max(4000)
});

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const portal = await getPortalLinkByToken(params.token);
  if (!portal || portal.portal_type !== "customer") {
    return fail(404, { code: "PORTAL_NOT_FOUND", message: "Portal link is invalid or expired." });
  }

  const state = await getPortalSupportState(portal);
  return ok(state);
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const portal = await getPortalLinkByToken(params.token);
  if (!portal || portal.portal_type !== "customer") {
    return fail(404, { code: "PORTAL_NOT_FOUND", message: "Portal link is invalid or expired." });
  }

  const parsed = messageSchema.safeParse(await request.json());
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The support message is invalid.", details: parsed.error.flatten() });
  }

  const conversation = await ensureSupportConversation(portal, parsed.data.message);
  const userMessage = await addSupportMessage({
    portal,
    conversationId: conversation.id,
    role: "user",
    body: parsed.data.message
  });

  try {
    if (!isSupportAssistantConfigured()) {
      const result = await generateFallbackSupportReply({
        portal,
        conversationId: conversation.id,
        latestCustomerMessage: parsed.data.message
      });

      const assistantMessage = await addSupportMessage({
        portal,
        conversationId: conversation.id,
        role: "assistant",
        body: result.assistantText,
        metadata: { ticket_number: result.ticket?.ticket_number ?? null, fallback: true }
      });

      return ok({ user_message: userMessage, assistant_message: assistantMessage, ticket: result.ticket, configured: false });
    }

    const result = await generateSupportReply({
      portal,
      conversationId: conversation.id,
      latestCustomerMessage: parsed.data.message
    });

    const assistantMessage = await addSupportMessage({
      portal,
      conversationId: conversation.id,
      role: "assistant",
      body: result.assistantText,
      metadata: {
        ticket_number: result.ticket?.ticket_number ?? null,
        response_id: result.responseId
      }
    });

    return ok({
      user_message: userMessage,
      assistant_message: assistantMessage,
      ticket: result.ticket,
      configured: true
    });
  } catch (error) {
    const result = await generateFallbackSupportReply({
      portal,
      conversationId: conversation.id,
      latestCustomerMessage: parsed.data.message
    });

    const assistantMessage = await addSupportMessage({
      portal,
      conversationId: conversation.id,
      role: "assistant",
      body: result.assistantText,
      metadata: {
        ticket_number: result.ticket?.ticket_number ?? null,
        error: error instanceof Error ? error.message : "Unknown support assistant error"
      }
    });

    return ok({
      user_message: userMessage,
      assistant_message: assistantMessage,
      ticket: result.ticket,
      configured: isSupportAssistantConfigured()
    });
  }
}
