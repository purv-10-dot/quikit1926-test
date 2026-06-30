import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getServerEnv } from "@/lib/env";
import { type PortalLink, getCustomerPortalPayload } from "@/lib/portals";
import type { Json } from "@/types/database.types";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const HISTORY_LIMIT = 12;

type ConversationRow = {
  id: string;
  org_id: string;
  portal_link_id: string;
  contact_id: string | null;
  title: string | null;
  status: string;
  last_message_at: string;
  created_at: string;
  updated_at: string | null;
};

export type SupportMessageView = {
  id: string;
  role: "user" | "assistant" | "system";
  body: string;
  created_at: string;
  metadata: Json;
};

export type SupportTicketView = {
  id: string;
  ticket_number: string;
  subject: string;
  priority: string;
  status: string;
  requested_by_name: string | null;
  requested_by_email: string | null;
  created_at: string;
};

type PortalSupportState = {
  configured: boolean;
  conversation: ConversationRow | null;
  messages: SupportMessageView[];
  tickets: SupportTicketView[];
};

type ToolCall = {
  call_id: string;
  name: string;
  arguments: string;
};

type OpenAiResponse = {
  id?: string;
  output?: Array<Record<string, unknown>>;
  output_text?: string;
};

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function parseJson(value: string) {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toMessageView(row: Record<string, unknown>): SupportMessageView {
  return {
    id: asString(row.id),
    role: (asString(row.role) as SupportMessageView["role"]) || "assistant",
    body: asString(row.body),
    created_at: asString(row.created_at),
    metadata: (row.metadata as Json) ?? {}
  };
}

function toTicketView(row: Record<string, unknown>): SupportTicketView {
  return {
    id: asString(row.id),
    ticket_number: asString(row.ticket_number),
    subject: asString(row.subject),
    priority: asString(row.priority),
    status: asString(row.status),
    requested_by_name: typeof row.requested_by_name === "string" ? row.requested_by_name : null,
    requested_by_email: typeof row.requested_by_email === "string" ? row.requested_by_email : null,
    created_at: asString(row.created_at)
  };
}

function buildTicketNumber() {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  return `SUP-${timestamp}-${randomUUID().slice(0, 4).toUpperCase()}`;
}

export function isSupportAssistantConfigured() {
  return getServerEnv().openaiApiKey.trim().length > 0;
}

async function getLatestConversation(portal: PortalLink) {
  const admin = db;
  const { data } = await admin
    .from("support_conversations")
    .select("id, org_id, portal_link_id, contact_id, title, status, last_message_at, created_at, updated_at")
    .eq("org_id", portal.org_id)
    .eq("portal_link_id", portal.id)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as unknown as ConversationRow | null) ?? null;
}

export async function ensureSupportConversation(portal: PortalLink, initialTitle?: string) {
  const existing = await getLatestConversation(portal);
  if (existing && existing.status !== "closed") {
    return existing;
  }

  const admin = db;
  const { data, error } = await admin
    .from("support_conversations")
    .insert({
      org_id: portal.org_id,
      portal_link_id: portal.id,
      contact_id: portal.contact_id,
      title: initialTitle ?? null,
      status: "open"
    })
    .select("id, org_id, portal_link_id, contact_id, title, status, last_message_at, created_at, updated_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Support conversation could not be created.");
  }

  return data as unknown as ConversationRow;
}

export async function listSupportMessages(conversationId: string) {
  const admin = db;
  const { data, error } = await admin
    .from("support_messages")
    .select("id, role, body, created_at, metadata")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => toMessageView(row as Record<string, unknown>));
}

export async function listSupportTicketsForPortal(portal: PortalLink) {
  const admin = db;
  const { data, error } = await admin
    .from("support_tickets")
    .select("id, ticket_number, subject, priority, status, requested_by_name, requested_by_email, created_at")
    .eq("org_id", portal.org_id)
    .eq("portal_link_id", portal.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => toTicketView(row as Record<string, unknown>));
}

