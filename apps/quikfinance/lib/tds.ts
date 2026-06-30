export { isIndia } from "@/lib/gst";

export const TDS_ACTS = [
  { value: "new_2025", label: "New Income Tax Act 2025" },
  { value: "old_1961", label: "Old Income Tax Act 1961" }
] as const;

export function tdsActLabel(value: string): string {
  return TDS_ACTS.find((a) => a.value === value)?.label ?? value;
}

/** Common TDS sections per Act (Tax Type in the New TDS form). */
export const TDS_SECTIONS: Record<string, { value: string; label: string }[]> = {
  new_2025: [
    { value: "393(1) SI1(ii)", label: "Commission or Brokerage — 393(1) SI1(ii)" },
    { value: "393(1) SI5(iii)", label: "Interest other than securities — 393(1) SI5(iii)" },
    { value: "393(1) SI6(i)D(a)", label: "Payment to contractors (HUF/Indiv) — 393(1) SI6(i)D(a)" },
    { value: "393(1) SI6(ii)", label: "Payment to contractors (Others) — 393(1) SI6(ii)" },
    { value: "393(1) SI6(iii)D(a)", label: "Fees for technical services — 393(1) SI6(iii)D(a)" },
    { value: "393(1) SI7", label: "Dividend — 393(1) SI7" },
    { value: "393(1) SI2", label: "Rent — 393(1) SI2" },
    { value: "393(1) SI8", label: "Professional fees — 393(1) SI8" }
  ],
  old_1961: [
    { value: "194C", label: "194C — Payment to contractors" },
    { value: "194H", label: "194H — Commission or brokerage" },
    { value: "194I", label: "194I — Rent" },
    { value: "194J", label: "194J — Professional / technical fees" },
    { value: "194A", label: "194A — Interest other than securities" },
    { value: "194", label: "194 — Dividend" }
  ]
};
