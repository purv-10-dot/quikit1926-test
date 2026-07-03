import { fail } from "@/lib/api/responses";
import type { ApiContext } from "@/lib/api/auth";

const scopeToLabels: Record<string, string[]> = {
  all: ["all"],
  sales: ["all", "sales"],
  purchases: ["all", "purchases"],
  banking: ["all", "banking"],
  journals: ["all", "journals"]
};

/** Thrown by the engine-level guards when a posting/reversal hits a locked period. */
export class PeriodLockedError extends Error {
  readonly code = "PERIOD_LOCKED";
  constructor(message: string) {
    super(message);
    this.name = "PeriodLockedError";
  }
}

type RawClient = { $queryRawUnsafe: <T = unknown>(query: string, ...values: unknown[]) => Promise<T> };

/** Map a journal source_type to the period-lock scope that should govern it. */
export function scopeForSource(sourceType: string): keyof typeof scopeToLabels {
  switch (sourceType) {
    case "invoice":
    case "credit_note":
      return "sales";
    case "bill":
    case "vendor_credit":
    case "expense":
    case "grn":
      return "purchases";
    case "payment":
    case "bank_transaction":
      return "banking";
    case "manual":
    case "journal":
    case "fx_revaluation":
      return "journals";
    default:
      return "all"; // opening_balance and anything unmapped: only an org-wide lock blocks it.
  }
}

/**
 * Engine-level guard (runs inside a DB transaction): block posting a journal
 * dated within an active lock for the source's scope. This is the single
 * chokepoint that protects EVERY posting path, so no individual route can
 * forget the check.
 */
export async function assertPostingDateUnlocked(tx: RawClient, orgId: string, date: string, sourceType: string): Promise<void> {
  if (!date) return;
  const labels = scopeToLabels[scopeForSource(sourceType)] ?? ["all"];
  const rows = await tx.$queryRawUnsafe<Array<{ s: string; e: string }>>(
    `SELECT to_char(start_date,'YYYY-MM-DD') s, to_char(end_date,'YYYY-MM-DD') e
     FROM period_locks
     WHERE org_id = $1::uuid AND is_active = true AND start_date <= $2::date AND end_date >= $2::date
       AND lock_scope = ANY($3::text[]) LIMIT 1`,
    orgId, date, labels
  );
  if (rows[0]) {
    throw new PeriodLockedError(`The accounting period ${rows[0].s} to ${rows[0].e} is locked. Unlock it before posting an entry dated ${date}.`);
  }
}

/**
 * Engine-level guard: block voiding/reposting/deleting a source document when
 * any of its existing posted journal entries falls inside an active lock.
 */
export async function assertSourceUnlocked(tx: RawClient, orgId: string, sourceType: string, sourceId: string): Promise<void> {
  const labels = scopeToLabels[scopeForSource(sourceType)] ?? ["all"];
  const rows = await tx.$queryRawUnsafe<Array<{ d: string; s: string; e: string }>>(
    `SELECT to_char(je.entry_date,'YYYY-MM-DD') d, to_char(pl.start_date,'YYYY-MM-DD') s, to_char(pl.end_date,'YYYY-MM-DD') e
     FROM journal_entries je
     JOIN period_locks pl ON pl.org_id = je.org_id AND pl.is_active = true
       AND pl.start_date <= je.entry_date AND pl.end_date >= je.entry_date
       AND pl.lock_scope = ANY($3::text[])
     WHERE je.org_id = $1::uuid AND je.source_type = $2 AND je.source_id = $4::uuid LIMIT 1`,
    orgId, sourceType, labels, sourceId
  );
  if (rows[0]) {
    throw new PeriodLockedError(`Cannot modify a journal entry dated ${rows[0].d}: the period ${rows[0].s} to ${rows[0].e} is locked.`);
  }
}

export async function findActivePeriodLock(context: ApiContext, date: string, scope: keyof typeof scopeToLabels) {
  const scopes = scopeToLabels[scope];
  const { data, error } = await context.db
    .from("period_locks")
    .select("id, start_date, end_date, lock_scope, reason")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .lte("start_date", date)
    .gte("end_date", date);

  if (error) {
    throw new Error(error.message);
  }

  const row = (data ?? []).find((entry) => scopes.includes(String(entry.lock_scope ?? "")));
  return row ?? null;
}

export async function assertPeriodUnlocked(context: ApiContext, date: string | null | undefined, scope: keyof typeof scopeToLabels) {
  if (!date) {
    return null;
  }

  const lock = await findActivePeriodLock(context, date, scope);
  if (!lock) {
    return null;
  }

  return fail(423, {
    code: "PERIOD_LOCKED",
    message: `The selected period is locked from ${lock.start_date} to ${lock.end_date}.`,
    details: {
      lock_id: lock.id,
      lock_scope: lock.lock_scope,
      reason: lock.reason
    }
  });
}
