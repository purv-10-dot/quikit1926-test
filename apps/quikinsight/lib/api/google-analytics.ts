export interface GA4ChannelBreakdown {
  channel: string;
  sessions: number;
  users: number;
  newUsers: number;
  bounceRate: number;
}

export interface GA4DailyPoint {
  date: string;
  activeUsers: number;
  eventCount: number;
  newUsers: number;
}

export interface GoogleAnalyticsData {
  connected: boolean;
  totalSessions?: number;
  totalUsers?: number;
  activeUsers?: number;
  newUsers?: number;
  eventCount?: number;
  keyEvents?: number;
  avgEngagementTime?: number;
  channelBreakdown?: GA4ChannelBreakdown[];
  dailyTrend?: GA4DailyPoint[];
  topPages?: Array<{ title: string; views: number }>;
  topCountries?: Array<{ country: string; activeUsers: number }>;
  topEvents?: Array<{ name: string; value: number }>;
  realtime?: { activeUsers: number; byCountry: Array<{ country: string; activeUsers: number }>; perMinute: number[] };
}

export async function getGoogleAnalyticsData(): Promise<GoogleAnalyticsData> {
  const res = await fetch("/api/google-analytics", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load Google Analytics data (${res.status})`);
  return (await res.json()) as GoogleAnalyticsData;
}
