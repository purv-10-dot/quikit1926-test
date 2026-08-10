import type { ExplorerModuleKey } from "./explorer-location";

/** Client-safe module labels — no Prisma or server imports. */
const MODULE_LABELS: Record<ExplorerModuleKey, string> = {
  lead: "Leads",
  account: "Accounts",
  opportunity: "Opportunities",
  quote: "Quotes",
  order: "Orders",
  global: "Global",
};

export function getModuleLabel(module: ExplorerModuleKey): string {
  return MODULE_LABELS[module];
}

export const EXPLORER_MODULE_ORDER: ExplorerModuleKey[] = [
  "lead",
  "account",
  "opportunity",
  "quote",
  "order",
  "global",
];
