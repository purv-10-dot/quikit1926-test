/**
 * Data-provider registry — maps an app slug to its DataProvider. Adding a new
 * source app (QuikCRM, QuikHRMS, …) is a new provider + one entry here; every
 * caller (API routes, condition lookups) stays unchanged.
 */
import type { DataProvider } from "./types";
import { quikscaleProvider } from "./quikscale";

const PROVIDERS: Record<string, DataProvider> = {
  quikscale: quikscaleProvider,
};

export function getProvider(appSlug: string): DataProvider | undefined {
  return PROVIDERS[appSlug];
}

export { PROVIDERS };
