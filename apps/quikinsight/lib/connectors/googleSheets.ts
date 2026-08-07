// Google Sheets connector — reads KPIs, funnel, team, actions, top posts, and
// products from a shared spreadsheet via the Sheets API v4.
//
// Required env vars: GOOGLE_SHEETS_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY
// (same service account as GA4; grant it Viewer access on the Sheet)
//
// Sheet structure expected:
//   KPIs!A:F     label | value | rawValue | delta | deltaDirection | unit
//   Funnel!A:C   label | value | color
//   Team!A:D     team  | targetLabel | target | actual
//   Actions!A:B  status | message
//   TopPosts!A:D rank | title | reach | leads
//   Products!A:E name | reach | leads | trials | revenue

import type {
  KPIMetric,
  FunnelStep,
  TeamMember,
  ActionItem,
  Post,
  Product,
} from "@/lib/types";

function isConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SHEETS_ID &&
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY
  );
}

async function sheetsQuery(range: string): Promise<string[][]> {
  if (!isConfigured()) throw new Error("Google Sheets not configured");

  // Dynamic import keeps googleapis out of the cold-start bundle
  const { google } = await import("googleapis");
  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key:  process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID,
    range,
  });
  return (res.data.values ?? []) as string[][];
}

export async function getKPIs(): Promise<KPIMetric[]> {
  const rows = await sheetsQuery("KPIs!A2:F");
  return rows.map((r) => ({
    label:          r[0] ?? "",
    value:          r[1] ?? "",
    rawValue:       Number(r[2] ?? 0),
    delta:          Number(r[3] ?? 0),
    deltaDirection: (r[4] === "down" ? "down" : "up") as "up" | "down",
    unit:           (r[5] ?? "number") as KPIMetric["unit"],
  }));
}

export async function getFunnel(): Promise<FunnelStep[]> {
  const rows = await sheetsQuery("Funnel!A2:C");
  return rows.map((r) => ({
    label: r[0] ?? "",
    value: Number(r[1] ?? 0),
    color: r[2] ?? "#7F77DD",
  }));
}

export async function getTeam(): Promise<TeamMember[]> {
  const rows = await sheetsQuery("Team!A2:D");
  return rows.map((r) => ({
    team:        r[0] ?? "",
    targetLabel: r[1] ?? "",
    target:      Number(r[2] ?? 0),
    actual:      Number(r[3] ?? 0),
  }));
}

export async function getActions(): Promise<ActionItem[]> {
  const rows = await sheetsQuery("Actions!A2:B");
  return rows.map((r) => ({
    status:  (r[0] ?? "green") as ActionItem["status"],
    message: r[1] ?? "",
  }));
}

export async function getTopPosts(): Promise<Post[]> {
  const rows = await sheetsQuery("TopPosts!A2:D");
  return rows.map((r) => ({
    rank:   Number(r[0] ?? 1),
    title:  r[1] ?? "",
    reach:  Number(r[2] ?? 0),
    leads:  Number(r[3] ?? 0),
    source: "manual" as const,
  }));
}

export async function getProducts(): Promise<Product[]> {
  const rows = await sheetsQuery("Products!A2:E");
  return rows.map((r) => ({
    name:    r[0] ?? "",
    reach:   Number(r[1] ?? 0),
    leads:   r[2] ? Number(r[2]) : undefined,
    trials:  r[3] ? Number(r[3]) : undefined,
    revenue: r[4] ? Number(r[4]) : undefined,
  }));
}
