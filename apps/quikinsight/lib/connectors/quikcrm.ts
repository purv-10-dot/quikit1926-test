import { prisma } from "@/lib/prisma";
import type { QuikCRMMetadata } from "@/lib/types/connections";

export interface QuikCRMStats {
  leads:       number; // new contacts in last 7 days
  totalLeads:  number; // all-time contacts
  pipeline:    number; // sum of open deal amounts
  revenue:     number; // sum of won deal amounts
  openDeals:   number;
  wonDeals:    number;
  lostDeals:   number;
  recentDeals: Array<{ id: string; amount: number; name?: string; status: string; date?: string }>;
  dealStages:  Array<{ stage: string; count: number; value: number }>;
}

// â”€â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function getClient(userId: string, workspaceId?: string) {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "QUIKCRM", ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn || conn.status !== "CONNECTED") throw new Error("QuikCRM not connected");

  const apiKey = conn.accessToken;
  if (!apiKey) throw new Error("QuikCRM API key missing");

  const metadata = (conn.metadata ?? {}) as QuikCRMMetadata;
  const baseUrl  = metadata.apiUrl?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("QuikCRM base URL not configured");

  return { apiKey, baseUrl };
}

async function quikFetch<T>(
  baseUrl: string,
  apiKey: string,
  path: string,
): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`QuikCRM API error ${res.status} on ${path}`);
  }
  return res.json() as Promise<T>;
}

// â”€â”€â”€ Public connector â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface QuikDeal {
  id:      string;
  amount:  number;
  stage?:  string;
  status:  "open" | "won" | "lost";
}
interface DealsPage {
  items:      QuikDeal[];
  page:       number;
  totalPages: number;
}

// /deals is paginated ({ items, page, totalPages }); walk all pages.
async function fetchAllDeals(baseUrl: string, apiKey: string): Promise<QuikDeal[]> {
  const pageSize = 100;
  const first = await quikFetch<DealsPage>(baseUrl, apiKey, `/deals?page=1&pageSize=${pageSize}`);
  const all: QuikDeal[] = [...(first.items ?? [])];
  const totalPages = first.totalPages ?? 1;
  for (let p = 2; p <= totalPages; p++) {
    const pg = await quikFetch<DealsPage>(baseUrl, apiKey, `/deals?page=${p}&pageSize=${pageSize}`)
      .catch(() => ({ items: [] as QuikDeal[], page: p, totalPages }));
    all.push(...(pg.items ?? []));
  }
  return all;
}

export async function getQuikCRMStats(userId: string, workspaceId?: string): Promise<QuikCRMStats> {
  const { apiKey, baseUrl } = await getClient(userId, workspaceId);

  // API expects a YYYY-MM-DD date, not a full ISO timestamp.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  // Run requests concurrently; gracefully fall back on partial failures.
  const [totalContacts, recentContacts, deals] = await Promise.all([
    quikFetch<{ total: number }>(baseUrl, apiKey, "/contacts?count=true").catch(() => ({ total: 0 })),
    quikFetch<{ total: number }>(baseUrl, apiKey, `/contacts?count=true&createdAfter=${sevenDaysAgo}`).catch(() => ({ total: 0 })),
    fetchAllDeals(baseUrl, apiKey).catch(() => [] as QuikDeal[]),
  ]);

  const totalLeads  = totalContacts.total ?? 0;
  const recentLeads = recentContacts.total ?? 0;

  let pipeline = 0, revenue = 0, openDeals = 0, wonDeals = 0, lostDeals = 0;
  const stagesMap: Record<string, { stage: string; count: number; value: number }> = {};

  for (const deal of deals) {
    const amount = Number(deal.amount) || 0;
    const stage = deal.stage || "Uncategorized";

    if (!stagesMap[stage]) {
      stagesMap[stage] = { stage, count: 0, value: 0 };
    }
    stagesMap[stage].count++;
    stagesMap[stage].value += amount;

    if (deal.status === "open")      { pipeline += amount; openDeals++; }
    else if (deal.status === "won")  { revenue  += amount; wonDeals++;  }
    else if (deal.status === "lost") { lostDeals++; }
  }

  return {
    leads: recentLeads,
    totalLeads,
    pipeline,
    revenue,
    openDeals,
    wonDeals,
    lostDeals,
    recentDeals: deals.slice(0, 10).map(d => ({
      id: d.id,
      amount: d.amount,
      status: d.status,
      name: `Deal #${d.id.slice(-4)}`,
    })),
    dealStages: Object.values(stagesMap).sort((a, b) => b.value - a.value),
  };
}

// â”€â”€â”€ Validation (called when user saves credentials in the UI) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function validateQuikCRMCredentials(
  baseUrl: string,
  apiKey: string,
): Promise<{ orgId?: string; orgName?: string }> {
  const cleanUrl = baseUrl.replace(/\/$/, "");
  const info = await quikFetch<{ orgId?: string; orgName?: string; id?: string; name?: string }>(
    cleanUrl,
    apiKey,
    "/me",
  );
  return {
    orgId:   info.orgId  ?? info.id,
    orgName: info.orgName ?? info.name,
  };
}
