import { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { ok, fail, errorMessage } from "@/lib/api/responses";
import { z } from "zod";

const ROLE_PERMISSIONS: Record<string, Record<string, string[]>> = {
  owner: {
    sales: ["create", "read", "update", "delete", "approve", "export"],
    purchases: ["create", "read", "update", "delete", "approve", "export"],
    banking: ["create", "read", "update", "delete", "approve", "export"],
    accounting: ["create", "read", "update", "delete", "approve", "export"],
    settings: ["create", "read", "update", "delete"],
    reports: ["read", "export"],
    inventory: ["create", "read", "update", "delete", "export"]
  },
  admin: {
    sales: ["create", "read", "update", "delete", "approve", "export"],
    purchases: ["create", "read", "update", "delete", "approve", "export"],
    banking: ["create", "read", "update", "delete", "approve", "export"],
    accounting: ["create", "read", "update", "delete", "approve", "export"],
    settings: ["read", "update"],
    reports: ["read", "export"],
    inventory: ["create", "read", "update", "delete", "export"]
  },
  accountant: {
    sales: ["create", "read", "update", "approve", "export"],
    purchases: ["create", "read", "update", "approve", "export"],
    banking: ["create", "read", "update", "approve", "export"],
    accounting: ["create", "read", "update", "approve", "export"],
    settings: ["read"],
    reports: ["read", "export"],
    inventory: ["read", "export"]
  },
  member: {
    sales: ["create", "read", "update", "export"],
    purchases: ["create", "read", "update"],
    banking: ["read"],
    accounting: ["read"],
    settings: ["read"],
    reports: ["read"],
    inventory: ["create", "read", "update"]
  },
  viewer: {
    sales: ["read"],
    purchases: ["read"],
    banking: ["read"],
    accounting: ["read"],
    settings: ["read"],
    reports: ["read"],
    inventory: ["read"]
  }
};

const UpdateRoleSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["owner", "admin", "accountant", "member", "viewer"])
});

export async function GET(_req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId } = auth.context;

  try {
    const { data: members, error } = await db
      .from("profiles")
      .select("id, full_name, avatar_url, role, is_active, created_at, last_active_at")
      .eq("org_id", orgId)
      .order("role")
      .order("full_name");

    if (error) throw error;

    return ok({
      members: members ?? [],
      role_matrix: ROLE_PERMISSIONS
    });
  } catch (e) {
    return fail(500, { code: "FETCH_ERROR", message: errorMessage(e) });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) return fail(auth.status, { code: auth.code, message: auth.message });
  const { db, orgId, userId, role } = auth.context;

  if (!["owner", "admin"].includes(role)) {
    return fail(403, { code: "FORBIDDEN", message: "Only owners and admins can change roles." });
  }

  try {
    const body = await req.json();
    const parsed = UpdateRoleSchema.safeParse(body);
    if (!parsed.success) return fail(422, { code: "VALIDATION_ERROR", message: parsed.error.message });

    if (parsed.data.user_id === userId && parsed.data.role !== "owner") {
      return fail(409, { code: "SELF_DEMOTION", message: "You cannot change your own role." });
    }

    const { data, error } = await db
      .from("profiles")
      .update({ role: parsed.data.role })
      .eq("id", parsed.data.user_id)
      .eq("org_id", orgId)
      .select()
      .single();

    if (error) throw error;

    await db.from("audit_logs").insert({
      org_id: orgId,
      user_id: userId,
      action: "update",
      entity_type: "profile_role",
      entity_id: parsed.data.user_id,
      new_values: { role: parsed.data.role }
    });

    return ok(data);
  } catch (e) {
    return fail(500, { code: "UPDATE_ERROR", message: errorMessage(e) });
  }
}
