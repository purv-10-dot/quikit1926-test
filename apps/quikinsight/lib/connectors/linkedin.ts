import axios from "axios";
import { prisma } from "@/lib/prisma";
import type { LinkedInMetadata } from "@/lib/types/connections";
import { NoConnectionError } from "./errors";

const LI_VERSION = "202607";

// ── LinkedIn URN ID → human-readable label maps ──────────────────────────────

const LI_INDUSTRY: Record<string, string> = {
  "1": "Defense & Space", "3": "Computer Hardware", "4": "Computer Software", "5": "Computer Networking",
  "6": "Internet", "7": "Semiconductors", "8": "Telecommunications", "9": "Law Practice",
  "10": "Legal Services", "11": "Management Consulting", "12": "Biotechnology", "13": "Medical Practice",
  "14": "Hospital & Health Care", "15": "Pharmaceuticals", "16": "Veterinary", "17": "Medical Devices",
  "18": "Cosmetics", "19": "Apparel & Fashion", "20": "Sporting Goods", "21": "Tobacco",
  "22": "Supermarkets", "23": "Food Production", "24": "Consumer Electronics", "25": "Consumer Goods",
  "26": "Furniture", "27": "Retail", "28": "Entertainment", "29": "Gambling & Casinos",
  "30": "Leisure, Travel & Tourism", "31": "Hospitality", "32": "Restaurants", "33": "Sports",
  "34": "Food & Beverages", "35": "Motion Pictures & Film", "36": "Broadcast Media",
  "37": "Museums & Institutions", "38": "Fine Art", "39": "Performing Arts", "40": "Recreational Facilities",
  "41": "Banking", "42": "Insurance", "43": "Financial Services", "44": "Real Estate",
  "45": "Investment Banking", "46": "Investment Management", "47": "Accounting", "48": "Construction",
  "49": "Building Materials", "50": "Architecture & Planning", "51": "Civil Engineering",
  "52": "Aviation & Aerospace", "53": "Automotive", "54": "Chemicals", "55": "Machinery",
  "56": "Mining & Metals", "57": "Oil & Energy", "58": "Utilities", "59": "Textiles",
  "60": "Paper & Forest Products", "61": "Railroad Manufacture", "62": "Farming",
  "63": "Ranching", "64": "Dairy", "65": "Fishery", "66": "Primary/Secondary Education",
  "67": "Higher Education", "68": "Education Management", "69": "Research", "70": "Military",
  "71": "Legislative Office", "72": "Judiciary", "73": "International Affairs", "74": "Government Admin",
  "75": "Executive Office", "76": "Law Enforcement", "77": "Public Safety", "78": "Public Policy",
  "79": "Marketing & Advertising", "80": "Newspapers", "81": "Publishing", "82": "Printing",
  "83": "Information Services", "84": "Libraries", "85": "Environmental Services",
  "86": "Package/Freight Delivery", "87": "Individual & Family Services", "88": "Religious Institutions",
  "89": "Civic & Social Organization", "90": "Consumer Services", "91": "Transportation/Trucking",
  "92": "Warehousing", "93": "Airlines/Aviation", "94": "Maritime", "95": "Health, Wellness & Fitness",
  "96": "Online Media", "97": "Music", "98": "E-Learning", "99": "Venture Capital",
  "100": "Staffing & Recruiting", "101": "Professional Training", "102": "Human Resources",
  "103": "Import & Export", "104": "Photography", "105": "Outsourcing/Offshoring",
  "106": "Computer Games", "107": "Events Services", "108": "Art & Crafts",
  "109": "Electrical/Electronic Manufacturing", "110": "Think Tanks", "111": "Philanthropy",
  "112": "Fund-Raising", "113": "Plastics", "114": "Computer & Network Security",
  "115": "Wireless", "116": "Alternative Dispute Resolution", "117": "Security & Investigations",
  "118": "Facilities Services", "119": "Renewables & Environment", "120": "Alternative Medicine",
  "121": "Luxury Goods & Jewelry", "122": "Tobacco", "123": "Political Organization",
  "124": "Translation & Localization", "125": "Computer Hardware",
  "1594": "Design", "1862": "Technology, Information & Internet",
  "2190": "Software Development", "3130": "Business Consulting", "3231": "Advertising Services",
  "3911": "IT Services & IT Consulting", "4119": "Digital Marketing",
};

const LI_SENIORITY: Record<string, string> = {
  "1": "Unpaid", "2": "Training", "3": "Entry Level", "4": "Senior", "5": "Manager",
  "6": "Director", "7": "VP", "8": "C-Suite / Executive", "9": "Partner", "10": "Owner",
};

