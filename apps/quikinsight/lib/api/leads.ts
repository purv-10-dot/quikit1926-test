import type { Lead, LeadFunnelStage } from "@/types";

export interface LeadsData {
  leads: Lead[];
  leadsBySource: Record<string, number>;
  leadTrend: number[];
  leadFunnelStages: LeadFunnelStage[];
}

/** GET /leads — real lead records from the connected CRM (see app/api/leads). */
export async function getLeadsData(): Promise<LeadsData> {
  const res = await fetch("/api/leads", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load leads (${res.status})`);
  return (await res.json()) as LeadsData;
}
