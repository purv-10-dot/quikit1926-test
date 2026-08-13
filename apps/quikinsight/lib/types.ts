export interface KPIMetric {
  label: string;
  value: string;
  rawValue: number;
  delta: number;
  deltaDirection: "up" | "down";
  unit: "number" | "currency" | "shortNumber";
}

export interface FunnelStep {
  label: string;
  value: number;
  color: string;
}

export interface Channel {
  name: string;
  reach: number;
  engagePercent: number | null;
  traffic: number;
  leads: number;
  cost: number | null;
  roi: number;
  status: "green" | "amber" | "red";
}

export interface ContentItem {
  category: string;
  score: number;
}

export interface Post {
  rank: number;
  title: string;
  reach: number;
  leads: number;
  source?: "manual" | "facebook" | "instagram" | "youtube";
}

export interface DataSources {
  kpis:       "google_sheets" | "mock";
  webTraffic: "ga4"           | "mock";
  facebook:   "meta"          | "mock";
  instagram:  "meta"          | "mock";
  youtube:    "youtube"       | "mock";
}

export interface GBPStats {
  searches: number;
  calls: number;
  reviews: number;
  directions: number;
  rating: number;
  websiteClicks: number;
}

export interface Product {
  name: string;
  reach: number;
  leads?: number;
  trials?: number;
  revenue?: number;
}

export interface TeamMember {
  team: string;
  targetLabel: string;
  target: number;
  actual: number;
}

export interface ActionItem {
  message: string;
  status: "red" | "amber" | "green";
}

export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  views: number;
  watchMinutes: number;
  likes: number;
  comments: number;
}

export interface YouTubeAnalytics {
  views: number;
  watchMinutes: number;
  avgViewDurationSeconds: number;
  subscribersGained: number;
  likes: number;
  comments: number;
  viewsDeltaPercent: number;
}

export interface YouTubeChannelStats {
  subscribers: number;
  totalViews: number;
  videoCount: number;
}

export interface YouTubeData {
  channelStats: YouTubeChannelStats;
  analytics: YouTubeAnalytics;
  topVideos: (YouTubeVideo & { avgViewDuration?: number })[];
  dailyTrend: Array<{ date: string; views: number; watchMinutes: number }>;
  trafficSources: Array<{ source: string; views: number; percent: number }>;
  source: "live" | "fallback";
  reason?: string;
}

export interface MetaSocialPost {
  id: string;
  platform: "facebook" | "instagram";
  message: string;
  thumbnail?: string;
  timestamp: string;
  reach: number;
  engagement: number;
  likes?: number;
  comments?: number;
  clicks?: number;
}

export interface FacebookPageData {
  reach: number;
  impressions: number;
  engagedUsers: number;
  postEngagements: number;
  fans: number;
  engagementRate: string;
  topPosts: MetaSocialPost[];
}

export interface InstagramData {
  reach: number;
  impressions: number;
  profileViews: number;
  accountsEngaged: number;
  engagementRate: string;
  topPosts: MetaSocialPost[];
}

export interface MetaData {
  facebook: FacebookPageData;
  instagram: InstagramData;
  combinedReach: number;
  combinedEngagement: number;
  source: "live" | "fallback";
  reason?: string;
  noPage?: boolean;
  pageName?: string;
  igConnected?: boolean;
  userName?: string;
}

export interface WebTrafficChannel {
  channel: string;
  sessions: number;
  users: number;
  newUsers: number;
  bounceRate: number;
}

export interface WebTrafficData {
  totalSessions: number;
  totalUsers: number;
  deltaPercent: number;
  source: "ga4" | "fallback";
  reason?: string;
  channelBreakdown: WebTrafficChannel[];
  weeklyTrend: Array<{ date: string; sessions: number }>;
}

export interface DashboardData {
  week: string;
  kpis: KPIMetric[];
  funnel: FunnelStep[];
  channels: Channel[];
  content: ContentItem[];
  topPosts: Post[];
  gbp: GBPStats;
  products: Product[];
  team: TeamMember[];
  actions: ActionItem[];
  alerts: number;
  lastUpdated: string;
  webTraffic?: WebTrafficData;
  metaData?: MetaData;
  youTubeData?: YouTubeData;
  dataSources?: DataSources;
  fetchDurationMs?: number;
  platforms?: PlatformsBundle;
  connectionsMeta?: ConnectionsMeta;
}

// ─── Per-platform analytics bundle (powers the platform-wise pages) ───────────

