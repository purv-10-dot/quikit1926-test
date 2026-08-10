import axios from "axios";
import { prisma } from "@/lib/prisma";
import type { MailchimpMetadata } from "@/lib/types/connections";

export interface MailchimpStats {
  subscribers: number;
  openRate:    number;  // percent
  clickRate:   number;  // percent
  campaigns:   number;
}

async function getClient(userId: string, workspaceId?: string) {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "MAILCHIMP", ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn || conn.status !== "CONNECTED") throw new Error("Mailchimp not connected");
  const metadata = (conn.metadata ?? {}) as MailchimpMetadata;
  // Mailchimp tokens don't expire; data-center prefix lives in metadata
  const base = metadata.apiEndpoint || (metadata.dc ? `https://${metadata.dc}.api.mailchimp.com` : "");
  if (!base) throw new Error("Mailchimp data center unknown");
  return { token: conn.accessToken ?? "", base };
}

export async function getMailchimpStats(userId: string, workspaceId?: string): Promise<MailchimpStats> {
  const { token, base } = await getClient(userId, workspaceId);
  const headers = { Authorization: `Bearer ${token}` };

  const [listsRes, campaignsRes] = await Promise.all([
    axios.get(`${base}/3.0/lists?count=100&fields=lists.stats.member_count`, { headers }),
    axios.get(`${base}/3.0/campaigns?count=20&sort_field=send_time&sort_dir=DESC&fields=campaigns.report_summary`, { headers }),
  ]);

  const subscribers = (listsRes.data?.lists ?? []).reduce(
    (s: number, l: { stats?: { member_count?: number } }) => s + (l.stats?.member_count ?? 0), 0
  );

  const campaigns = campaignsRes.data?.campaigns ?? [];
  let openSum = 0, clickSum = 0, n = 0;
  for (const c of campaigns) {
    const rs = c.report_summary;
    if (!rs) continue;
    openSum  += Number(rs.open_rate ?? 0);
    clickSum += Number(rs.click_rate ?? 0);
    n++;
  }

  return {
    subscribers,
    openRate:  n ? Math.round((openSum  / n) * 1000) / 10 : 0,
    clickRate: n ? Math.round((clickSum / n) * 1000) / 10 : 0,
    campaigns: campaigns.length,
  };
}
