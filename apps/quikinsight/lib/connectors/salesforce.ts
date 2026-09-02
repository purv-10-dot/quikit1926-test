import axios from "axios";
import { prisma } from "@/lib/prisma";
import type { SalesforceMetadata } from "@/lib/types/connections";
import { NoConnectionError } from "./errors";

async function getSalesforceAuth(userId: string, workspaceId?: string): Promise<{ token: string; instanceUrl: string }> {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "SALESFORCE", ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn) throw new NoConnectionError();
  if (conn.status !== "CONNECTED") throw new Error("Salesforce not connected");

  const metadata = (conn.metadata ?? {}) as SalesforceMetadata;

  // Refresh if expired
  if (conn.tokenExpiresAt && conn.tokenExpiresAt < new Date() && conn.refreshToken) {
    const res = await axios.post<{
      access_token: string; instance_url: string;
    }>(
      "https://login.salesforce.com/services/oauth2/token",
      new URLSearchParams({
        grant_type:    "refresh_token",
        client_id:     process.env.SALESFORCE_CLIENT_ID     ?? "",
        client_secret: process.env.SALESFORCE_CLIENT_SECRET ?? "",
        refresh_token: conn.refreshToken,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    await prisma.platformConnection.update({
      where: { id: conn.id },
      data: {
        accessToken:    res.data.access_token,
        tokenExpiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000),
        metadata:       { ...metadata, instanceUrl: res.data.instance_url },
      },
    });
    return { token: res.data.access_token, instanceUrl: res.data.instance_url };
  }

  return {
    token:       conn.accessToken ?? "",
    instanceUrl: metadata.instanceUrl ?? "https://login.salesforce.com",
  };
}

export async function getSalesforcePipelineStats(userId: string, workspaceId?: string) {
  const { token, instanceUrl } = await getSalesforceAuth(userId, workspaceId);
  const headers = { Authorization: `Bearer ${token}` };
  const apiBase = `${instanceUrl}/services/data/v59.0`;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  const res = await axios.get(
    `${apiBase}/query?q=${encodeURIComponent(
      `SELECT StageName, Amount, CreatedDate, CloseDate FROM Opportunity WHERE CreatedDate >= ${sevenDaysAgo}T00:00:00Z LIMIT 500`
    )}`,
    { headers }
  );

  let pipeline = 0, revenue = 0, leads = 0;
  for (const opp of res.data?.records ?? []) {
    const amount = Number(opp.Amount ?? 0);
    if (opp.StageName !== "Closed Lost") pipeline += amount;
    if (opp.StageName === "Closed Won")  revenue  += amount;
    leads++;
  }

  return { pipeline, revenue, opportunities: leads };
}
