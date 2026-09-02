import axios from "axios";
import { prisma } from "@/lib/prisma";
import type { DynamicsMetadata } from "@/lib/types/connections";
import { NoConnectionError } from "./errors";

export interface DynamicsStats {
  totalAccounts: number;
  openOpportunities: number;
  pipeline: number;  // estimated value of open opportunities
  revenue:  number;  // actual value of won opportunities
}

async function getClient(userId: string, workspaceId?: string) {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "DYNAMICS", ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn) throw new NoConnectionError();
  if (conn.status !== "CONNECTED") throw new Error("Dynamics not connected");

  const metadata = (conn.metadata ?? {}) as DynamicsMetadata;
  const resource = (metadata.resourceUrl || process.env.DYNAMICS_RESOURCE || "").replace(/\/$/, "");
  if (!resource) throw new Error("Dynamics org URL not set");

  let token = conn.accessToken ?? "";
  if (conn.tokenExpiresAt && conn.tokenExpiresAt < new Date() && conn.refreshToken) {
    const res = await axios.post<{ access_token: string; expires_in: number }>(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      new URLSearchParams({
        grant_type:    "refresh_token",
        client_id:     process.env.DYNAMICS_CLIENT_ID ?? "",
        client_secret: process.env.DYNAMICS_CLIENT_SECRET ?? "",
        refresh_token: conn.refreshToken,
        scope:         `offline_access ${resource}/.default`,
      }).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );
    token = res.data.access_token;
    await prisma.platformConnection.update({
      where: { id: conn.id },
      data:  { accessToken: token, tokenExpiresAt: new Date(Date.now() + res.data.expires_in * 1000) },
    });
  }

  return { token, resource };
}

export async function getDynamicsStats(userId: string, workspaceId?: string): Promise<DynamicsStats> {
  const { token, resource } = await getClient(userId, workspaceId);
  const headers = {
    Authorization: `Bearer ${token}`,
    "OData-MaxVersion": "4.0",
    "OData-Version": "4.0",
    Accept: "application/json",
  };
  const base = `${resource}/api/data/v9.2`;

  const [acctRes, oppRes] = await Promise.all([
    axios.get(`${base}/accounts/$count`, { headers }).catch(() => null),
    axios.get(
      `${base}/opportunities?$select=estimatedvalue,actualvalue,statecode&$top=500`,
      { headers }
    ).catch(() => null),
  ]);

  const totalAccounts = Number(acctRes?.data ?? 0);
  const opps = oppRes?.data?.value ?? [];

  let pipeline = 0, revenue = 0, openOpportunities = 0;
  for (const o of opps) {
    const state = Number(o.statecode); // 0 = Open, 1 = Won, 2 = Lost
    if (state === 0) {
      pipeline += Number(o.estimatedvalue ?? 0);
      openOpportunities++;
    } else if (state === 1) {
      revenue += Number(o.actualvalue ?? o.estimatedvalue ?? 0);
    }
  }

  return { totalAccounts, openOpportunities, pipeline, revenue };
}