const LI_FUNCTION: Record<string, string> = {
  "1": "Accounting", "2": "Administrative", "3": "Arts & Design", "4": "Business Development",
  "5": "Community & Social Services", "6": "Consulting", "7": "Education", "8": "Engineering",
  "9": "Entrepreneurship", "10": "Finance", "11": "Healthcare", "12": "Human Resources",
  "13": "Information Technology", "14": "Legal", "15": "Marketing", "16": "Media & Communications",
  "17": "Military & Protective Services", "18": "Operations", "19": "Product Management",
  "20": "Program & Project Management", "21": "Purchasing", "22": "Quality Assurance",
  "23": "Real Estate", "24": "Research", "25": "Sales", "26": "Customer Support",
};

/** Resolve a LinkedIn URN or ID to a human-readable label. */
function resolveUrn(urn: unknown, map: Record<string, string>): string {
  if (typeof urn !== "string") return String(urn);
  const id = urn.split(":").pop() ?? urn;
  return map[id] ?? (urn.startsWith("urn:") ? `ID ${id}` : urn);
}

async function getLinkedInToken(userId: string, workspaceId?: string): Promise<{ token: string; metadata: LinkedInMetadata }> {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "LINKEDIN", ...(workspaceId ? { workspaceId } : {}) },
  });
  if (!conn) throw new NoConnectionError();
  if (conn.status !== "CONNECTED") throw new Error("LinkedIn not connected");
  return { token: conn.accessToken ?? "", metadata: (conn.metadata ?? {}) as LinkedInMetadata };
}

