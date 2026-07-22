export interface IndiaHoliday {
  id: string;
  date: Date;
  name: string;
}

// Per-year memo so month navigation doesn't recompute. date-holidays is
// dynamic-imported so its all-country dataset stays out of the main bundle.
const cache = new Map<number, IndiaHoliday[]>();

export async function loadIndiaHolidays(year: number): Promise<IndiaHoliday[]> {
  const cached = cache.get(year);
  if (cached) return cached;
  const { default: Holidays } = await import("date-holidays");
  const hd = new Holidays("IN");
  const raw = (hd.getHolidays(year) ?? []) as Array<{
    date: string;
    start: Date;
    name: string;
    type: string;
  }>;
  const list = raw
    .filter((h) => h.type === "public")
    .map((h) => ({ id: `hol-${h.date}`, date: new Date(h.start), name: h.name }));
  cache.set(year, list);
  return list;
}
