import { prisma } from "@/lib/prisma";

/**
 * Auto-lift blacklists whose duration has elapsed. Blacklisting stores a
 * `blacklistedUntil` date; once it passes the candidate should stop being
 * treated (and shown) as blacklisted. We clear it lazily on read so the badge
 * disappears on its own — mirroring the manual "lift blacklist" action.
 * Permanent blacklists have `blacklistedUntil = null` and are never cleared.
 */
export async function liftExpiredBlacklists(orgId: string): Promise<void> {
  await prisma.candidate.updateMany({
    where: {
      orgId,
      isBlacklisted: true,
      blacklistedUntil: { not: null, lt: new Date() },
    },
    data: {
      isBlacklisted: false,
      blacklistReason: null,
      blacklistedAt: null,
      blacklistedBy: null,
      blacklistedUntil: null,
      status: "New",
      doNotContact: false,
    },
  }).catch(() => { /* non-blocking: never break a read on a cleanup failure */ });
}
