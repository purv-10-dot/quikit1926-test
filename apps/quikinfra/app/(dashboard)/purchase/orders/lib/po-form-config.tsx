"use client";

import type { QuickCreateConfig } from "@/components/QuickCreateDrawer";
import type { PoFormConfigDeps } from "./po-form-deps";
import { buildMainFields } from "./po-form-fields";
import { buildVendorsSection, buildContactsSection } from "./po-form-vendors";
import { buildLineItems } from "./po-form-line-items";

export type { PoFormConfigDeps } from "./po-form-deps";

/**
 * Assemble the QuickCreateConfig for the PO create/edit drawer from the
 * page-derived deps. The field groups live in sibling builder modules
 * (main-fields / vendors / line-items) so no single file is a wall of config.
 */
export function buildPoFormConfig(deps: PoFormConfigDeps): QuickCreateConfig {
  return {
    title: "New Purchase Order",
    subtitle:
      "Standard POs trace back to an Indent / RFQ. Tick Urgent Local to raise one directly for an emergency site need.",
    apiEndpoint: "/api/purchase/orders",
    onSuccess: () => deps.qc.invalidateQueries({ queryKey: ["purchase-orders"] }),
    initialLines: deps.prefill?.lines,
    fields: buildMainFields(deps),
    secondaryLineItems: buildVendorsSection(deps),
    tertiaryLineItems: buildContactsSection(),
    lineItems: buildLineItems(deps),
  };
}
