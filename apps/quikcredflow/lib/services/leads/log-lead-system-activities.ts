/**
 * System-generated QcfActivity rows when a lead is created (HubSpot / Salesforce pattern).
 * Ensures timeline, recent activity, and intelligence feeds are never empty on new leads.
 */
import type { QcfLead } from "@quikit/database";
import { logActivity } from "@/lib/services/activities/log-activity";

export const LEAD_SYSTEM_ACTIVITY_CODE = "lead_system";
export const LEAD_SYSTEM_SOURCE = "quikcrm.lead-system";

export const LEAD_CREATION_CHANNELS = [
  "manual",
  "website",
  "csv_import",
  "facebook_ads",
  "whatsapp_campaign",
  "api_sync",
] as const;

export type LeadCreationChannel = (typeof LEAD_CREATION_CHANNELS)[number];

export type LeadCreationContext = {
  channel?: LeadCreationChannel;
  userId?: string;
  /** Import file name, API client id, etc. */
  metadata?: Record<string, string | null | undefined>;
};

const CHANNEL_HEADLINE: Record<LeadCreationChannel, string> = {
  manual: "Lead added manually",
  website: "Lead created from Website",
  csv_import: "Lead imported via CSV",
  facebook_ads: "Lead captured from Facebook Ads",
  whatsapp_campaign: "Lead created from WhatsApp campaign",
  api_sync: "Lead synced from API",
};

export function isLeadCreationChannel(v: string): v is LeadCreationChannel {
  return (LEAD_CREATION_CHANNELS as readonly string[]).includes(v);
}

export function inferLeadCreationChannel(input: {
  leadSource?: string | null;
  sourceSystem?: string | null;
  sourceType?: string | null;
}): LeadCreationChannel {
  const sys = (input.sourceSystem ?? "").trim().toLowerCase();
  const src = (input.leadSource ?? "").trim().toLowerCase();
  const type = (input.sourceType ?? "").trim().toLowerCase();

  if (type === "csv" || sys.includes("csv") || sys === "ui-upload") return "csv_import";
  if (
    sys.includes("facebook") ||
    sys.includes("meta") ||
    src.includes("facebook") ||
    src.includes("meta ads")
  ) {
    return "facebook_ads";
  }
  if (sys.includes("whatsapp") || src.includes("whatsapp")) return "whatsapp_campaign";
  if (
    sys.includes("api") ||
    sys.includes("webhook") ||
    sys.includes("integration") ||
    src === "api"
  ) {
    return "api_sync";
  }
  if (
    src === "web" ||
    src === "website" ||
    src.includes("website") ||
    sys.includes("website") ||
    sys.includes("web-form")
  ) {
    return "website";
  }
  return "manual";
}

function formatDetailBlock(lead: QcfLead, channel: LeadCreationChannel, ctx: LeadCreationContext): string {
  const lines: string[] = ["[System]", "", "Lead created", ""];
  if (lead.source?.trim()) lines.push(`Source: ${lead.source.trim()}`);
  if (lead.ownerName?.trim()) lines.push(`Owner: ${lead.ownerName.trim()}`);
  if (lead.stage?.trim()) lines.push(`Stage: ${lead.stage.trim()}`);
  if (lead.status?.trim()) lines.push(`Status: ${lead.status.trim()}`);
  lines.push("", `Channel: ${CHANNEL_HEADLINE[channel]}`);
  if (ctx.metadata) {
    for (const [k, v] of Object.entries(ctx.metadata)) {
      if (v?.trim()) lines.push(`${k}: ${v.trim()}`);
    }
  }
  return lines.join("\n");
}

type SystemEvent = {
  slug: string;
  type: string;
  subject: string;
  outcome?: string;
  detailNotes?: string;
};

function buildSystemEvents(
  lead: QcfLead,
  channel: LeadCreationChannel,
  ctx: LeadCreationContext,
): SystemEvent[] {
  const events: SystemEvent[] = [
    {
      slug: "created",
      type: "LeadCreated",
      subject: CHANNEL_HEADLINE[channel],
      outcome: lead.source?.trim() || undefined,
      detailNotes: formatDetailBlock(lead, channel, ctx),
    },
  ];

  if (lead.source?.trim()) {
    events.push({
      slug: "source",
      type: "LeadSystem",
      subject: "Source added",
      outcome: lead.source.trim(),
      detailNotes: `Lead source set to ${lead.source.trim()}.`,
    });
  }

  if (lead.ownerName?.trim() || lead.ownerId) {
    events.push({
      slug: "owner",
      type: "LeadSystem",
      subject: "Owner assigned",
      outcome: lead.ownerName?.trim() || "Assigned",
      detailNotes: lead.ownerName?.trim()
        ? `Owner assigned to ${lead.ownerName.trim()}.`
        : "Lead owner assigned.",
    });
  }

  if (lead.stage?.trim()) {
    events.push({
      slug: "stage",
      type: "LeadSystem",
      subject: "Stage initialized",
      outcome: lead.stage.trim(),
      detailNotes: `Pipeline stage set to ${lead.stage.trim()}.`,
    });
  }

  if (lead.status?.trim()) {
    events.push({
      slug: "status",
      type: "LeadSystem",
      subject: "Status initialized",
      outcome: lead.status.trim(),
      detailNotes: `Lead status set to ${lead.status.trim()}.`,
    });
  }

  return events;
}

/**
 * Idempotent per lead + event slug. Safe to call after every create path.
 */
export async function logLeadSystemActivitiesOnCreate(
  lead: QcfLead,
  ctx: LeadCreationContext = {},
): Promise<void> {
  const channel =
    ctx.channel ??
    inferLeadCreationChannel({
      leadSource: lead.source,
      sourceSystem: lead.sourceSystem,
    });

  const occurredAt = lead.createdAt ?? new Date();
  const events = buildSystemEvents(lead, channel, ctx);

  for (const ev of events) {
    await logActivity({
      orgId: lead.orgId,
      userId: ctx.userId,
      ownerId: ctx.userId ?? lead.ownerId ?? undefined,
      type: ev.type,
      activityCode: LEAD_SYSTEM_ACTIVITY_CODE,
      relatedKind: "Lead",
      relatedObjectId: lead.id,
      leadId: lead.id,
      subject: ev.subject,
      outcome: ev.outcome,
      detailNotes: ev.detailNotes,
      occurredAt,
      externalId: `lead-system:${lead.id}:${ev.slug}`,
      sourceSystem: LEAD_SYSTEM_SOURCE,
    });
  }
}
