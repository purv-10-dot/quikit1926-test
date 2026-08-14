export interface InstantlyData {
  connected: boolean;
  workspaceName?: string;
  totalCampaigns?: number;
  emailsSent?: number;
  openRate?: number;
  replyRate?: number;
  bounceRate?: number;
  recentCampaigns?: Array<{ id: string; name: string; status: string; sent: number; opened: number; replied: number; bounced: number }>;
}

export async function getInstantlyData(): Promise<InstantlyData> {
  const res = await fetch("/api/instantly", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load Instantly data (${res.status})`);
  return (await res.json()) as InstantlyData;
}
