/**
 * Holiday data for 8 regions — year-agnostic MM-DD format.
 *
 * Variable-date holidays (Eid, Holi, Diwali, Easter etc.) use 2026 dates.
 * Update MM-DD values when the new Islamic / Hindu calendar dates are known
 * for the following year.
 *
 * 2026 key movable dates used:
 *   Eid ul-Fitr         03-20  (lunar)
 *   Eid ul-Adha         05-27  (lunar)
 *   Islamic New Year    06-16  (lunar)
 *   Eid Milad-un-Nabi   08-25  (lunar)
 *   Holi                03-05  (Hindu lunar)
 *   Dussehra            10-14  (Hindu lunar)
 *   Navratri starts     10-04  (Hindu lunar)
 *   Raksha Bandhan      08-21  (Hindu lunar)
 *   Diwali              10-28  (Hindu lunar)
 *   Onam                09-10  (Hindu solar)
 *   Vesak (Sri Lanka)   05-12  (Buddhist lunar)
 *   Easter Monday (FR)  04-06
 */

export type HolidayType = "national" | "religious" | "cultural";

export interface Holiday {
  /** MM-DD format — year-agnostic */
  date: string;
  name: string;
  type: HolidayType;
  country: string;
}

export const HOLIDAYS: Holiday[] = [
  // ─── India ────────────────────────────────────────────────────────────────
  { date: "01-01", name: "New Year's Day",       type: "cultural",  country: "IN" },
  { date: "01-26", name: "Republic Day",          type: "national",  country: "IN" },
  { date: "03-05", name: "Holi",                  type: "cultural",  country: "IN" },
  { date: "03-20", name: "Eid ul-Fitr",           type: "religious", country: "IN" },
  { date: "05-27", name: "Eid ul-Adha",           type: "religious", country: "IN" },
  { date: "08-15", name: "Independence Day",      type: "national",  country: "IN" },
  { date: "08-21", name: "Raksha Bandhan",        type: "cultural",  country: "IN" },
  { date: "09-10", name: "Onam",                  type: "cultural",  country: "IN" },
  { date: "10-02", name: "Gandhi Jayanti",        type: "national",  country: "IN" },
  { date: "10-04", name: "Navratri",              type: "religious", country: "IN" },
  { date: "10-14", name: "Dussehra",              type: "religious", country: "IN" },
  { date: "10-28", name: "Diwali",                type: "religious", country: "IN" },
  { date: "12-25", name: "Christmas",             type: "religious", country: "IN" },

  // ─── Pakistan ─────────────────────────────────────────────────────────────
  { date: "02-05", name: "Kashmir Day",           type: "national",  country: "PK" },
  { date: "03-20", name: "Eid ul-Fitr",           type: "religious", country: "PK" },
  { date: "03-23", name: "Pakistan Day",          type: "national",  country: "PK" },
  { date: "05-27", name: "Eid ul-Adha",           type: "religious", country: "PK" },
  { date: "08-14", name: "Independence Day",      type: "national",  country: "PK" },
  { date: "08-25", name: "Eid Milad-un-Nabi",    type: "religious", country: "PK" },
  { date: "12-25", name: "Quaid-e-Azam Day",     type: "national",  country: "PK" },

  // ─── Sri Lanka ────────────────────────────────────────────────────────────
  { date: "02-04", name: "Independence Day",      type: "national",  country: "LK" },
  { date: "04-13", name: "Sinhala & Tamil New Year", type: "cultural", country: "LK" },
  { date: "05-12", name: "Vesak Full Moon",       type: "religious", country: "LK" },
  { date: "10-28", name: "Deepavali",             type: "religious", country: "LK" },
  { date: "12-25", name: "Christmas",             type: "religious", country: "LK" },

  // ─── Bangladesh ───────────────────────────────────────────────────────────
  { date: "02-21", name: "Language Martyrs' Day", type: "national",  country: "BD" },
  { date: "03-20", name: "Eid ul-Fitr",           type: "religious", country: "BD" },
  { date: "03-26", name: "Independence Day",      type: "national",  country: "BD" },
  { date: "04-14", name: "Bengali New Year",      type: "cultural",  country: "BD" },
  { date: "05-27", name: "Eid ul-Adha",           type: "religious", country: "BD" },
  { date: "12-16", name: "Victory Day",           type: "national",  country: "BD" },

  // ─── USA ──────────────────────────────────────────────────────────────────
  { date: "01-01", name: "New Year's Day",        type: "national",  country: "US" },
  { date: "01-19", name: "Martin Luther King Day",type: "national",  country: "US" },
  { date: "02-14", name: "Valentine's Day",       type: "cultural",  country: "US" },
  { date: "02-16", name: "Presidents' Day",       type: "national",  country: "US" },
  { date: "05-25", name: "Memorial Day",          type: "national",  country: "US" },
  { date: "07-04", name: "Independence Day",      type: "national",  country: "US" },
  { date: "09-07", name: "Labor Day",             type: "national",  country: "US" },
  { date: "10-31", name: "Halloween",             type: "cultural",  country: "US" },
  { date: "11-26", name: "Thanksgiving",          type: "national",  country: "US" },
  { date: "12-25", name: "Christmas",             type: "national",  country: "US" },

  // ─── UAE ──────────────────────────────────────────────────────────────────
  { date: "01-01", name: "New Year's Day",        type: "national",  country: "AE" },
  { date: "03-20", name: "Eid ul-Fitr",           type: "religious", country: "AE" },
  { date: "05-27", name: "Eid ul-Adha",           type: "religious", country: "AE" },
  { date: "06-16", name: "Islamic New Year",      type: "religious", country: "AE" },
  { date: "08-25", name: "Prophet's Birthday",    type: "religious", country: "AE" },
  { date: "12-02", name: "UAE National Day",      type: "national",  country: "AE" },

  // ─── Russia ───────────────────────────────────────────────────────────────
  { date: "01-01", name: "New Year's Day",        type: "national",  country: "RU" },
  { date: "01-07", name: "Orthodox Christmas",    type: "religious", country: "RU" },
  { date: "02-23", name: "Defender of the Fatherland Day", type: "national", country: "RU" },
  { date: "03-08", name: "International Women's Day", type: "national", country: "RU" },
  { date: "05-01", name: "Spring & Labour Day",   type: "national",  country: "RU" },
  { date: "05-09", name: "Victory Day",           type: "national",  country: "RU" },
  { date: "06-12", name: "Russia Day",            type: "national",  country: "RU" },
  { date: "11-04", name: "National Unity Day",    type: "national",  country: "RU" },

  // ─── France ───────────────────────────────────────────────────────────────
  { date: "01-01", name: "New Year's Day",        type: "national",  country: "FR" },
  { date: "04-06", name: "Easter Monday",         type: "religious", country: "FR" },
  { date: "05-01", name: "Labour Day",            type: "national",  country: "FR" },
  { date: "05-08", name: "Victory in Europe Day", type: "national",  country: "FR" },
  { date: "05-14", name: "Ascension Day",         type: "religious", country: "FR" },
  { date: "07-14", name: "Bastille Day",          type: "national",  country: "FR" },
  { date: "08-15", name: "Assumption of Mary",    type: "religious", country: "FR" },
  { date: "11-01", name: "All Saints' Day",       type: "national",  country: "FR" },
  { date: "12-25", name: "Christmas",             type: "national",  country: "FR" },
];

/** Look up holidays for a given country on a specific date (by MM-DD). */
export function getHolidaysForDate(date: Date, countryCode: string | null): Holiday[] {
  if (!countryCode) return [];
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const key = `${mm}-${dd}`;
  return HOLIDAYS.filter((h) => h.country === countryCode && h.date === key);
}

export const COUNTRY_OPTIONS = [
  { label: "None",        code: null   },
  { label: "India",       code: "IN"   },
  { label: "Pakistan",    code: "PK"   },
  { label: "Sri Lanka",   code: "LK"   },
  { label: "Bangladesh",  code: "BD"   },
  { label: "USA",         code: "US"   },
  { label: "UAE",         code: "AE"   },
  { label: "Russia",      code: "RU"   },
  { label: "France",      code: "FR"   },
] as const;

export const HOLIDAY_DOT_COLOR: Record<HolidayType, string> = {
  national:  "#3B82F6",  // blue
  religious: "#F59E0B",  // amber
  cultural:  "#22C55E",  // green
};
