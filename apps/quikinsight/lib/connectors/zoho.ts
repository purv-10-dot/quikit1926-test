import axios from "axios";
import { prisma } from "@/lib/prisma";
import type { ZohoMetadata } from "@/lib/types/connections";

export interface ZohoStats {
  totalContacts: number;
  leads:    number;  // deals created in the last 7 days
  pipeline: number;  // value of open deals
  revenue:  number;  // value of won deals
}

async function getClient(userId: string, workspaceId?: string) {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "ZOHO", ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn || conn.status !== "CONNECTED") throw new Error("Zoho not connected");

  let token = conn.accessToken ?? "";
  if (conn.tokenExpiresAt && conn.tokenExpiresAt < new Date() && conn.refreshToken) {
    const res = await axios.post<{ access_token: string; expires_in: number }>(
      "https://accounts.zoho.com/oauth/v2/token",
      new URLSearchParams({
        grant_type:    "refresh_token",
        client_id:     process.env.ZOHO_CLIENT_ID ?? "",
        client_secret: process.env.ZOHO_CLIENT_SECRET ?? "",
        refresh_token: conn.refreshToken,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    token = res.data.access_token;
    await prisma.platformConnection.update({
      where: { id: conn.id },
      data:  { accessToken: token, tokenExpiresAt: new Date(Date.now() + res.data.expires_in * 1000) },
    });
  }

  const metadata = (conn.metadata ?? {}) as ZohoMetadata;
  return { token, apiDomain: metadata.apiDomain || "https://www.zohoapis.com" };
}

export async function getZohoStats(userId: string, workspaceId?: string): Promise<ZohoStats> {
  const { token, apiDomain } = await getClient(userId, workspaceId);
  const headers = { Authorization: `Zoho-oauthtoken ${token}` };

  const [contactsRes, dealsRes] = await Promise.all([
    axios.get(`${apiDomain}/crm/v3/Contacts?fields=id&per_page=1`, { headers }).catch(() => null),
    axios.get(`${apiDomain}/crm/v3/Deals?fields=Amount,Stage,Closing_Date,Created_Time&per_page=200`, { headers }).catch(() => null),
  ]);

  const totalContacts = contactsRes?.data?.info?.count ?? 0;
  const deals = dealsRes?.data?.data ?? [];

  let pipeline = 0, revenue = 0, leads = 0;
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const d of deals) {
    const amount = Number(d.Amount ?? 0);
    const stage  = String(d.Stage ?? "");
    const created = d.Created_Time ? new Date(d.Created_Time).getTime() : 0;
    const isWon  = /won/i.test(stage);
    const isLost = /lost/i.test(stage);

    if (!isLost && !isWon) pipeline += amount;
    if (isWon) revenue += amount;
    if (created > sevenDaysAgo) leads++;
  }

  return { totalContacts, leads, pipeline, revenue };
}
