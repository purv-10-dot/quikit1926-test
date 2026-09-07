import { withSample } from "./sample";
import { SEARCH_CONSOLE_SAMPLE } from "@/lib/mock/platformSamples";
import { encodePeriod } from "@/lib/period/resolve";
import type { PeriodSpec } from "@/lib/period/types";
export interface SearchConsoleData {
  connected: boolean;
  /** Set when these are sample figures, not the workspace's own. */
  isSampleData?: boolean;
  siteUrl?: string;
  clicks?: number;
  impressions?: number;
  ctr?: string | number;
  avgPosition?: string | number;
  topQueries?: Array<{ query: string; clicks: number; impressions: number; ctr: string | number; position: string | number }>;
  topPages?: Array<{ page: string; clicks: number; impressions: number }>;
}

export async function getSearchConsoleData(period?: PeriodSpec | number): Promise<SearchConsoleData> {
  const qs =
    period == null ? "" :
    typeof period === "number" ? `?days=${period}` :
    `?${encodePeriod(period).toString()}`;
  const res = await fetch(`/api/search-console${qs}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load Search Console data (${res.status})`);
  const live = (await res.json()) as SearchConsoleData;
  // Not connected -> representative sample data + a banner on the page.
  return withSample<SearchConsoleData>(live, SEARCH_CONSOLE_SAMPLE);
}
