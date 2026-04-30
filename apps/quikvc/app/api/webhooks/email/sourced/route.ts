/**
 * Inbound-email webhook for sourcing.
 *
 *   POST /api/webhooks/email/sourced
 *
 * Auth: shared secret in `x-webhook-secret` header. Set
 * INBOUND_EMAIL_WEBHOOK_SECRET to a long random string in env.
 *
 * Tenant routing: the inbound address must follow the pattern
 *   sourcing+<tenantSlug>@<your-domain>      (plus-addressing)
 *   <tenantSlug>.sourcing@<your-domain>      (sub-addressing)
 *
 * The `to:` field on the webhook body is parsed to extract the slug, and
 * the tenant is looked up by slug. Unknown slugs → 404 (the email is
 * silently dropped from the platform's perspective).
 *
 * Body shape (Resend Inbound):
 *   { from, to, subject, text, html, ... }
 *
 * Side effects:
 *   - Creates a VCSourcedOpportunity row with source="email"
 *   - Returns 201 with the new opportunity id
 *   - Never throws — bad emails respond 400 with an explanation
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { parseInboundEmail } from "@/lib/sourcing/parse-email";

const WEBHOOK_SECRET = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;

const bodySchema = z.object({
  from: z.string().min(3),
  to: z.union([z.string(), z.array(z.string())]),
  subject: z.string().default(""),
  text: z.string().default(""),
  html: z.string().optional(),
});

/**
 * Pull the tenant slug out of an inbound address like:
 *   sourcing+acme@in.quikvc.test     → "acme"
 *   acme.sourcing@in.quikvc.test     → "acme"
 *   sourcing@in.quikvc.test          → null (no slug)
 */
function extractTenantSlug(address: string): string | null {
  const m1 = address.match(/^sourcing\+([a-z0-9-]+)@/i);
  if (m1) return m1[1].toLowerCase();
  const m2 = address.match(/^([a-z0-9-]+)\.sourcing@/i);
  if (m2) return m2[1].toLowerCase();
  return null;
}

export async function POST(req: NextRequest) {
  // 1. Auth — shared secret. Rejects loudly so misconfigured forwarders fail fast.
  if (!WEBHOOK_SECRET) {
    return NextResponse.json(
      { success: false, error: "Webhook not configured (INBOUND_EMAIL_WEBHOOK_SECRET unset)" },
      { status: 503 },
    );
  }
  const provided = req.headers.get("x-webhook-secret");
  if (provided !== WEBHOOK_SECRET) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse body
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    );
  }

  // 3. Resolve tenant from To: address. Accept both string + array — pick
  // the first address that yields a known tenant.
  const recipients = Array.isArray(parsed.data.to) ? parsed.data.to : [parsed.data.to];
  let tenant: { id: string; slug: string } | null = null;
  for (const addr of recipients) {
    const slug = extractTenantSlug(addr);
    if (!slug) continue;
    const t = await db.tenant.findUnique({
      where: { slug },
      select: { id: true, slug: true },
    });
    if (t) {
      tenant = t;
      break;
    }
  }
  if (!tenant) {
    return NextResponse.json(
      { success: false, error: "No matching tenant for inbound address" },
      { status: 404 },
    );
  }

  // 4. Parse email content
  const fromAddr = Array.isArray(parsed.data.to) ? parsed.data.to[0] : parsed.data.to;
  const opp = parseInboundEmail({
    from: parsed.data.from,
    to: fromAddr,
    subject: parsed.data.subject,
    text: parsed.data.text,
    html: parsed.data.html,
  });

  // 5. Persist
  const created = await db.vCSourcedOpportunity.create({
    data: {
      tenantId: tenant.id,
      source: "email",
      status: "new",
      startupName: opp.startupName,
      contactEmail: opp.contactEmail,
      contactName: opp.contactName,
      website: opp.website,
      pitch: opp.pitch,
      fundingAsk: opp.fundingAskLakhs
        ? BigInt(opp.fundingAskLakhs) * BigInt(10_000_000)
        : null,
      notes: `Auto-created from inbound email from ${parsed.data.from}.`,
    },
    select: { id: true, startupName: true },
  });

  return NextResponse.json(
    {
      success: true,
      data: { id: created.id, tenantSlug: tenant.slug, startupName: created.startupName },
    },
    { status: 201 },
  );
}