export async function getPortalSupportState(portal: PortalLink): Promise<PortalSupportState> {
  const conversation = await getLatestConversation(portal);
  const [messages, tickets] = await Promise.all([
    conversation ? listSupportMessages(conversation.id) : Promise.resolve([]),
    listSupportTicketsForPortal(portal)
  ]);

  return {
    configured: isSupportAssistantConfigured(),
    conversation,
    messages,
    tickets
  };
}

export async function addSupportMessage({
  portal,
  conversationId,
  role,
  body,
  metadata
}: {
  portal: PortalLink;
  conversationId: string;
  role: "user" | "assistant" | "system";
  body: string;
  metadata?: Json;
}) {
  const admin = db;
  const { data, error } = await admin
    .from("support_messages")
    .insert({
      org_id: portal.org_id,
      conversation_id: conversationId,
      role,
      body,
      metadata: metadata ?? {}
    })
    .select("id, role, body, created_at, metadata")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Support message could not be saved.");
  }

  await admin
    .from("support_conversations")
    .update({
      last_message_at: new Date().toISOString(),
      title: role === "user" ? body.slice(0, 120) : undefined
    })
    .eq("id", conversationId);

  return toMessageView(data as Record<string, unknown>);
}

export async function createSupportTicket({
  portal,
  conversationId,
  subject,
  summary,
  priority
}: {
  portal: PortalLink;
  conversationId: string | null;
  subject: string;
  summary: string;
  priority?: "low" | "normal" | "high" | "urgent";
}) {
  const admin = db;
  const ticketNumber = buildTicketNumber();
  const { data, error } = await admin
    .from("support_tickets")
    .insert({
      org_id: portal.org_id,
      portal_link_id: portal.id,
      conversation_id: conversationId,
      contact_id: portal.contact_id,
      ticket_number: ticketNumber,
      subject,
      summary,
      priority: priority ?? "normal",
      status: "open",
      requested_by_name: portal.display_name,
      requested_by_email: portal.email,
      source: "portal_chat"
    })
    .select("id, ticket_number, subject, priority, status, requested_by_name, requested_by_email, created_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Support ticket could not be created.");
  }

  if (conversationId) {
    await admin.from("support_conversations").update({ status: "escalated" }).eq("id", conversationId);
  }

  await admin.from("audit_logs").insert({
    org_id: portal.org_id,
    user_id: null,
    entity_type: "support_ticket",
    entity_id: asString(data.id),
    action: "create",
    new_values: {
      ticket_number: ticketNumber,
      subject,
      summary,
      priority: priority ?? "normal",
      portal_link_id: portal.id
    }
  });

  return toTicketView(data as Record<string, unknown>);
}

function buildTranscript(messages: SupportMessageView[]) {
  return messages
    .slice(-HISTORY_LIMIT)
    .map((message) => `${message.role === "assistant" ? "Assistant" : message.role === "system" ? "System" : "Customer"}: ${message.body}`)
    .join("\n");
}

function buildTools() {
  return [
    {
      type: "function",
      name: "get_customer_account_overview",
      description: "Get the customer's current account overview, including outstanding invoices and statement download details.",
      parameters: {
        type: "object",
        properties: {},
        required: [],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: "function",
      name: "get_invoice_details",
      description: "Look up a specific invoice by invoice number, or return the latest open invoice when no invoice number is provided.",
      parameters: {
        type: "object",
        properties: {
          invoice_number: {
            type: ["string", "null"],
            description: "The invoice number mentioned by the customer, like INV-0004. Use null if the customer did not mention a specific invoice."
          }
        },
        required: ["invoice_number"],
        additionalProperties: false
      },
      strict: true
    },
    {
      type: "function",
      name: "create_support_ticket",
      description: "Create a human support escalation when the customer asks for a person or the issue cannot be fully solved from portal data.",
      parameters: {
        type: "object",
        properties: {
          subject: {
            type: "string",
            description: "A short support ticket title."
          },
          summary: {
            type: "string",
            description: "A concise summary of the customer's problem."
          },
          priority: {
            type: "string",
            enum: ["low", "normal", "high", "urgent"],
            description: "Ticket urgency."
          }
        },
        required: ["subject", "summary", "priority"],
        additionalProperties: false
      },
      strict: true
    }
  ];
}

async function createOpenAiResponse(input: unknown) {
  const { openaiApiKey, openaiSupportModel } = getServerEnv();
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: openaiSupportModel,
      instructions:
        "You are the QuikFinance customer support assistant inside a finance portal. Answer only about invoices, payments, statements, and portal help for the current customer. Use tools for exact account data. Never invent balances, dates, invoice numbers, or payment links. If you cannot fully solve the issue, or the customer asks for a human, call create_support_ticket. Keep replies concise, practical, and friendly.",
      input,
      tools: buildTools()
    })
  });

  const payload = (await response.json()) as OpenAiResponse & { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(payload.error?.message ?? "OpenAI request failed.");
  }

  return payload;
}