export async function getLinkedInOrgStats(userId: string, workspaceId?: string) {
  const { token, metadata } = await getLinkedInToken(userId, workspaceId);
  if (!metadata.organizationId) throw new Error("LinkedIn organization not set");

  const orgUrn   = `urn:li:organization:${metadata.organizationId}`;
  const now      = Date.now();
  const headersV2   = { Authorization: `Bearer ${token}`, "X-Restli-Protocol-Version": "2.0.0" };
  const headersRest = { Authorization: `Bearer ${token}`, "X-Restli-Protocol-Version": "2.0.0", "LinkedIn-Version": LI_VERSION };

  const [followersRes, shareStatsRes, pageStatsRes, postsRes, orgRes, videoAnalyticsRes] = await Promise.allSettled([
    axios.get(`https://api.linkedin.com/v2/organizationalEntityFollowerStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}`, { headers: headersV2 }),
    // v2 share stats — no time filtering (restli object encoding required; all-time totals are sufficient)
    axios.get(`https://api.linkedin.com/v2/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(orgUrn)}`, { headers: headersV2 }),
    axios.get(`https://api.linkedin.com/rest/organizationPageStatistics?q=organization&organization=${encodeURIComponent(orgUrn)}`, { headers: headersRest }),
    axios.get(`https://api.linkedin.com/rest/posts?q=author&author=${encodeURIComponent(orgUrn)}&count=10&sortBy=LAST_MODIFIED`, { headers: headersRest }),
    axios.get(`https://api.linkedin.com/rest/organizations/${metadata.organizationId}`, { headers: headersRest }),
    axios.get(`https://api.linkedin.com/rest/videoAnalytics?q=entity&entity=${encodeURIComponent(orgUrn)}&type=ORGANIC`, { headers: headersRest }),
  ]);

  if (followersRes.status      === "rejected") console.error("[linkedin] followerStats failed:",   followersRes.reason?.response?.data      ?? followersRes.reason?.message);
  if (shareStatsRes.status     === "rejected") console.error("[linkedin] shareStats failed:",      shareStatsRes.reason?.response?.data     ?? shareStatsRes.reason?.message);
  if (pageStatsRes.status      === "rejected") console.error("[linkedin] pageStats failed:",       pageStatsRes.reason?.response?.data      ?? pageStatsRes.reason?.message);
  if (postsRes.status          === "rejected") console.error("[linkedin] posts failed:",           postsRes.reason?.response?.data          ?? postsRes.reason?.message);
  if (orgRes.status            === "rejected") console.error("[linkedin] org profile failed:",     orgRes.reason?.response?.data            ?? orgRes.reason?.message);
  if (videoAnalyticsRes.status === "rejected") console.error("[linkedin] videoAnalytics failed:",  JSON.stringify(videoAnalyticsRes.reason?.response?.data) ?? videoAnalyticsRes.reason?.message);

  const followerData  = followersRes.status === "fulfilled" ? followersRes.value.data?.elements?.[0] : null;
  const paidFollowers = 0; // paid follower count not available via current scopes

  const followersByIndustry:  { name: string; count: number }[] = [];
  const followersBySeniority: { name: string; count: number }[] = [];
  const followersByGeo:       { name: string; count: number }[] = [];
  const followersByFunction:  { name: string; count: number }[] = [];
  // Dimension values are LinkedIn URNs — resolve to human-readable names via lookup maps.
  function urnLabel(urn: unknown, map: Record<string, string>): string {
    if (typeof urn === "string") return resolveUrn(urn, map);
    if (typeof urn === "object" && urn !== null) {
      const loc = (urn as Record<string, unknown>).localized;
      if (typeof loc === "object" && loc !== null) return String(Object.values(loc)[0] ?? "");
    }
    return String(urn);
  }
  // The v2 followerStatistics elements contain top-level arrays, not nested under organicFollowerCounts
  const followerEl = followerData ?? {};
  if (followerEl.followerCountsByIndustry)   followersByIndustry.push(...(followerEl.followerCountsByIndustry as { industry: unknown; followerCounts: { organicFollowerCount: number } }[]).map(f => ({ name: urnLabel(f.industry, LI_INDUSTRY), count: f.followerCounts?.organicFollowerCount ?? 0 })).sort((a, b) => b.count - a.count).slice(0, 5));
  if (followerEl.followerCountsBySeniority)  followersBySeniority.push(...(followerEl.followerCountsBySeniority as { seniority: unknown; followerCounts: { organicFollowerCount: number } }[]).map(f => ({ name: urnLabel(f.seniority, LI_SENIORITY), count: f.followerCounts?.organicFollowerCount ?? 0 })).sort((a, b) => b.count - a.count).slice(0, 5));
  if (followerEl.followerCountsByGeoCountry) followersByGeo.push(...(followerEl.followerCountsByGeoCountry as { geo: unknown; followerCounts: { organicFollowerCount: number } }[]).map(f => ({ name: urnLabel(f.geo, {}), count: f.followerCounts?.organicFollowerCount ?? 0 })).sort((a, b) => b.count - a.count).slice(0, 5));
  if (followerEl.followerCountsByFunction)   followersByFunction.push(...(followerEl.followerCountsByFunction as { function: unknown; followerCounts: { organicFollowerCount: number } }[]).map(f => ({ name: urnLabel(f.function, LI_FUNCTION), count: f.followerCounts?.organicFollowerCount ?? 0 })).sort((a, b) => b.count - a.count).slice(0, 5));

  let impressions = 0, clicks = 0, shares = 0, reactions = 0, comments = 0;
  if (shareStatsRes.status === "fulfilled") {
    for (const el of shareStatsRes.value.data?.elements ?? []) {
      impressions += el.totalShareStatistics?.impressionCount ?? 0;
      clicks      += el.totalShareStatistics?.clickCount      ?? 0;
      shares      += el.totalShareStatistics?.shareCount      ?? 0;
      reactions   += el.totalShareStatistics?.likeCount       ?? 0;
      comments    += el.totalShareStatistics?.commentCount    ?? 0;
    }
  }
  // LinkedIn has no engagementCount field — compute as sum of interactions
  const engagements = clicks + reactions + comments + shares;

  let pageViews = 0, uniqueVisitors = 0, mobilePageViews = 0;
  if (pageStatsRes.status === "fulfilled") {
    for (const el of pageStatsRes.value.data?.elements ?? []) {
      pageViews       += (el.totalPageStatistics?.views?.allDesktopPageViews?.pageViews       ?? 0) + (el.totalPageStatistics?.views?.allMobilePageViews?.pageViews        ?? 0);
      mobilePageViews += el.totalPageStatistics?.views?.allMobilePageViews?.pageViews         ?? 0;
      uniqueVisitors  += (el.totalPageStatistics?.views?.allDesktopPageViews?.uniquePageViews ?? 0) + (el.totalPageStatistics?.views?.allMobilePageViews?.uniquePageViews  ?? 0);
    }
  }

  type PostItem = { id?: string; commentary?: string; publishedAt?: number; distribution?: { feedDistribution?: string } };
  const recentPosts: { id: string; text: string; publishedAt: number; feedDistribution: string }[] = [];
  if (postsRes.status === "fulfilled") {
    for (const post of (postsRes.value.data?.elements ?? []) as PostItem[]) {
      recentPosts.push({ id: post.id ?? "", text: (post.commentary ?? "").slice(0, 120), publishedAt: post.publishedAt ?? 0, feedDistribution: post.distribution?.feedDistribution ?? "" });
    }
  }

  const orgProfile  = orgRes.status === "fulfilled" ? orgRes.value.data : null;
  if (orgRes.status === "fulfilled") console.log("[linkedin] org keys:", Object.keys(orgRes.value.data ?? {}).join(", "));
  if (followersRes.status === "fulfilled") console.log("[linkedin] followerEl keys:", Object.keys(followersRes.value.data?.elements?.[0] ?? {}).join(", "), "| totalFollowerCounts:", JSON.stringify(followersRes.value.data?.elements?.[0]?.totalFollowerCounts));
  // Try all known field names for follower total across v2 + REST API versions
  const totalFollowers =
    followerData?.totalFollowerCounts?.organicFollowerCount   // v2 standard field
    ?? orgProfile?.followersCount                              // REST org field (some versions)
    ?? orgProfile?.followerCount                               // alternate name
    ?? orgProfile?.statistics?.followerCount                   // nested variant
    ?? 0;
  const websiteUrl  = orgProfile?.websiteUrl ?? "";
  // LinkedIn returns description as a MultiLocaleString: { localized: { "en_US": "..." }, preferredLocale: {...} }
  // Or in older v2 format it may be a plain string. Safely extract.
  const rawDesc = orgProfile?.description;
  const description: string = typeof rawDesc === "string"
    ? rawDesc
    : typeof rawDesc?.localized === "object" && rawDesc.localized !== null
      ? String(Object.values(rawDesc.localized)[0] ?? "")
      : "";
  // Specialties are MultiLocaleString objects: { localized: { "en_US": "SEO" }, preferredLocale: {...} }
  const specialties: string[] = (orgProfile?.specialties ?? []).map((s: unknown): string => {
    if (typeof s === "string") return s;
    if (typeof s === "object" && s !== null) {
      const loc = (s as Record<string, unknown>).localized;
      if (typeof loc === "object" && loc !== null) return String(Object.values(loc)[0] ?? "");
      // fallback: first non-object value in the specialty object
      const vals = Object.values(s as Record<string, unknown>).filter(v => typeof v === "string");
      if (vals.length) return String(vals[0]);
    }
    return String(s);
  }).filter(Boolean);

  let videoViews = 0, videoWatchTime = 0;
  if (videoAnalyticsRes.status === "fulfilled") {
    for (const el of videoAnalyticsRes.value.data?.elements ?? []) {
      videoViews     += el.videoViewCount          ?? 0;
      videoWatchTime += el.videoWatchTimeInSeconds ?? 0;
    }
  }

  return { followers: totalFollowers, paidFollowers, impressions, engagements, reach: impressions, engagementRate: impressions > 0 ? ((engagements / impressions) * 100).toFixed(1) : "0", organizationName: metadata.organizationName ?? "", clicks, shares, reactions, comments, pageViews, uniqueVisitors, mobilePageViews, videoViews, videoWatchTimeSeconds: videoWatchTime, followersByIndustry, followersBySeniority, followersByGeo, followersByFunction, recentPosts, websiteUrl, description, specialties };
}

