import { withSample } from "./sample";
import { MAILCHIMP_SAMPLE } from "@/lib/mock/platformSamples";
export interface MailchimpData {
  connected: boolean;
  /** Set when these are sample figures, not the workspace's own. */
  isSampleData?: boolean;
  audienceName?: string;
  totalContacts?: number;
  totalCampaigns?: number;
  avgOpenRate?: number;
  avgClickRate?: number;
  unsubscribes?: number;
  recentCampaigns?: Array<{ id: string; title: string; sentAt: string; recipients: number; openRate: number; clickRate: number }>;
}

export async function getMailchimpData(): Promise<MailchimpData> {
  const res = await fetch("/api/mailchimp", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load Mailchimp data (${res.status})`);
  const live = (await res.json()) as MailchimpData;
  // Not connected -> representative sample data + a banner on the page.
  return withSample<MailchimpData>(live, MAILCHIMP_SAMPLE);
}
