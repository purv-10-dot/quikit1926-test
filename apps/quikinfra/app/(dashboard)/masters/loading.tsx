import { MasterPageShimmer } from "@/components/Shimmer";

/**
 * Route-level loader for every page under /masters/*.
 * Next.js renders this instantly during navigation — before the child
 * page component mounts or its data fetch begins — so the sidebar
 * click feels responsive even when the API is slow.
 */
export default function Loading() {
  return <MasterPageShimmer rows={8} columns={6} />;
}
