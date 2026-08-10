import type { MemberOkrs } from "@/types";

/** GET /okrs — real data from a connected OKR tool (empty until one is connected). */
export async function getOkrs(): Promise<MemberOkrs[]> {
  const res = await fetch("/api/okrs", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load OKRs (${res.status})`);
  return (await res.json()) as MemberOkrs[];
}
