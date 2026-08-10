export interface CrmStatsData {
  connected: boolean;
  totalContacts?: number;
  recentContacts?: number;
  totalDeals?: number;
  openDeals?: number;
  wonDeals?: number;
  lostDeals?: number;
  pipeline?: number;
  revenue?: number;
  leads?: number;
  winRate?: number;
  stages?: Array<{ label: string; count: number; value: number }>;
  dealsByMonth?: Array<{ month: string; count: number; value: number }>;
}

export async function getCrmStats(): Promise<CrmStatsData> {
  const res = await fetch("/api/crm-stats", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load CRM stats (${res.status})`);
  return (await res.json()) as CrmStatsData;
}
