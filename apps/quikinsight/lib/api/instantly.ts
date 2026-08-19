import { withSample } from "./sample";
import { INSTANTLY_SAMPLE } from "@/lib/mock/platformSamples";
export interface InstantlyData {
  connected: boolean;
  /** Set when these are sample figures, not the workspace's own. */
  isSampleData?: boolean;
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
  const live = (await res.json()) as InstantlyData;
  // Not connected -> representative sample data + a banner on the page.
  return withSample<InstantlyData>(live, INSTANTLY_SAMPLE);
}
