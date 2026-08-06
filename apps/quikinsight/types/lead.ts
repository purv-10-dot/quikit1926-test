export type LeadStatus = "New" | "Contacted" | "Qualified" | "Customer";

export interface Lead {
  id: string;
  name: string;
  company: string;
  source: string;
  status: LeadStatus;
  score: number; // 0-100
  owner: string;
  createdAt: string; // ISO timestamp
}

export interface LeadFunnelStage {
  label: string;
  value: number;
}
