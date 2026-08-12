export interface SearchConsoleData {
  connected: boolean;
  siteUrl?: string;
  clicks?: number;
  impressions?: number;
  ctr?: string | number;
  avgPosition?: string | number;
  topQueries?: Array<{ query: string; clicks: number; impressions: number; ctr: string | number; position: string | number }>;
  topPages?: Array<{ page: string; clicks: number; impressions: number }>;
}

export async function getSearchConsoleData(): Promise<SearchConsoleData> {
  const res = await fetch("/api/search-console", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load Search Console data (${res.status})`);
  return (await res.json()) as SearchConsoleData;
}
