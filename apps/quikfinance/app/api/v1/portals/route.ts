import { z } from "zod";
import { requireApiContext } from "@/lib/api/auth";
import { fail, ok } from "@/lib/api/responses";
import { createPortalToken, createPortalUrl } from "@/lib/portals";

const portalCreateSchema = z.object({
  portal_type: z.enum(["customer", "ca"]),
  contact_id: z.string().uuid().optional().nullable(),
  email: z.string().email().optional().nullable(),
  display_name: z.string().trim().min(2).max(160).optional().nullable(),
  expires_in_days: z.coerce.number().int().min(1).max(365).default(30)
});

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  const { data, error } = await auth.context.db
    .from("portal_links")
    .select("id, portal_type, contact_id, display_name, email, expires_at, is_active, access_token")
    .eq("org_id", auth.context.orgId)
    .order("created_at", { ascending: false });

  if (error) {
    return fail(400, { code: "PORTALS_LIST_FAILED", message: error.message });
  }

  return ok(
    (data ?? []).map((row) => ({
      ...row,
      access_url: createPortalUrl(row.portal_type as "customer" | "ca", String(row.access_token))
    }))
  );
}

export async function POST(request: Request) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  const parsed = portalCreateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return fail(422, { code: "VALIDATION_FAILED", message: "The portal request is invalid.", details: parsed.error.flatten() });
  }

  let displayName = parsed.data.display_name ?? null;
  let email = parsed.data.email ?? null;

  if (parsed.data.portal_type === "customer") {
    if (!parsed.data.contact_id) {
      return fail(422, { code: "CONTACT_REQUIRED", message: "Choose a customer before creating a customer portal." });
    }

    const { data: customer, error: customerError } = await auth.context.db
      .from("contacts")
      .select("display_name, email")
      .eq("org_id", auth.context.orgId)
      .eq("id", parsed.data.contact_id)
      .single();

    if (customerError || !customer) {
      return fail(404, { code: "CUSTOMER_NOT_FOUND", message: "Customer not found." });
    }

    displayName = displayName ?? customer.display_name;
    email = email ?? customer.email;
  }

  const token = createPortalToken();
  const expiresAt = new Date(Date.now() + parsed.data.expires_in_days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await auth.context.db
    .from("portal_links")
    .insert({
      org_id: auth.context.orgId,
      portal_type: parsed.data.portal_type,
      contact_id: parsed.data.portal_type === "customer" ? parsed.data.contact_id ?? null : null,
      display_name: displayName,
      email,
      access_token: token,
      permissions: parsed.data.portal_type === "customer" ? ["statement", "pay"] : ["reports", "export", "comment"],
      expires_at: expiresAt,
      is_active: true,
      created_by: auth.context.userId
    })
    .select("id, portal_type, contact_id, display_name, email, expires_at, is_active, access_token")
    .single();

  if (error) {
    return fail(400, { code: "PORTAL_CREATE_FAILED", message: error.message });
  }

  return ok(
    {
      ...data,
      access_url: createPortalUrl(data.portal_type as "customer" | "ca", String(data.access_token))
    },
    undefined,
    { status: 201 }
  );
}
