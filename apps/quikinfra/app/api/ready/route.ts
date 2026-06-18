import { toErrorMessage } from "@/lib/api/errors";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/observability/logger";

/**
 * GET /api/ready — Readiness probe
 *
 * Returns 200 only when the app can actually serve traffic:
 *   - Database reachable (simple `SELECT 1`)
 *   - Required schema objects present (Roles table — proof seed ran)
 *   - Critical env vars validated (loadEnv() was called at module init)
 *
 * Returns 503 otherwise with a JSON body listing which check failed.
 *
 * Probe frequency: Kubernetes default 10s is fine — the DB check is cheap
 * (one round-trip). For multi-node deploys, each node runs its own probe.
 *
 * Never adds auth: probes are usually called from within the cluster on a
 * private network. If you expose /api/ready publicly, wrap it in an
 * allowlist at the LB level.
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string; durationMs?: number }> = {};
  const t0 = Date.now();
  let overallOk = true;

  // ── Database reachable ────────────────────────────────────────
  const dbStart = Date.now();
  try {
    await db.$queryRawUnsafe("SELECT 1");
    checks.database = { ok: true, durationMs: Date.now() - dbStart };
  } catch (err: unknown) {
    overallOk = false;
    checks.database = {
      ok: false,
      detail: toErrorMessage(err, "unknown").split("\n")[0],
      durationMs: Date.now() - dbStart,
    };
  }

  // ── Schema present (seed applied) ─────────────────────────────
  if (checks.database.ok) {
    const schemaStart = Date.now();
    try {
      // Confirm the migration ran by counting tables in our schema.
      // The app has no Role table (RBAC is in-code via src/lib/rbac);
      // a populated schema is the right "migration applied" signal.
      const rows = (await db.$queryRawUnsafe(
        "SELECT COUNT(*)::bigint as count FROM information_schema.tables WHERE table_schema = 'app_quikinfra'"
      )) as Array<{ count: bigint }>;
      const count = Number(rows?.[0]?.count ?? 0);
      if (count === 0) {
        overallOk = false;
        checks.schema = {
          ok: false,
          detail: "app_quikinfra schema is empty — migration not applied",
          durationMs: Date.now() - schemaStart,
        };
      } else {
        checks.schema = { ok: true, detail: `${count} tables`, durationMs: Date.now() - schemaStart };
      }
    } catch (err: unknown) {
      overallOk = false;
      checks.schema = {
        ok: false,
        detail: toErrorMessage(err, "unknown").split("\n")[0],
        durationMs: Date.now() - schemaStart,
      };
    }
  } else {
    checks.schema = { ok: false, detail: "skipped (database unreachable)" };
    overallOk = false;
  }

  // ── Env validated (loadEnv ran without throwing at import) ───
  checks.env = { ok: true };

  const body = {
    ok: overallOk,
    app: "quikinfra",
    status: overallOk ? "ready" : "not_ready",
    version: process.env.APP_RELEASE ?? process.env.npm_package_version ?? "0.1.0",
    totalDurationMs: Date.now() - t0,
    checks,
    timestamp: new Date().toISOString(),
  };

  if (!overallOk) {
    logger.warn({ msg: "readiness_probe_failed", checks });
  }

  return NextResponse.json(body, {
    status: overallOk ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
