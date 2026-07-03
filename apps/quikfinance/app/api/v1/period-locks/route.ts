import { requireApiContext } from "@/lib/api/auth";
import { errorMessage, fail, ok } from "@/lib/api/responses";
import { periodLockSchema } from "@/lib/validations/automation.schema";

export const dynamic = "force-dynamic";

function canManageLocks(role: string) {
  return ["owner", "admin", "accountant"].includes(role);
}

export async function GET() {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  const { data, error } = await auth.context.db
    .from("period_locks")
    .select("id, start_date, end_date, lock_scope, reason, is_active")
    .eq("org_id", auth.context.orgId)
    .order("start_date", { ascending: false });

  if (error) {
    return fail(500, { code: "PERIOD_LOCK_LIST_FAILED", message: error.message });
  }

  return ok(
    (data ?? []).map((row) => ({
      ...row,
      status: row.is_active ? "active" : "inactive"
    }))
  );
}

export async function POST(request: Request) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  if (!canManageLocks(auth.context.role)) {
    return fail(403, { code: "INSUFFICIENT_ROLE", message: "Only admins and accountants can lock periods." });
  }

  try {
    const json = (await request.json()) as Record<string, unknown>;
    const parsed = periodLockSchema.safeParse(json);
    if (!parsed.success) {
      return fail(422, {
        code: "VALIDATION_FAILED",
        message: "The period lock is invalid.",
        details: parsed.error.flatten()
      });
    }

    if (parsed.data.end_date < parsed.data.start_date) {
      return fail(422, { code: "INVALID_RANGE", message: "The lock end date must be on or after the start date." });
    }

    // One active lock per scope (Zoho-style): re-locking a module replaces its
    // prior lock. Deactivate any existing active lock for this scope first.
    if (parsed.data.is_active) {
      await auth.context.db
        .from("period_locks")
        .update({ is_active: false })
        .eq("org_id", auth.context.orgId)
        .eq("lock_scope", parsed.data.lock_scope)
        .eq("is_active", true);
    }

    const { data, error } = await auth.context.db
      .from("period_locks")
      .insert({
        org_id: auth.context.orgId,
        start_date: parsed.data.start_date,
        end_date: parsed.data.end_date,
        lock_scope: parsed.data.lock_scope,
        reason: parsed.data.reason ?? null,
        is_active: parsed.data.is_active,
        created_by: auth.context.userId
      })
      .select("id, start_date, end_date, lock_scope, reason, is_active")
      .single();

    if (error) {
      return fail(400, { code: "PERIOD_LOCK_CREATE_FAILED", message: error.message });
    }

    await auth.context.db.from("audit_logs").insert({
      org_id: auth.context.orgId,
      user_id: auth.context.userId,
      entity_type: "period_lock",
      entity_id: data.id,
      action: "create",
      new_values: data
    });

    return ok({ ...data, status: data.is_active ? "active" : "inactive" }, undefined, { status: 201 });
  } catch (error) {
    return fail(500, { code: "PERIOD_LOCK_FAILED", message: errorMessage(error) });
  }
}
