import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { assertAccountAccess } from "@/lib/auth/account-acl";
import { updateContactSchema } from "@/lib/validators/contact";
import { normalisePhoneE164 } from "@/lib/services/contacts/phone";
import { findDuplicateContactByEmail } from "@/lib/services/contacts/duplicate-check";
import { attachAccountNames } from "@/lib/services/contacts/account-name-batch";
import { resolveOwnerForTenant } from "@/lib/services/contacts/owner-resolve";

export const runtime = "nodejs";

function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ success: true, data }, init);
}
function fail(
  status: number,
  error: string,
  fieldErrors?: Record<string, string>,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json(
    {
      success: false,
      error,
      ...(fieldErrors ? { fieldErrors, errors: fieldErrors } : {}),
      ...(extra ?? {}),
    },
    { status },
  );
}

async function loadOwn(tenantId: string, id: string) {
  return prisma.crmContact.findFirst({ where: { id, tenantId } });
}

async function loadActive(tenantId: string, id: string) {
  return prisma.crmContact.findFirst({ where: { id, tenantId, deletedAt: null } });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "contacts", "view");

    const c = await loadOwn(user.tenantId, id);
    if (!c) return fail(404, "Contact not found");
    const [withName] = await attachAccountNames(user.tenantId, [c]);
    return ok(withName);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to load contact";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/contacts/:id GET]", error);
    return fail(status, message);
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "contacts", "edit");

    const existing = await loadActive(user.tenantId, id);
    if (!existing) return fail(404, "Contact not found");

    const body = await req.json().catch(() => null);
    const parsed = updateContactSchema.safeParse(body);
    if (!parsed.success) {
      return fail(
        400,
        "Validation failed",
        parsed.error.flatten().fieldErrors as Record<string, string>,
      );
    }
    const data = parsed.data;

    if (data.accountId !== undefined && data.accountId !== existing.accountId) {
      if (data.accountId) await assertAccountAccess(user, data.accountId);
    }

    if (data.email !== undefined && data.email && data.email !== existing.email) {
      const dup = await findDuplicateContactByEmail(user.tenantId, data.email, id);
      if (dup) {
        return fail(
          409,
          "A contact with this email already exists.",
          { email: "A contact with this email already exists." },
          { existingId: dup.id },
        );
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.firstName !== undefined) updateData.firstName = data.firstName;
    if (data.lastName !== undefined) updateData.lastName = data.lastName;
    if (data.email !== undefined) updateData.email = data.email ?? null;
    if (data.phone !== undefined) {
      updateData.phone = data.phone ? normalisePhoneE164(data.phone) : null;
    }
    if (data.title !== undefined) updateData.title = data.title ?? null;
    if (data.accountId !== undefined) updateData.accountId = data.accountId ?? null;
    if (data.leadId !== undefined) updateData.leadId = data.leadId ?? null;
    if (data.city !== undefined) updateData.city = data.city ?? null;
    if (data.contactStage !== undefined) updateData.contactStage = data.contactStage ?? null;
    if (data.source !== undefined) updateData.source = data.source ?? null;

    if (data.ownerId !== undefined) {
      if (!data.ownerId) {
        updateData.ownerId = null;
        updateData.ownerName = null;
      } else if (data.ownerId !== existing.ownerId) {
        const owner = await resolveOwnerForTenant(user.tenantId, data.ownerId);
        updateData.ownerId = owner.ownerId;
        updateData.ownerName = owner.ownerName;
      }
    }

    const updated = await prisma.crmContact.update({
      where: { id },
      data: updateData,
    });
    const [withName] = await attachAccountNames(user.tenantId, [updated]);
    return ok(withName);
  } catch (error: unknown) {
    const e = error as { statusCode?: number; fieldErrors?: Record<string, string> };
    const message = error instanceof Error ? error.message : "Failed to update contact";
    const status = e?.statusCode ?? 500;
    if (status >= 500) console.error("[api/contacts/:id PATCH]", error);
    return fail(status, message, e?.fieldErrors);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "contacts", "delete");

    const existing = await loadActive(user.tenantId, id);
    if (!existing) return fail(404, "Contact not found");

    await prisma.crmContact.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    return ok({ ok: true });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to delete contact";
    const status = (error as { statusCode?: number })?.statusCode ?? 500;
    if (status >= 500) console.error("[api/contacts/:id DELETE]", error);
    return fail(status, message);
  }
}
