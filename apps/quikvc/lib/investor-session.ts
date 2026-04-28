/**
 * Investor session resolution.
 *
 * Maps the current user → the VCInvestor row they own. In production this
 * matches via VCInvestor.userId. In dev (no real session), falls back to
 * the first investor in the seeded demo tenant so portal pages can render.
 */
import { getDevAwareSession } from "@/lib/dev-session";
import { db } from "@/lib/db";

export interface InvestorContext {
  tenantId: string;
  investorId: string;
  investorName: string;
}

export async function getCurrentInvestor(): Promise<InvestorContext | null> {
  const session = await getDevAwareSession();
  const tenantId = session?.user?.tenantId;
  const userId = session?.user?.id;
  if (!tenantId) return null;

  // Real wiring: match by userId
  if (userId) {
    const inv = await db.vCInvestor.findFirst({
      where: { tenantId, userId },
      select: { id: true, name: true },
    });
    if (inv) {
      return { tenantId, investorId: inv.id, investorName: inv.name };
    }
  }

  // Dev fallback: first investor in tenant (alphabetical for stability).
  // Strict opt-in via QUIKVC_DEV_BYPASS — never falls back in production
  // or in any environment without the explicit flag.
  const bypassFlag = (process.env.QUIKVC_DEV_BYPASS ?? "").toLowerCase().trim();
  const bypass = bypassFlag === "1" || bypassFlag === "true" || bypassFlag === "yes";
  if (bypass) {
    const inv = await db.vCInvestor.findFirst({
      where: { tenantId },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
    if (inv) {
      return { tenantId, investorId: inv.id, investorName: inv.name };
    }
  }

  return null;
}