function extractToolCalls(response: OpenAiResponse) {
  return (response.output ?? [])
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item))
    .filter((item) => item.type === "function_call")
    .map(
      (item) =>
        ({
          call_id: asString(item.call_id),
          name: asString(item.name),
          arguments: asString(item.arguments, "{}")
        }) satisfies ToolCall
    )
    .filter((item) => item.call_id && item.name);
}

function extractResponseText(response: OpenAiResponse) {
  if (typeof response.output_text === "string" && response.output_text.trim().length > 0) {
    return response.output_text.trim();
  }

  for (const item of response.output ?? []) {
    const record = asRecord(item);
    if (!record || record.type !== "message" || !Array.isArray(record.content)) {
      continue;
    }

    for (const contentItem of record.content) {
      const content = asRecord(contentItem);
      if (content?.type === "output_text" && typeof content.text === "string" && content.text.trim().length > 0) {
        return content.text.trim();
      }
    }
  }

  return "";
}

export async function generateSupportReply({
  portal,
  conversationId,
  latestCustomerMessage
}: {
  portal: PortalLink;
  conversationId: string;
  latestCustomerMessage: string;
}) {
  const payload = await getCustomerPortalPayload(portal.access_token);
  if (!payload) {
    throw new Error("Customer portal context could not be loaded.");
  }

  const existingMessages = await listSupportMessages(conversationId);
  const transcript = buildTranscript(existingMessages);
  const statementUrl = `${getServerEnv().appUrl}/api/public/customer/${portal.access_token}/statement`;
  const intro = [
    `Organization: ${payload.organization?.name ?? "QuikFinance"}`,
    `Customer: ${payload.customer?.display_name ?? portal.display_name ?? "Customer"}`,
    `Preferred language: ${asString(payload.organization?.preferred_language, "en")}`,
    `Statement URL: ${statementUrl}`,
    transcript ? `Conversation so far:\n${transcript}` : "No prior conversation.",
    `Current customer message: ${latestCustomerMessage}`
  ].join("\n\n");

  let createdTicket: SupportTicketView | null = null;
  let workingInput: unknown[] = [
    {
      role: "user",
      content: [{ type: "input_text", text: intro }]
    }
  ];

  let response = await createOpenAiResponse(workingInput);

  for (let round = 0; round < 4; round += 1) {
    const toolCalls = extractToolCalls(response);
    if (toolCalls.length === 0) {
      break;
    }

    workingInput = [...workingInput, ...(response.output ?? [])];
    const toolOutputs: Array<Record<string, unknown>> = [];

    for (const toolCall of toolCalls) {
      const args = parseJson(toolCall.arguments);
      let output: Record<string, unknown>;

      if (toolCall.name === "get_customer_account_overview") {
        const outstandingInvoices = payload.invoices.filter((invoice) => Number(invoice.balance_due ?? 0) > 0);
        output = {
          organization_name: payload.organization?.name ?? "QuikFinance",
          customer_name: payload.customer?.display_name ?? portal.display_name ?? "Customer",
          currency: payload.organization?.base_currency ?? "INR",
          preferred_language: payload.organization?.preferred_language ?? "en",
          open_invoice_count: outstandingInvoices.length,
          outstanding_total: outstandingInvoices.reduce((sum, invoice) => sum + Number(invoice.balance_due ?? 0), 0),
          statement_url: statementUrl,
          invoices: outstandingInvoices.slice(0, 10).map((invoice) => ({
            invoice_number: invoice.invoice_number,
            issue_date: invoice.issue_date,
            due_date: invoice.due_date,
            total: invoice.total,
            balance_due: invoice.balance_due,
            status: invoice.status,
            payment_url: invoice.payment_link?.short_url ?? null,
            pdf_url: `${getServerEnv().appUrl}/api/public/invoices/${invoice.id}/pdf?token=${portal.access_token}`
          }))
        };
      } else if (toolCall.name === "get_invoice_details") {
        const requestedInvoiceNumber = asString(args.invoice_number).trim().toLowerCase();
        const targetInvoice =
          payload.invoices.find((invoice) => invoice.invoice_number.toLowerCase() === requestedInvoiceNumber) ??
          payload.invoices.find((invoice) => Number(invoice.balance_due ?? 0) > 0) ??
          payload.invoices[0];

        output = targetInvoice
          ? {
              found: true,
              invoice_number: targetInvoice.invoice_number,
              issue_date: targetInvoice.issue_date,
              due_date: targetInvoice.due_date,
              total: targetInvoice.total,
              balance_due: targetInvoice.balance_due,
              status: targetInvoice.status,
              payment_url: targetInvoice.payment_link?.short_url ?? null,
              payment_status: targetInvoice.payment_link?.status ?? null,
              pdf_url: `${getServerEnv().appUrl}/api/public/invoices/${targetInvoice.id}/pdf?token=${portal.access_token}`
            }
          : {
              found: false,
              invoice_number: args.invoice_number ?? null
            };
      } else if (toolCall.name === "create_support_ticket") {
        if (!createdTicket) {
          createdTicket = await createSupportTicket({
            portal,
            conversationId,
            subject: asString(args.subject, "Customer support request"),
            summary: asString(args.summary, latestCustomerMessage),
            priority: (asString(args.priority, "normal") as "low" | "normal" | "high" | "urgent")
          });
        }

        output = {
          ticket_created: true,
          ticket_number: createdTicket.ticket_number,
          status: createdTicket.status
        };
      } else {
        output = { error: `Unknown tool: ${toolCall.name}` };
      }

      toolOutputs.push({
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(output)
      });
    }

    workingInput = [...workingInput, ...toolOutputs];
    response = await createOpenAiResponse(workingInput);
  }

  const assistantText =
    extractResponseText(response) ||
    (createdTicket
      ? `I have created support ticket ${createdTicket.ticket_number}. Our team will follow up with you soon.`
      : "I could not fully resolve that here yet, but I can help escalate it to support.");

  return {
    assistantText,
    ticket: createdTicket,
    responseId: response.id ?? null
  };
}

