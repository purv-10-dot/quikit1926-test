// apps/quikcrm/lib/services/telephony/call-service.ts
/**
 * Orchestrates click-to-call: place provider call → fire-and-forget audit
 * (success or failure) → pre-create the CrmCallLog stub the webhook will
 * later populate with duration/recording/disposition.
 *
 * Audit insertion is intentionally fire-and-forget (`.catch(console.error)`)
 * so an audit-write failure never breaks an in-progress call. The new
 * structured columns (success, httpStatus, errorMessage, providerResponse,
 * kind) live alongside the legacy `responseStatus`/`message` fields, which
 * are kept populated for back-compat with existing dashboards.
 */

import { prisma } from "@/lib/db/prisma";
import { clickToCall } from "@/lib/services/telephony/india-voice";
import type { SessionUser } from "@/types/permission";

export async function placeCall(opts: {
  user: SessionUser;
  to: string;
  partyA?: string;
  leadId?: string;
}) {
  const auditBase = {
    tenantId: opts.user.tenantId,
    agentUserId: opts.user.userId,
    partyA: opts.partyA,
    partyB: opts.to,
    providerName: "indiavoice",
    kind: "single",
  };

  let result;
  try {
    result = await clickToCall(opts.to, opts.partyA);
  } catch (err) {
    const e = err as { message?: string; statusCode?: number; response?: unknown };
    // Failure audit — fire-and-forget so the original error reaches the user
    // unmodified even if the audit insert fails.
    void prisma.crmCtcCallAudit
      .create({
        data: {
          ...auditBase,
          success: false,
          httpStatus: e.statusCode ?? null,
          responseStatus: e.statusCode ?? null,
          errorMessage: e.message ?? null,
          message: e.message ?? null,
          providerResponse:
            e.response != null ? safeStringify(e.response) : null,
        },
      })
      .catch((auditErr) =>
        console.error("[call-service] audit (failure path) write failed:", auditErr),
      );
    throw err;
  }

  // Success audit — fire-and-forget.
  void prisma.crmCtcCallAudit
    .create({
      data: {
        ...auditBase,
        callSid: result.callSid,
        success: true,
        httpStatus: result.status,
        responseStatus: result.status,
        providerType: result.providerType,
        message: result.providerMessage,
        errorMessage: null,
        providerResponse: safeStringify({
          callSid: result.callSid,
          status: result.status,
          providerType: result.providerType,
          providerMessage: result.providerMessage,
        }),
      },
    })
    .catch((auditErr) =>
      console.error("[call-service] audit (success path) write failed:", auditErr),
    );

  // Pre-create CallLog stub for the webhook to populate later.
  if (result.callSid) {
    console.log(
      `[call-service] upserting CrmCallLog stub callSid=${result.callSid} tenantId=${opts.user.tenantId} leadId=${opts.leadId ?? null}`,
    );
    try {
      await prisma.crmCallLog.upsert({
        where: { tenantId_callSid: { tenantId: opts.user.tenantId, callSid: result.callSid } },
        create: {
          tenantId: opts.user.tenantId,
          callSid: result.callSid,
          // Mirror callSid into providerCallSid so the new poll/match path
          // (which prefers providerCallSid) finds the row.
          providerCallSid: result.callSid,
          leadId: opts.leadId ?? null,
          agentUserId: opts.user.userId,
          ownerName: opts.user.name || opts.user.email,
          sourceNumber: opts.partyA,
          destinationNumber: opts.to,
          direction: "outbound",
          status: "initiated",
        },
        update: {
          leadId: opts.leadId ?? undefined,
          agentUserId: opts.user.userId,
          ownerName: opts.user.name || opts.user.email,
          providerCallSid: result.callSid,
        },
      });
      console.log(`[call-service] CrmCallLog stub OK callSid=${result.callSid}`);
    } catch (stubErr) {
      // Non-fatal: the call is already placed. Log the error so we can diagnose.
      // The webhook orphan backfill in createCallLog() will recover the recording URL.
      console.error("[call-service] CrmCallLog stub FAILED — webhook will not auto-match:", stubErr);
    }
  }

  return result;
}

function safeStringify(v: unknown): string | null {
  try {
    return JSON.stringify(v);
  } catch {
    return null;
  }
}
