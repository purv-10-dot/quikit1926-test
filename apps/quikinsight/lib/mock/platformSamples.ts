/**
 * ⚠️ SAMPLE DATA — shown on a platform page when that platform is NOT connected.
 *
 * These are plausible figures for a mid-size B2B marketing team, not anyone's
 * real numbers. They exist so a new signup sees what each page does before
 * connecting anything (see lib/api/sample.ts for the mechanism).
 *
 * Every page that renders these also renders <SampleDataBanner />, so the
 * numbers are never presented as the workspace's own. Keep that pairing intact.
 *
 * Values are deliberately internally consistent — CTR matches clicks over
 * impressions, ROAS matches spend against conversions — so nothing looks
 * obviously fabricated to someone reading the page carefully.
 */

export const GA4_SAMPLE = {
  totalSessions: 186_400,
  totalUsers: 94_200,
  activeUsers: 71_800,
  newUsers: 52_300,
  eventCount: 842_000,
  keyEvents: 4_180,
  avgEngagementTime: 161,
  channelBreakdown: [
    { channel: "Organic Search", sessions: 74_500, users: 41_200, newUsers: 24_800, bounceRate: 0.38 },
    { channel: "Direct", sessions: 42_100, users: 22_600, newUsers: 11_400, bounceRate: 0.44 },
    { channel: "Paid Search", sessions: 31_800, users: 16_900, newUsers: 9_800, bounceRate: 0.51 },
    { channel: "Referral", sessions: 21_300, users: 8_900, newUsers: 4_100, bounceRate: 0.35 },
    { channel: "Social", sessions: 16_700, users: 7_400, newUsers: 3_600, bounceRate: 0.58 },
  ],
  dailyTrend: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, "0")}`,
    activeUsers: 4_600 + Math.round(Math.sin(i / 2) * 900) + i * 40,
    eventCount: 54_000 + Math.round(Math.cos(i / 3) * 6_000),
    newUsers: 3_100 + Math.round(Math.sin(i / 2.5) * 500),
  })),
  topPages: [
    { title: "Home", views: 48_200 },
    { title: "Pricing", views: 21_400 },
    { title: "Product tour", views: 17_900 },
    { title: "Blog — attribution guide", views: 12_600 },
    { title: "Contact sales", views: 8_300 },
  ],
  topCountries: [
    { country: "India", activeUsers: 28_400 },
    { country: "United States", activeUsers: 21_900 },
    { country: "United Kingdom", activeUsers: 8_600 },
    { country: "Germany", activeUsers: 5_200 },
    { country: "Australia", activeUsers: 3_800 },
  ],
  topEvents: [
    { name: "page_view", value: 412_000 },
    { name: "scroll", value: 186_000 },
    { name: "session_start", value: 92_400 },
    { name: "form_start", value: 12_800 },
    { name: "generate_lead", value: 4_180 },
  ],
  realtime: {
    activeUsers: 214,
    byCountry: [
      { country: "India", activeUsers: 96 },
      { country: "United States", activeUsers: 71 },
      { country: "United Kingdom", activeUsers: 28 },
      { country: "Germany", activeUsers: 19 },
    ],
    perMinute: [12, 18, 14, 21, 17, 23, 19, 26, 22, 18, 24, 20, 15, 19, 23, 21, 17, 20, 25, 22, 18, 16, 21, 19, 23, 20, 17, 22, 24, 21],
  },
};

export const SEARCH_CONSOLE_SAMPLE = {
  siteUrl: "https://example.com/",
  clicks: 34_800,
  impressions: 912_000,
  ctr: 3.8,
  avgPosition: 12.4,
  topQueries: [
    { query: "marketing attribution software", clicks: 3_420, impressions: 64_800, ctr: 5.3, position: 4.2 },
    { query: "multi channel reporting tool", clicks: 2_180, impressions: 51_200, ctr: 4.3, position: 6.1 },
    { query: "roas dashboard", clicks: 1_940, impressions: 38_600, ctr: 5.0, position: 5.4 },
    { query: "google ads meta ads together", clicks: 1_310, impressions: 42_100, ctr: 3.1, position: 9.8 },
    { query: "cac tracking", clicks: 980, impressions: 29_400, ctr: 3.3, position: 11.2 },
  ],
  topPages: [
    { page: "/blog/attribution-guide", clicks: 6_240, impressions: 148_000 },
    { page: "/pricing", clicks: 4_180, impressions: 62_400 },
    { page: "/product/dashboards", clicks: 3_060, impressions: 71_900 },
    { page: "/blog/roas-benchmarks", clicks: 2_410, impressions: 58_200 },
    { page: "/integrations", clicks: 1_870, impressions: 33_600 },
  ],
};

export const GOOGLE_ADS_SAMPLE = {
  accountName: "Sample Ads Account",
  spend: 88_400,
  impressions: 2_140_000,
  clicks: 64_200,
  ctr: 3.0,
  cpc: 1.38,
  conversions: 1_284,
  conversionRate: 2.0,
  roas: 3.4,
  campaigns: [
    { id: "g1", name: "Brand search — core", status: "ENABLED", spend: 28_600, impressions: 620_000, clicks: 24_800, ctr: 4.0, conversions: 596, roas: 4.1 },
    { id: "g2", name: "Competitor conquest", status: "ENABLED", spend: 21_400, impressions: 512_000, clicks: 14_300, ctr: 2.8, conversions: 246, roas: 2.2 },
    { id: "g3", name: "Non-brand — solutions", status: "ENABLED", spend: 18_900, impressions: 486_000, clicks: 12_100, ctr: 2.5, conversions: 218, roas: 2.9 },
    { id: "g4", name: "Remarketing — site visitors", status: "ENABLED", spend: 11_200, impressions: 318_000, clicks: 8_400, ctr: 2.6, conversions: 152, roas: 3.8 },
    { id: "g5", name: "Performance Max — all", status: "PAUSED", spend: 8_300, impressions: 204_000, clicks: 4_600, ctr: 2.3, conversions: 72, roas: 2.6 },
  ],
};

export const META_ADS_SAMPLE = {
  accountName: "Sample Meta Ads Account",
  spend: 61_200,
  impressions: 3_480_000,
  clicks: 48_600,
  ctr: 1.4,
  cpc: 1.26,
  conversions: 874,
  roas: 3.1,
  campaigns: [
    { id: "m1", name: "LinkedIn ABM — Enterprise", status: "ACTIVE", spend: 22_400, impressions: 1_180_000, clicks: 18_200, ctr: 1.5, conversions: 342 },
    { id: "m2", name: "Retargeting — all traffic", status: "ACTIVE", spend: 16_800, impressions: 942_000, clicks: 14_100, ctr: 1.5, conversions: 268 },
    { id: "m3", name: "Instagram Reels — awareness", status: "ACTIVE", spend: 12_600, impressions: 864_000, clicks: 10_400, ctr: 1.2, conversions: 148 },
    { id: "m4", name: "Lookalike — 1% purchasers", status: "PAUSED", spend: 9_400, impressions: 494_000, clicks: 5_900, ctr: 1.2, conversions: 116 },
  ],
};

export const X_ADS_SAMPLE = {
  accountName: "Sample X Ads Account",
  spend: 14_800,
  impressions: 682_000,
  clicks: 9_400,
  ctr: 1.4,
  cpc: 1.57,
  conversions: 186,
  campaigns: [
    { id: "x1", name: "Launch week — promoted posts", status: "ACTIVE", spend: 6_200, impressions: 284_000, clicks: 4_100, ctr: 1.4 },
    { id: "x2", name: "Follower growth — dev audience", status: "ACTIVE", spend: 4_900, impressions: 236_000, clicks: 3_200, ctr: 1.4 },
    { id: "x3", name: "Webinar promotion", status: "COMPLETED", spend: 3_700, impressions: 162_000, clicks: 2_100, ctr: 1.3 },
  ],
};

export const X_SAMPLE = {
  handle: "@yourcompany",
  followers: 8_240,
  following: 412,
  tweets: 1_860,
  impressions: 214_000,
  engagements: 9_600,
  engagementRate: 4.5,
  recentPosts: [
    { id: "p1", text: "We shipped multi-touch attribution across paid and organic. Here's how it works →", impressions: 42_100, likes: 186, retweets: 42, replies: 18, publishedAt: "2026-08-11T09:00:00Z" },
    { id: "p2", text: "CAC is up across the board this quarter. Three things we changed that actually moved it.", impressions: 31_800, likes: 142, retweets: 38, replies: 24, publishedAt: "2026-08-08T09:00:00Z" },
    { id: "p3", text: "Your ROAS dashboard is lying to you if it doesn't account for view-through. A thread.", impressions: 28_400, likes: 214, retweets: 67, replies: 31, publishedAt: "2026-08-05T09:00:00Z" },
  ],
};

export const YOUTUBE_SAMPLE = {
  channelName: "Sample Channel",
  subscribers: 12_400,
  totalViews: 486_000,
  totalVideos: 84,
  watchTimeHours: 21_600,
  avgViewDuration: 164,
  topVideos: [
    { title: "Marketing attribution explained in 8 minutes", views: 62_400, likes: 2_180, comments: 146, publishedAt: "2026-05-14" },
    { title: "How we cut CAC by 31% in one quarter", views: 48_900, likes: 1_840, comments: 212, publishedAt: "2026-06-02" },
    { title: "Google Ads + Meta Ads: one dashboard", views: 34_200, likes: 1_120, comments: 88, publishedAt: "2026-06-28" },
    { title: "The ROAS metric nobody measures correctly", views: 28_600, likes: 964, comments: 74, publishedAt: "2026-07-15" },
  ],
};

export const FACEBOOK_SAMPLE = {
  pageName: "Sample Page",
  fans: 42_100,
  reach: 210_000,
  impressions: 384_000,
  engagedUsers: 18_400,
  postEngagements: 24_600,
  engagementRate: "3.8",
  topPosts: [
    { id: "f1", message: "Our Q3 marketing benchmark report is live — 400+ teams surveyed.", timestamp: "2026-08-10T10:00:00Z", reach: 48_200, engagement: 3_140, clicks: 862 },
    { id: "f2", message: "Behind the scenes: how our team runs weekly channel reviews.", timestamp: "2026-08-06T10:00:00Z", reach: 34_600, engagement: 2_280, clicks: 514 },
    { id: "f3", message: "Three attribution mistakes that quietly inflate your ROAS.", timestamp: "2026-08-01T10:00:00Z", reach: 29_800, engagement: 1_960, clicks: 448 },
  ],
};

export const INSTAGRAM_SAMPLE = {
  username: "yourcompany",
  followers: 68_000,
  reach: 340_000,
  impressions: 512_000,
  profileViews: 14_800,
  accountsEngaged: 26_400,
  engagementRate: "5.6",
  topPosts: [
    { id: "i1", message: "Attribution, explained in one chart. Save this one.", timestamp: "2026-08-12T10:00:00Z", reach: 84_200, engagement: 6_140, mediaType: "CAROUSEL_ALBUM" },
    { id: "i2", message: "What a healthy paid/organic mix actually looks like.", timestamp: "2026-08-07T10:00:00Z", reach: 62_800, engagement: 4_320, mediaType: "IMAGE" },
    { id: "i3", message: "60 seconds: reading your ROAS the right way.", timestamp: "2026-08-03T10:00:00Z", reach: 58_400, engagement: 5_880, mediaType: "VIDEO" },
  ],
};

export const LINKEDIN_SAMPLE = {
  organizationName: "Sample Company",
  websiteUrl: "https://example.com",
  description: "Marketing intelligence for teams that run more than one channel.",
  specialties: ["Marketing analytics", "Attribution", "Reporting"],
  followers: 15_400,
  paidFollowers: 1_240,
  impressions: 428_000,
  engagements: 21_000,
  reach: 52_000,
  engagementRate: "4.9",
  clicks: 12_400,
  shares: 1_180,
  reactions: 6_840,
  comments: 596,
  pageViews: 24_800,
  uniqueVisitors: 14_200,
  mobilePageViews: 9_600,
  videoViews: 38_400,
  videoWatchTimeSeconds: 486_000,
};

export const MAILCHIMP_SAMPLE = {
  audienceName: "Sample Audience",
  totalContacts: 42_000,
  totalCampaigns: 38,
  avgOpenRate: 28.4,
  avgClickRate: 4.1,
  unsubscribes: 126,
  recentCampaigns: [
    { id: "mc1", title: "Monthly product newsletter — July", sentAt: "2026-07-28", recipients: 18_400, openRate: 31.2, clickRate: 5.4 },
    { id: "mc2", title: "Lifecycle nurture — trial signups", sentAt: "2026-07-21", recipients: 9_200, openRate: 26.8, clickRate: 4.1 },
    { id: "mc3", title: "Re-engagement — dormant leads", sentAt: "2026-07-14", recipients: 6_100, openRate: 19.4, clickRate: 2.6 },
    { id: "mc4", title: "Webinar invite — Q3 pipeline series", sentAt: "2026-07-07", recipients: 5_300, openRate: 34.7, clickRate: 7.2 },
  ],
};

export const KLAVIYO_SAMPLE = {
  listName: "Sample List",
  totalProfiles: 38_600,
  activeProfiles: 24_800,
  totalFlows: 14,
  avgOpenRate: 31.6,
  avgClickRate: 5.2,
  revenue: 184_000,
  recentCampaigns: [
    { id: "k1", name: "Winback — 90 day lapsed", sentAt: "2026-07-26", recipients: 8_400, openRate: 24.1, clickRate: 3.8, revenue: 32_400 },
    { id: "k2", name: "New arrivals — August", sentAt: "2026-07-19", recipients: 14_200, openRate: 34.8, clickRate: 6.1, revenue: 68_200 },
    { id: "k3", name: "Abandoned cart — flow", sentAt: "2026-07-12", recipients: 4_600, openRate: 42.3, clickRate: 9.4, revenue: 51_800 },
  ],
};

export const INSTANTLY_SAMPLE = {
  workspaceName: "Sample Workspace",
  totalCampaigns: 9,
  emailsSent: 24_800,
  openRate: 42.6,
  replyRate: 6.8,
  bounceRate: 1.9,
  recentCampaigns: [
    { id: "in1", name: "Outbound — SaaS marketing leads", status: "ACTIVE", sent: 9_400, opened: 4_180, replied: 682, bounced: 178 },
    { id: "in2", name: "Outbound — agency partnerships", status: "ACTIVE", sent: 6_200, opened: 2_640, replied: 414, bounced: 116 },
    { id: "in3", name: "Follow-up — webinar no-shows", status: "PAUSED", sent: 4_100, opened: 1_920, replied: 286, bounced: 74 },
  ],
};

/**
 * CRM sample — powers the Pipeline / Deals section of the generated report when
 * no CRM is connected.
 *
 * Internally consistent, so nothing looks fabricated to a careful reader:
 *   openDeals 96  = the four open stages (38+27+19+12)
 *   totalDeals 148 = open 96 + won 34 + lost 18
 *   pipeline 1.284M = the four open stages' value
 *   winRate 65.4% = 34 / (34 + 18)
 * The stage list deliberately has no "Closed lost" row (mirroring how CRMs
 * usually chart a pipeline), so stage counts sum to 130, not totalDeals.
 */
export const CRM_SAMPLE = {
  totalContacts: 4_820,
  recentContacts: 312,
  totalDeals: 148,
  openDeals: 96,
  wonDeals: 34,
  lostDeals: 18,
  pipeline: 1_284_000,
  revenue: 486_000,
  leads: 412,
  winRate: 65.4,
  stages: [
    { label: "New",           count: 38, value: 402_000 },
    { label: "Qualified",     count: 27, value: 386_000 },
    { label: "Proposal",      count: 19, value: 318_000 },
    { label: "Negotiation",   count: 12, value: 178_000 },
    { label: "Closed won",    count: 34, value: 486_000 },
  ],
  dealsByMonth: [
    { month: "Mar", count: 18, value: 168_000 },
    { month: "Apr", count: 22, value: 214_000 },
    { month: "May", count: 26, value: 248_000 },
    { month: "Jun", count: 29, value: 292_000 },
    { month: "Jul", count: 31, value: 324_000 },
    { month: "Aug", count: 22, value: 238_000 },
  ],
};
