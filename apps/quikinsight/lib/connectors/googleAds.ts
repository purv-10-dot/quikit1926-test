// Google Ads connector â€” fetches campaign stats via GOOGLE_ADS connection
import { prisma } from "@/lib/prisma";
import { trailingWindow } from "@/lib/period/resolve";
import type { DateWindow } from "@/lib/period/types";

async function listAccessibleCustomers(accessToken: string): Promise<string[]> {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "";
  const res = await fetch("https://googleads.googleapis.com/v17/customers:listAccessibleCustomers", {
    headers: { Authorization: `Bearer ${accessToken}`, "developer-token": devToken },
  });
  if (!res.ok) return [];
  const data = await res.json() as { resourceNames?: string[] };
  return (data.resourceNames ?? []).map((r) => r.replace("customers/", "").replace(/-/g, ""));
}

async function getGoogleAdsConn(userId: string, workspaceId?: string) {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "GOOGLE_ADS", ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn || conn.status !== "CONNECTED") throw new Error("Google Ads not connected");
  const md = (conn.metadata ?? {}) as Record<string, string>;
  return {
    accessToken: conn.accessToken ?? "",
    refreshToken: conn.refreshToken ?? "",
    customerId: md.customerId ?? "",
    accountName: md.accountName ?? "",
  };
}

async function refreshGoogleToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.QUIKINSIGHT_GOOGLE_ADS_CLIENT_ID ?? "",
      client_secret: process.env.QUIKINSIGHT_GOOGLE_ADS_CLIENT_SECRET ?? "",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = await res.json();
  return data.access_token as string;
}

async function gaqlQuery(customerId: string, accessToken: string, query: string) {
  const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "";
  const res = await fetch(
    `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": devToken,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  if (!res.ok) {
    const err = await res.text().catch(() => "");
    throw new Error(`Google Ads GAQL error ${res.status}: ${err.slice(0, 200)}`);
  }
  // searchStream returns newline-delimited JSON objects
  const text = await res.text();
  const rows: unknown[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "[" || trimmed === "]") continue;
    try {
      const parsed = JSON.parse(trimmed.replace(/^,/, ""));
      const results = (parsed as { results?: unknown[] }).results;
      if (Array.isArray(results)) rows.push(...results);
    } catch { /* skip */ }
  }
  return rows;
}

export async function getGoogleAdsStats(userId: string, workspaceId?: string, window?: DateWindow) {
  const conn = await getGoogleAdsConn(userId, workspaceId);
  let accessToken = conn.accessToken;

  // Refresh token if needed
  if (conn.refreshToken) {
    try { accessToken = await refreshGoogleToken(conn.refreshToken); } catch { /* use existing */ }
  }

  const customerId = conn.customerId.replace(/-/g, "");
  if (!customerId) {
    // Metadata missing â€” try to discover it lazily from the stored access/refresh token
    let token = conn.accessToken;
    if (conn.refreshToken) {
      try { token = await refreshGoogleToken(conn.refreshToken); } catch { /* */ }
    }
    const customers = await listAccessibleCustomers(token);
    if (customers.length === 0) throw new Error("Google Ads not connected: no accessible customers found");
    // Self-heal: persist the discovered customerId so future calls are instant
    await prisma.platformConnection.updateMany({
      where: { userId, platform: "GOOGLE_ADS" as never },
      data: { metadata: { customerId: customers[0] } },
    });
    // Retry with the persisted customerId — keeping workspace and window, which
    // this call previously dropped (so a retry silently reverted to the default
    // workspace and a trailing 30-day window).
    return getGoogleAdsStats(userId, workspaceId, window);
  }

  // GAQL takes an explicit inclusive range, so an arbitrary comparison window
  // costs nothing beyond the extra request. Defaults to the trailing 30 days it
  // has always used when no window is supplied.
  const w = window ?? trailingWindow(30);
  const since = w.start;
  const until = w.end;

  // Account-level totals
  let totalSpend = 0, totalImpressions = 0, totalClicks = 0, totalConversions = 0, totalConvValue = 0;
  try {
    const rows = await gaqlQuery(customerId, accessToken, `
      SELECT
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.conversions_value
      FROM customer
      WHERE segments.date BETWEEN '${since}' AND '${until}'
    `);
    for (const row of rows as Array<{ metrics?: Record<string, string> }>) {
      const m = row.metrics ?? {};
      totalSpend += Number(m.cost_micros ?? 0) / 1_000_000;
      totalImpressions += Number(m.impressions ?? 0);
      totalClicks += Number(m.clicks ?? 0);
      totalConversions += Number(m.conversions ?? 0);
      totalConvValue += Number(m.conversions_value ?? 0);
    }
  } catch { /* */ }

  // Campaign breakdown
  type Campaign = { id: string; name: string; status: string; spend: number; impressions: number; clicks: number; ctr: number; conversions: number; roas: number };
  let campaigns: Campaign[] = [];
  try {
    const rows = await gaqlQuery(customerId, accessToken, `
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        metrics.cost_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.conversions,
        metrics.conversions_value
      FROM campaign
      WHERE segments.date BETWEEN '${since}' AND '${until}'
        AND campaign.status != 'REMOVED'
      ORDER BY metrics.cost_micros DESC
      LIMIT 20
    `);
    campaigns = (rows as Array<{ campaign?: Record<string, string>; metrics?: Record<string, string> }>)
      .map((row) => {
        const c = row.campaign ?? {};
        const m = row.metrics ?? {};
        const spend = Number(m.cost_micros ?? 0) / 1_000_000;
        const imp = Number(m.impressions ?? 0);
        const clk = Number(m.clicks ?? 0);
        const convs = Number(m.conversions ?? 0);
        const convVal = Number(m.conversions_value ?? 0);
        return {
          id: c.id ?? "",
          name: c.name ?? "",
          status: c.status ?? "",
          spend: Number(spend.toFixed(2)),
          impressions: imp,
          clicks: clk,
          ctr: imp > 0 ? Number(((clk / imp) * 100).toFixed(2)) : 0,
          conversions: Math.round(convs),
          roas: spend > 0 ? Number((convVal / spend).toFixed(2)) : 0,
        };
      });
  } catch { /* */ }

  const roas = totalSpend > 0 ? Number((totalConvValue / totalSpend).toFixed(2)) : 0;
  const ctr = totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;
  const cpc = totalClicks > 0 ? Number((totalSpend / totalClicks).toFixed(2)) : 0;
  const conversionRate = totalClicks > 0 ? Number(((totalConversions / totalClicks) * 100).toFixed(2)) : 0;

  return {
    accountName: conn.accountName,
    spend: Number(totalSpend.toFixed(2)),
    impressions: totalImpressions,
    clicks: totalClicks,
    ctr,
    cpc,
    conversions: Math.round(totalConversions),
    conversionRate,
    roas,
    campaigns,
  };
}
