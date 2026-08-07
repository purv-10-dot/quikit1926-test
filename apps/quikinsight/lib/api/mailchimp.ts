export interface MailchimpData {
  connected: boolean;
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
  return (await res.json()) as MailchimpData;
}
