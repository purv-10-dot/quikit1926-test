/**
 * One-shot backfill — fill `SocialAccount.igBusinessAccountId` for every
 * existing Instagram row that was connected before the column existed.
 *
 * The IG publisher (lib/meta/instagram-publisher.ts) requires the
 * Instagram Business Account ID for every Graph API call. Rows
 * connected before this column shipped stored only the Facebook Page
 * ID — Graph API responds to those with the cryptic "Object with ID
 * '...' does not exist" error.
 *
 * For each row this script:
 *   1. Calls `GET /{pageId}?fields=instagram_business_account` using
 *      the stored Page access token.
 *   2. If the response carries `instagram_business_account.id`, writes
 *      that id into `igBusinessAccountId`.
 *   3. Otherwise logs the per-row reason
 *      (token_expired / no_ig_link / network_error / missing_page_id).
 *
 * Usage:
 *   cd apps/quiksocial && npx tsx --env-file=.env.local scripts/backfill-ig-business-account.ts
 *
 * Idempotent — only touches rows where igBusinessAccountId IS NULL.
 * Safe to re-run; rows that resolved on a previous run are skipped.
 *
 * Note: `dispatch.ts::resolveCredentials` also self-heals legacy rows
 * lazily on first publish, so running this script is not strictly
 * required. It exists to backfill the whole table at once (faster
 * + lets us see who has unrecoverable rows BEFORE the first publish
 * attempt rather than as a failed user-facing operation).
 */

import { db } from "@quikit/database";

const GRAPH_BASE = "https://graph.facebook.com/v24.0";

interface FetchResult {
  ok: boolean;
  igId?: string;
  reason?: string;
}

async function lookupIgBusinessAccountId(
  pageId: string,
  accessToken: string,
): Promise<FetchResult> {
  try {
    const url =
      `${GRAPH_BASE}/${encodeURIComponent(pageId)}` +
      `?fields=instagram_business_account` +
      `&access_token=${encodeURIComponent(accessToken)}`;
    const res = await fetch(url);
    const data = (await res.json().catch(() => null)) as
      | {
          instagram_business_account?: { id?: string };
          error?: { code?: number; message?: string };
        }
      | null;

    if (!data) return { ok: false, reason: "non_json_response" };
    if (data.error) {
      // 190 = expired token, 200 = insufficient permissions. Both
      // require user reconnect — we can't backfill these from the
      // server side.
      if (data.error.code === 190) return { ok: false, reason: "token_expired" };
      if (data.error.code === 200) return { ok: false, reason: "permission_denied" };
      return {
        ok: false,
        reason: `graph_error_${data.error.code ?? "unknown"}: ${data.error.message ?? ""}`.slice(0, 200),
      };
    }
    if (!data.instagram_business_account?.id) {
      return { ok: false, reason: "no_ig_link" };
    }
    return { ok: true, igId: data.instagram_business_account.id };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `network_error: ${msg.slice(0, 200)}` };
  }
}

async function main() {
  console.log(
    "[backfill-ig] scanning for SocialAccount rows where platform='instagram' AND igBusinessAccountId IS NULL ...",
  );

  // Pull rows that need backfilling. Include disabled rows too —
  // they'll get filled even if isActive=false, since the user may
  // re-enable later.
  const rows = await db.socialAccount.findMany({
    where: {
      platform: "instagram",
      igBusinessAccountId: null,
    },
    select: {
      id: true,
      orgId: true,
      accountId: true,
      pageId: true,
      accessToken: true,
      accountName: true,
    },
  });

  if (rows.length === 0) {
    console.log("[backfill-ig] nothing to do — every IG row already has igBusinessAccountId.");
    return;
  }

  console.log(`[backfill-ig] found ${rows.length} row(s) to process.`);

  const tally = {
    filled: 0,
    no_ig_link: 0,
    token_expired: 0,
    permission_denied: 0,
    missing_page_id: 0,
    network_error: 0,
    graph_error: 0,
  };

  for (const row of rows) {
    // Prefer pageId; fall back to accountId (legacy rows that landed
    // through the FB-identity fallback store the FB Page ID in
    // `accountId` — that's the same Page we'd call Graph against).
    const pageId = row.pageId ?? row.accountId;
    if (!pageId) {
      tally.missing_page_id++;
      console.warn(
        `[backfill-ig] SKIP id=${row.id} (${row.accountName}): no pageId or accountId`,
      );
      continue;
    }

    const result = await lookupIgBusinessAccountId(pageId, row.accessToken);
    if (result.ok && result.igId) {
      await db.socialAccount.update({
        where: { id: row.id },
        data: { igBusinessAccountId: result.igId },
      });
      tally.filled++;
      console.log(
        `[backfill-ig] FILL id=${row.id} (${row.accountName}) -> igBusinessAccountId=${result.igId}`,
      );
      continue;
    }

    const reason = result.reason ?? "unknown";
    if (reason === "no_ig_link") tally.no_ig_link++;
    else if (reason === "token_expired") tally.token_expired++;
    else if (reason === "permission_denied") tally.permission_denied++;
    else if (reason.startsWith("network_error")) tally.network_error++;
    else tally.graph_error++;

    console.warn(
      `[backfill-ig] SKIP id=${row.id} (${row.accountName}): ${reason}`,
    );
  }

  console.log("\n[backfill-ig] summary:");
  console.log(`  filled              : ${tally.filled}`);
  console.log(`  no_ig_link          : ${tally.no_ig_link}    (page not linked to an IG Business — user must connect via FB Business Suite)`);
  console.log(`  token_expired       : ${tally.token_expired}    (user must reconnect their account)`);
  console.log(`  permission_denied   : ${tally.permission_denied}    (re-grant pages_show_list / instagram_basic scopes)`);
  console.log(`  missing_page_id     : ${tally.missing_page_id}    (data corruption — investigate manually)`);
  console.log(`  network_error       : ${tally.network_error}`);
  console.log(`  graph_error (other) : ${tally.graph_error}`);
  console.log(`  TOTAL processed     : ${rows.length}`);
}

main()
  .catch((err) => {
    console.error("[backfill-ig] fatal:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
