import type { WebTrafficChannel } from "@/lib/types";

// Shared GA4 result shapes. The live fetch implementation lives in
// `lib/connectors/google.ts` (OAuth per-user); this module only owns the types.

export type GA4DailyPoint = { date: string; activeUsers: number; eventCount: number; newUsers: number };
export type GA4NamedCount = { name: string; value: number };

export type GA4DataResult = {
  totalSessions: number;
  totalUsers: number;
  channelBreakdown: WebTrafficChannel[];
  weeklyTrend: Array<{ date: string; sessions: number }>;

  // Rich summary metrics (GA4-native dashboard parity)
  activeUsers: number;
  newUsers: number;
  eventCount: number;
  keyEvents: number;
  avgEngagementTime: number; // seconds per active user
  /** Session-weighted average across channels, 0–1 (not a percentage). */
  bounceRate: number;

  // Daily trend for current + previous comparison period
  dailyTrend: GA4DailyPoint[];
  prevDailyTrend: Array<{ date: string; activeUsers: number }>;

  // Breakdowns
  topCountries: Array<{ country: string; activeUsers: number }>;
  topPages: Array<{ title: string; views: number }>;
  topEvents: GA4NamedCount[];

  // Realtime (last 30 minutes)
  realtime: {
    activeUsers: number;
    byCountry: Array<{ country: string; activeUsers: number }>;
    perMinute: number[]; // index 0 = 29 min ago … 29 = now
  };
};

export type WeekOverWeekResult = {
  currentSessions: number;
  previousSessions: number;
  deltaPercent: number;
};