export interface GA4Analytics {
  totalSessions: number;
  totalUsers: number;
  deltaPercent: number;
  channelBreakdown: WebTrafficChannel[];
  weeklyTrend: Array<{ date: string; sessions: number }>;

  // Rich GA4-native dashboard fields
  activeUsers: number;
  newUsers: number;
  eventCount: number;
  keyEvents: number;
  avgEngagementTime: number; // seconds per active user
  dailyTrend: Array<{ date: string; activeUsers: number; eventCount: number; newUsers: number }>;
  prevDailyTrend: Array<{ date: string; activeUsers: number }>;
  topCountries: Array<{ country: string; activeUsers: number }>;
  topPages: Array<{ title: string; views: number }>;
  topEvents: Array<{ name: string; value: number }>;
  realtime: {
    activeUsers: number;
    byCountry: Array<{ country: string; activeUsers: number }>;
    perMinute: number[];
  };
}

export interface GscRow {
  clicks:      number;
  impressions: number;
  ctr:         string;
  position:    string;
}

export interface GscAnalytics {
  clicks:       number;
  impressions:  number;
  ctr:          string;
  avgPosition:  string;
  siteUrl?:     string;
  topQueries:   Array<GscRow & { query:   string }>;
  topPages:     Array<GscRow & { page:    string }>;
  topCountries: Array<GscRow & { country: string }>;
  topDevices:   Array<GscRow & { device:  string }>;
  dailyTrend:   Array<{ date: string; clicks: number; impressions: number }>;
}

export interface LinkedInAnalytics {
  followers: number;
  impressions: number;
  engagements: number;
  reach: number;
  engagementRate: string;
  organizationName: string;
}

export interface CrmAnalytics {
  totalContacts?: number;
  leads?: number;
  pipeline: number;
  revenue: number;
  opportunities?: number;
}

export interface MailchimpAnalytics {
  subscribers: number;
  openRate: number;
  clickRate: number;
  campaigns: number;
}

export interface DynamicsAnalytics {
  totalAccounts: number;
  openOpportunities: number;
  pipeline: number;
  revenue: number;
}

export interface HubSpotAnalytics {
  totalContacts: number;
  recentContacts: number;   // created in last 7 days
  totalDeals: number;
  openDeals: number;
  wonDeals: number;
  lostDeals: number;
  pipeline: number;         // value of open deals
  revenue: number;          // value of won deals
  leads: number;            // for the overview KPI
  winRate: number;          // won / (won + lost) %, 0 if none closed
  stages: Array<{ label: string; count: number; value: number }>;
  dealsByMonth: Array<{ month: string; count: number; value: number }>;
}

export interface QuikCRMAnalytics {
  leads:       number; // new contacts in last 7 days
  totalLeads:  number; // all-time contacts
  pipeline:    number; // sum of open deal amounts
  revenue:     number; // sum of won deal amounts
  openDeals:   number;
  wonDeals:    number;
  lostDeals:   number;
  recentDeals: Array<{ id: string; amount: number; name?: string; status: string; date?: string }>;
  dealStages:  Array<{ stage: string; count: number; value: number }>;
}

export interface PlatformsBundle {
  ga4?:        GA4Analytics;
  gsc?:        GscAnalytics;
  youtube?:    YouTubeData;
  gbp?:        GBPStats;
  meta?:       MetaData;
  linkedin?:   LinkedInAnalytics;
  hubspot?:    HubSpotAnalytics;
  salesforce?: CrmAnalytics;
  mailchimp?:  MailchimpAnalytics;
  dynamics?:   DynamicsAnalytics;
  zoho?:       CrmAnalytics;
  quikcrm?:    QuikCRMAnalytics;
}

// ─── Selectable entities (GA4 property, GSC site, YT channel, GBP profile…) ───
// Drives the post-auth selection modal and the per-screen picker button.

export interface PlatformSelectorOption {
  id:   string;
  name: string;
}

export interface PlatformSelector {
  prismaPlatform: string;                 // e.g. "GOOGLE_ANALYTICS"
  entityLabel:    string;                 // e.g. "Property", "Site", "Channel"
  idField:        string;                 // metadata key holding the selected id
  nameField?:     string;                 // metadata key holding the selected name
  selectedId:     string;
  selectedName?:  string;
  options:        PlatformSelectorOption[];
}

export type ConnectionsMeta = Partial<Record<keyof PlatformsBundle, PlatformSelector>>;