export async function getLinkedInMemberStats(userId: string, workspaceId?: string) {
  const conn = await prisma.platformConnection.findFirst({ where: { userId, platform: "LINKEDIN" } });
  if (!conn) throw new NoConnectionError();
  if (conn.status !== "CONNECTED") throw new Error("LinkedIn not connected");
  const token       = conn.accessToken ?? "";
  const headersRest = { Authorization: `Bearer ${token}`, "X-Restli-Protocol-Version": "2.0.0", "LinkedIn-Version": LI_VERSION };
  const now = Date.now(), since7d = now - 7 * 24 * 60 * 60 * 1000;

  const [meRes, followerCountRes, postAnalyticsRes] = await Promise.allSettled([
    axios.get("https://api.linkedin.com/rest/me", { headers: headersRest }),
    axios.get(`https://api.linkedin.com/rest/memberFollowersCount?q=dateRange&dateRange.start.day=1&dateRange.start.month=1&dateRange.start.year=2020`, { headers: headersRest }),
    axios.get(`https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=me&timeIntervals.timeGranularityType=DAY&timeIntervals.timeRange.start=${since7d}&timeIntervals.timeRange.end=${now}`, { headers: headersRest }),
  ]);

  const me = meRes.status === "fulfilled" ? meRes.value.data : null;
  const memberName = me ? `${me.localizedFirstName ?? ""} ${me.localizedLastName ?? ""}`.trim() : "";
  const memberFollowers = followerCountRes.status === "fulfilled" ? (followerCountRes.value.data?.elements?.[0]?.followerCount ?? 0) : 0;

  let memberImpressions = 0, memberEngagements = 0, memberClicks = 0;
  if (postAnalyticsRes.status === "fulfilled") {
    for (const el of postAnalyticsRes.value.data?.elements ?? []) {
      memberImpressions += el.impressionCount ?? 0;
      memberEngagements += el.engagementCount ?? 0;
      memberClicks      += el.clickCount      ?? 0;
    }
  }

  return { memberName, memberFollowers, memberImpressions, memberEngagements, memberClicks, memberEngagementRate: memberImpressions > 0 ? ((memberEngagements / memberImpressions) * 100).toFixed(1) : "0" };
}