export async function generateFallbackSupportReply({
  portal,
  conversationId,
  latestCustomerMessage
}: {
  portal: PortalLink;
  conversationId: string;
  latestCustomerMessage: string;
}) {
  const payload = await getCustomerPortalPayload(portal.access_token);
  if (!payload) {
    throw new Error("Customer portal context could not be loaded.");
  }

  const normalized = latestCustomerMessage.toLowerCase();
  const statementUrl = `${getServerEnv().appUrl}/api/public/customer/${portal.access_token}/statement`;
  const invoiceMatch = latestCustomerMessage.match(/[A-Z]{2,}-\d+/i);
  const matchingInvoice =
    (invoiceMatch
      ? payload.invoices.find((invoice) => invoice.invoice_number.toLowerCase() === invoiceMatch[0].toLowerCase())
      : null) ??
    payload.invoices.find((invoice) => Number(invoice.balance_due ?? 0) > 0) ??
    payload.invoices[0];
  const wantsHumanSupport =
    normalized.includes("human") ||
    normalized.includes("agent") ||
    normalized.includes("call me") ||
    normalized.includes("support") ||
    normalized.includes("representative") ||
    normalized.includes("person");
  const wantsCapabilities =
    normalized.includes("what can you do") ||
    normalized.includes("what can you help") ||
    normalized.includes("how can you help") ||
    normalized === "help" ||
    normalized === "help?" ||
    normalized === "hi" ||
    normalized === "hello" ||
    normalized === "hey";
  const wantsLatestInvoice =
    normalized.includes("latest invoice") ||
    normalized.includes("last invoice") ||
    normalized.includes("recent invoice");

  if (wantsHumanSupport) {
    const ticket = await createSupportTicket({
      portal,
      conversationId,
      subject: "Customer requested human support",
      summary: latestCustomerMessage,
      priority: "high"
    });

    return {
      assistantText: `I created support ticket ${ticket.ticket_number}. A team member will follow up with you soon.`,
      ticket,
      responseId: null
    };
  }

  if (normalized.includes("statement")) {
    return {
      assistantText: `You can download your current statement here: ${statementUrl}`,
      ticket: null,
      responseId: null
    };
  }

  if (matchingInvoice && (normalized.includes("pdf") || normalized.includes("download invoice") || normalized.includes("invoice copy"))) {
    return {
      assistantText: `You can open the PDF for ${matchingInvoice.invoice_number} here: ${getServerEnv().appUrl}/api/public/invoices/${matchingInvoice.id}/pdf?token=${portal.access_token}`,
      ticket: null,
      responseId: null
    };
  }

  if (matchingInvoice && wantsLatestInvoice) {
    return {
      assistantText: `Your latest invoice is ${matchingInvoice.invoice_number}. Status: ${matchingInvoice.status}. Due date: ${matchingInvoice.due_date}. Balance due: ${matchingInvoice.balance_due}.`,
      ticket: null,
      responseId: null
    };
  }

  if (matchingInvoice && (normalized.includes("pay") || normalized.includes("payment"))) {
    if (matchingInvoice.payment_link?.short_url) {
      return {
        assistantText: `You can pay ${matchingInvoice.invoice_number} here: ${matchingInvoice.payment_link.short_url}`,
        ticket: null,
        responseId: null
      };
    }

    const ticket = await createSupportTicket({
      portal,
      conversationId,
      subject: `Payment assistance for ${matchingInvoice.invoice_number}`,
      summary: latestCustomerMessage,
      priority: "normal"
    });

    return {
      assistantText: `I could not find an active payment link for ${matchingInvoice.invoice_number}, so I created support ticket ${ticket.ticket_number}. Our team will help you shortly.`,
      ticket,
      responseId: null
    };
  }

  if (matchingInvoice && (normalized.includes("invoice") || normalized.includes("due") || normalized.includes("overdue") || normalized.includes("status"))) {
    const paymentLine = matchingInvoice.payment_link?.short_url ? ` Payment link: ${matchingInvoice.payment_link.short_url}` : "";
    return {
      assistantText: `${matchingInvoice.invoice_number} is currently ${matchingInvoice.status}. Due date: ${matchingInvoice.due_date}. Balance due: ${matchingInvoice.balance_due}.${paymentLine}`,
      ticket: null,
      responseId: null
    };
  }

  const openInvoices = payload.invoices.filter((invoice) => Number(invoice.balance_due ?? 0) > 0);
  if (normalized.includes("outstanding") || normalized.includes("unpaid")) {
    if (openInvoices.length === 0) {
      return {
        assistantText: "Good news — there are no unpaid invoices on this account right now.",
        ticket: null,
        responseId: null
      };
    }

    const summary = openInvoices
      .slice(0, 3)
      .map((invoice) => `${invoice.invoice_number} (due ${invoice.due_date}, balance ${invoice.balance_due})`)
      .join("; ");
    return {
      assistantText: `You currently have ${openInvoices.length} unpaid invoice(s): ${summary}. You can also download the full statement here: ${statementUrl}`,
      ticket: null,
      responseId: null
    };
  }

  if (wantsCapabilities) {
    return {
      assistantText:
        "I can help with invoice status, due dates, unpaid balances, payment links, invoice PDF downloads, statement downloads, and support escalation if you need a human.",
      ticket: null,
      responseId: null
    };
  }

  const ticket = await createSupportTicket({
    portal,
    conversationId,
    subject: "Customer support request",
    summary: latestCustomerMessage,
    priority: "normal"
  });

  return {
    assistantText: `I could not fully resolve that automatically, so I created support ticket ${ticket.ticket_number}. Our team will review it and follow up with you.`,
    ticket,
    responseId: null
  };
}
