import type { Asset } from "@/types/asset";
import type { AssetRequest } from "@/types/assetRequest";

/**
 * Assets an admin may hand over for a physical request: only Available stock
 * whose category matches the request's item type — so a Laptop request can't be
 * assigned a Chair. When the request has no categoryId (legacy rows), no
 * category constraint is applied. Returns the full asset rows so the Assign
 * picker can show name / code / serial / condition. The API enforces the same
 * category match server-side; this only scopes what the picker offers.
 */
export function selectAssignableAssets(
  assets: Asset[],
  request: Pick<AssetRequest, "categoryId">,
): Asset[] {
  return assets
    .filter((a) => a.assetStatus === "Available")
    .filter((a) => !request.categoryId || a.categoryId === request.categoryId);
}
