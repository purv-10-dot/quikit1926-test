import axios from "axios";
import { prisma } from "@/lib/prisma";

async function getHubSpotToken(userId: string, workspaceId?: string): Promise<string> {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "HUBSPOT", ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn || conn.status !== "CONNECTED") throw new Error("HubSpot not connected");

  // Refresh if expired
  if (conn.tokenExpiresAt && conn.tokenExpiresAt < new Date() && conn.refreshToken) {
    const res = await axios.post<{
      access_token: string; refresh_token: string; expires_in: number;
    }>(
      "https://api.hubapi.com/oauth/v1/token",
      new URLSearchParams({
        grant_type:    "refresh_token",
        client_id:     process.env.HUBSPOT_CLIENT_ID ?? "",
        client_secret: process.env.HUBSPOT_CLIENT_SECRET ?? "",
        refresh_token: conn.refreshToken,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    await prisma.platformConnection.update({
      where: { id: conn.id },
      data: {
        accessToken:    res.data.access_token,
        refreshToken:   res.data.refresh_token,
        tokenExpiresAt: new Date(Date.now() + res.data.expires_in * 1000),
      },
    });
    return res.data.access_token;
  }

  return conn.accessToken ?? "";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function prettyStage(id: string): string {
  return id
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function getHubSpotCRMStats(userId: string, workspaceId?: string) {
  const token   = await getHubSpotToken(userId, workspaceId);
  const headers = { Authorization: `Bearer ${token}` };
  const jsonHeaders = { ...headers, "Content-Type": "application/json" };

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const [contactCountRes, recentContactsRes, dealsRes, pipelinesRes] = await Promise.all([
    axios.post("https://api.hubapi.com/crm/v3/objects/contacts/search", { limit: 1 }, { headers: jsonHeaders }).catch(() => null),
    axios.post(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      { limit: 1, filterGroups: [{ filters: [{ propertyName: "createdate", operator: "GTE", value: String(sevenDaysAgo) }] }] },
      { headers: jsonHeaders }
    ).catch(() => null),
    axios.get("https://api.hubapi.com/crm/v3/objects/deals?limit=100&properties=amount,dealstage,closedate,createdate", { headers }).catch(() => null),
    // Stage ID â†’ human label (best-effort; needs crm pipelines access)
    axios.get("https://api.hubapi.com/crm/v3/pipelines/deals", { headers }).catch(() => null),
  ]);

  const totalContacts  = contactCountRes?.data?.total ?? 0;
  const recentContacts = recentContactsRes?.data?.total ?? 0;
  const deals          = dealsRes?.data?.results ?? [];

  // Build stage-id â†’ label map from pipeline metadata
  const stageLabels: Record<string, string> = {};
  for (const pipe of pipelinesRes?.data?.results ?? []) {
    for (const st of pipe.stages ?? []) {
      stageLabels[st.id] = st.label ?? prettyStage(st.id);
    }
  }

  let pipeline = 0, revenue = 0, dealLeads = 0;
  let openDeals = 0, wonDeals = 0, lostDeals = 0;
  const stageAgg: Record<string, { count: number; value: number }> = {};
  const monthAgg: Record<string, { count: number; value: number }> = {};

  for (const deal of deals) {
    const amount     = Number(deal.properties?.amount ?? 0);
    const createdAt  = deal.properties?.createdate ? new Date(deal.properties.createdate) : null;
    const closedDate = deal.properties?.closedate ? new Date(deal.properties.closedate).getTime() : null;
    const stage      = deal.properties?.dealstage ?? "unknown";
    const isWon  = /won/i.test(stage);
    const isLost = /lost/i.test(stage);

    if (!isLost) pipeline += amount;
    if (isWon)  { revenue += amount; wonDeals++; }
    else if (isLost) lostDeals++;
    else openDeals++;

    if (createdAt && createdAt.getTime() > sevenDaysAgo) dealLeads++;

    const label = stageLabels[stage] ?? prettyStage(stage);
    stageAgg[label] = stageAgg[label] ?? { count: 0, value: 0 };
    stageAgg[label].count++;
    stageAgg[label].value += amount;

    if (createdAt) {
      const key = `${MONTHS[createdAt.getMonth()]} ${String(createdAt.getFullYear()).slice(2)}`;
      monthAgg[key] = monthAgg[key] ?? { count: 0, value: 0 };
      monthAgg[key].count++;
      monthAgg[key].value += amount;
    }
    void closedDate;
  }

  const stages = Object.entries(stageAgg).map(([label, v]) => ({ label, ...v }));
  const dealsByMonth = Object.entries(monthAgg).map(([month, v]) => ({ month, ...v }));
  const leads = dealLeads > 0 ? dealLeads : recentContacts;
  const winRate = (wonDeals + lostDeals) > 0
    ? Math.round((wonDeals / (wonDeals + lostDeals)) * 100)
    : 0;

  return {
    totalContacts, recentContacts,
    totalDeals: deals.length, openDeals, wonDeals, lostDeals,
    pipeline, revenue, leads, winRate,
    stages, dealsByMonth,
  };
}

// â”€â”€â”€ Lead records (powers the Leads page) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type UILead = {
  id: string; name: string; company: string; source: string;
  status: "New" | "Contacted" | "Qualified" | "Customer";
  score: number; owner: string; createdAt: string;
};

function prettySource(raw?: string): string {
  if (!raw) return "Direct";
  return raw.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// HubSpot lifecycle stage â†’ the 4 statuses the UI uses.
function lifecycleToStatus(stage?: string): UILead["status"] {
  switch ((stage ?? "").toLowerCase()) {
    case "customer": return "Customer";
    case "salesqualifiedlead":
    case "opportunity": return "Qualified";
    case "marketingqualifiedlead": return "Contacted";
    default: return "New";
  }
}

const FUNNEL_ORDER: UILead["status"][] = ["New", "Contacted", "Qualified", "Customer"];

export async function getHubSpotLeads(userId: string, workspaceId?: string): Promise<{
  leads: UILead[];
  leadsBySource: Record<string, number>;
  leadTrend: number[];
  leadFunnelStages: { label: string; value: number }[];
}> {
  const token = await getHubSpotToken(userId, workspaceId);
  const jsonHeaders = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };

  const contactsRes = await axios.post(
    "https://api.hubapi.com/crm/v3/objects/contacts/search",
    {
      limit: 100,
      sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
      properties: ["firstname", "lastname", "company", "lifecyclestage", "hubspotscore", "createdate", "hubspot_owner_id", "hs_analytics_source"],
    },
    { headers: jsonHeaders }
  ).catch(() => null);

  const rows: Array<{ id: string; properties: Record<string, string | undefined> }> =
    contactsRes?.data?.results ?? [];

  // Resolve owner id â†’ name (best-effort; falls back to "Unassigned").
  const ownerNames: Record<string, string> = {};
  const ownersRes = await axios
    .get("https://api.hubapi.com/crm/v3/owners", { headers: { Authorization: `Bearer ${token}` } })
    .catch(() => null);
  for (const o of ownersRes?.data?.results ?? []) {
    ownerNames[String(o.id)] = [o.firstName, o.lastName].filter(Boolean).join(" ") || o.email || "Unassigned";
  }

  const leads: UILead[] = rows.map((r) => {
    const p = r.properties ?? {};
    const name = [p.firstname, p.lastname].filter(Boolean).join(" ") || "(no name)";
    return {
      id: r.id,
      name,
      company: p.company || "â€”",
      source: prettySource(p.hs_analytics_source),
      status: lifecycleToStatus(p.lifecyclestage),
      score: Number(p.hubspotscore ?? 0) || 0,
      owner: (p.hubspot_owner_id && ownerNames[p.hubspot_owner_id]) || "Unassigned",
      createdAt: p.createdate ? new Date(p.createdate).toISOString() : new Date().toISOString(),
    };
  });

  // leadsBySource
  const leadsBySource: Record<string, number> = {};
  for (const l of leads) leadsBySource[l.source] = (leadsBySource[l.source] ?? 0) + 1;

  // leadFunnelStages â€” cumulative funnel over the 4 statuses (+ Opportunity bucket for UI parity)
  const statusCounts: Record<UILead["status"], number> = { New: 0, Contacted: 0, Qualified: 0, Customer: 0 };
  for (const l of leads) statusCounts[l.status]++;
  const total = leads.length;
  const leadFunnelStages = [
    { label: "New lead",   value: total },
    { label: "Contacted",  value: statusCounts.Contacted + statusCounts.Qualified + statusCounts.Customer },
    { label: "Qualified",  value: statusCounts.Qualified + statusCounts.Customer },
    { label: "Opportunity", value: statusCounts.Qualified + statusCounts.Customer },
    { label: "Customer",   value: statusCounts.Customer },
  ];
  void FUNNEL_ORDER;

  // leadTrend â€” new leads per week over the last 6 weeks (oldestâ†’newest).
  const now = Date.now();
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const leadTrend = [0, 0, 0, 0, 0, 0];
  for (const l of leads) {
    const age = now - new Date(l.createdAt).getTime();
    const weeksAgo = Math.floor(age / WEEK);
    if (weeksAgo >= 0 && weeksAgo < 6) leadTrend[5 - weeksAgo]++;
  }

  return { leads, leadsBySource, leadTrend, leadFunnelStages };
}
