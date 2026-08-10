// Meta Ads connector â€” fetches campaign stats via META_ADS connection
import { prisma } from "@/lib/prisma";

const BASE = "https://graph.facebook.com/v19.0";

async function getMetaAdsConn(userId: string, workspaceId?: string) {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "META_ADS", ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn || conn.status !== "CONNECTED") throw new Error("Meta Ads not connected");
  const md = (conn.metadata ?? {}) as Record<string, string>;
  return { token: conn.accessToken ?? "", adAccountId: md.adAccountId ?? "" };
}

async function metaGet(path: string, token: string) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}access_token=${token}`);
  if (!res.ok) throw new Error(`Meta Ads API ${path} â†’ ${res.status}`);
  return res.json();
}

export async function getMetaAdsStats(userId: string, workspaceId?: string) {
  const { token, adAccountId } = await getMetaAdsConn(userId, workspaceId);
  if (!adAccountId) {
    // Self-heal: try to discover ad accounts from the stored token
    let discoveredId = "";
    try {
      const res = await fetch(
        `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&access_token=${token}`
      );
      if (res.ok) {
        const data = await res.json() as { data?: Array<{ id: string; name: string; account_status?: number }> };
        const accounts = data.data ?? [];
        const active = accounts.filter((a) => a.account_status === 1);
        const first = active.length > 0 ? active[0] : accounts[0];
        if (first) {
          discoveredId = first.id;
          await prisma.platformConnection.updateMany({
            where: { userId, platform: "META_ADS" as never },
            data: { metadata: { adAccountId: first.id, accountName: first.name } },
          });
        }
      }
    } catch { /* */ }
    if (!discoveredId) throw new Error("Meta Ads not connected: no ad account found");
    return getMetaAdsStats(userId);
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const until = new Date().toISOString().slice(0, 10);
  const datePreset = `{"since":"${since}","until":"${until}"}`;

  // Account-level insights
  let accountName = "";
  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  let purchaseValue = 0;

  try {
    const acct = await metaGet(`/${adAccountId}?fields=name`, token);
    accountName = acct.name ?? "";
  } catch { /* */ }

  try {
    const ins = await metaGet(
      `/${adAccountId}/insights?fields=spend,impressions,clicks,actions,action_values&time_range=${encodeURIComponent(datePreset)}`,
      token,
    );
    const d = ins.data?.[0] ?? {};
    totalSpend = Number(d.spend ?? 0);
    totalImpressions = Number(d.impressions ?? 0);
    totalClicks = Number(d.clicks ?? 0);
    const actions: Array<{ action_type: string; value: string }> = d.actions ?? [];
    const actionValues: Array<{ action_type: string; value: string }> = d.action_values ?? [];
    totalConversions = actions
      .filter((a) => a.action_type === "purchase" || a.action_type === "lead")
      .reduce((s, a) => s + Number(a.value), 0);
    purchaseValue = actionValues
      .filter((a) => a.action_type === "purchase")
      .reduce((s, a) => s + Number(a.value), 0);
  } catch { /* */ }

  // Campaign breakdown
  type Campaign = { id: string; name: string; status: string; spend: number; impressions: number; clicks: number; ctr: number; conversions: number };
  let campaigns: Campaign[] = [];
  try {
    const campData = await metaGet(
      `/${adAccountId}/campaigns?fields=id,name,status,insights.date_preset(last_30d){spend,impressions,clicks,actions}&limit=20`,
      token,
    );
    campaigns = (campData.data ?? []).map((c: Record<string, unknown>) => {
      const ins = (c.insights as { data?: Array<Record<string, unknown>> })?.data?.[0] ?? {};
      const actions: Array<{ action_type: string; value: string }> = (ins.actions ?? []) as Array<{ action_type: string; value: string }>;
      const convs = actions
        .filter((a) => a.action_type === "purchase" || a.action_type === "lead")
        .reduce((s, a) => s + Number(a.value), 0);
      const imp = Number(ins.impressions ?? 0);
      const clk = Number(ins.clicks ?? 0);
      return {
        id: String(c.id ?? ""),
        name: String(c.name ?? ""),
        status: String(c.status ?? ""),
        spend: Number(ins.spend ?? 0),
        impressions: imp,
        clicks: clk,
        ctr: imp > 0 ? Number(((clk / imp) * 100).toFixed(2)) : 0,
        conversions: convs,
      };
    });
  } catch { /* */ }

  const roas = totalSpend > 0 ? Number((purchaseValue / totalSpend).toFixed(2)) : 0;
  const ctr = totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;
  const cpc = totalClicks > 0 ? Number((totalSpend / totalClicks).toFixed(2)) : 0;

  return { accountName, spend: totalSpend, impressions: totalImpressions, clicks: totalClicks, ctr, cpc, conversions: totalConversions, roas, campaigns };
}
