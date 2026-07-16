import type { Asset } from "@/types/asset";
import type { AssetRequest } from "@/types/assetRequest";

export type FulfilAssetOption = { value: string; label: string; sublabel: string };

/**
 * Options for the physical Fulfil picker: only Available stock whose category
 * matches the request's item type — so a Laptop request can't be fulfilled with
 * a Chair. When the request has no categoryId (legacy rows), no category
 * constraint is applied. Serial number is surfaced as the sublabel so an admin
 * can tell apart identical-model units. The API enforces the same category match
 * server-side; this only scopes what the picker offers.
 */
export function buildFulfilAssetOptions(
  assets: Asset[],
  request: Pick<AssetRequest, "categoryId">,
): FulfilAssetOption[] {
  return assets
    .filter((a) => a.assetStatus === "Available")
    .filter((a) => !request.categoryId || a.categoryId === request.categoryId)
    .map((a) => ({ value: a.id, label: a.itemName, sublabel: a.serialNumber }));
}
