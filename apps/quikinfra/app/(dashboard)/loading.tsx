import { MasterPageShimmer } from "@/components/Shimmer";

/**
 * Default loader for any page under the dashboard group that doesn't
 * define its own `loading.tsx`. Renders immediately on navigation so
 * the sidebar click feels responsive even on slow API roundtrips.
 */
export default function Loading() {
  return <MasterPageShimmer rows={6} columns={5} />;
}
