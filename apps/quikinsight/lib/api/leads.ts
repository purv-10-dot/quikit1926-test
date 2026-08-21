import { withSample } from "./sample";
import { LEADS_SAMPLE } from "@/lib/mock/leadsSample";

export type LeadStatus = "New" | "Contacted" | "Qualified" | "Customer";

export interface Lead {
  id: string;
  name: string;
  company: string;
  source: string;
  status: LeadStatus;
  /** 0–100, drives the score bar width. */
  score: number;
  owner: string;
  /** ISO timestamp. */
  createdAt: string;
}

export interface FunnelStage {
  label: string;
  value: number;
}

export interface LeadsData {
  connected: boolean;
  /** Set when these are sample figures, not the workspace's own. */
  isSampleData?: boolean;
  leads: Lead[];
  leadsBySource: Record<string, number>;
  /** Six weekly totals, oldest first — Wk1..Wk6. */
  leadTrend: number[];
  leadFunnelStages: FunnelStage[];
}

export async function getLeadsData(): Promise<LeadsData> {
  const res = await fetch("/api/leads", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load leads data (${res.status})`);
  const live = (await res.json()) as LeadsData;
  // No CRM connected -> reference sample data + a banner on the page.
  return withSample<LeadsData>(live, LEADS_SAMPLE);
}
