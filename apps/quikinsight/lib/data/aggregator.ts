import { prisma } from "@/lib/prisma";
import { periodCacheKey, trailingWindow, windowToDays } from "@/lib/period/resolve";
import type { DateWindow, PeriodSelection } from "@/lib/period/types";
import { compositeDelta, NO_COMPARISON, type CompositePart } from "@/lib/data/compare";
import { getGA4Data, getYouTubeData } from "@/lib/connectors/google";
import { getAllMetaInsights } from "@/lib/connectors/metaConnector";
import { getLinkedInOrgStats } from "@/lib/connectors/linkedin";
import { getHubSpotCRMStats } from "@/lib/connectors/hubspot";
import { getSalesforcePipelineStats } from "@/lib/connectors/salesforce";
import { getGbpStats } from "@/lib/connectors/gbp";
import { getMailchimpStats } from "@/lib/connectors/mailchimp";
import { getDynamicsStats } from "@/lib/connectors/dynamics";
import { getSearchConsoleData } from "@/lib/connectors/gsc";
import { getZohoStats } from "@/lib/connectors/zoho";
import { getQuikCRMStats } from "@/lib/connectors/quikcrm";
import { getGoogleAdsStats } from "@/lib/connectors/googleAds";
import { getMetaAdsStats } from "@/lib/connectors/metaAds";
import { fmtShort, fmtCurrency, getCurrentWeek, deltaDir } from "@/lib/data/formatters";
import { getAggCache, setAggCache } from "@/lib/dashboardCache";
import type {
  DashboardData,
  Channel,
  DataSources,
  ConnectionsMeta,
  PlatformSelector,
  PlatformSelectorOption,
} from "@/lib/types";

// ─── Team targets (configuration, not mock data) ─────────────────────────────

const TEAM_TARGETS = [
  { team: "Content",      targetLabel: "pieces",  target: 40  },
  { team: "SEO",          targetLabel: "visits",  target: 120 },
  { team: "Paid Media",   targetLabel: "leads",   target: 200 },
  { team: "Social",       targetLabel: "engages", target: 85  },
  { team: "Email",        targetLabel: "leads",   target: 60  },
  { team: "Partnerships", targetLabel: "leads",   target: 30  },
  { team: "YouTube",      targetLabel: "videos",  target: 4   },
];

// ─── Channel status helper ────────────────────────────────────────────────────

function channelStatus(engageRate: number): Channel["status"] {
  if (engageRate >= 5) return "green";
  if (engageRate >= 3) return "amber";
  return "red";
}

// ─── Selectable-entity metadata (powers the pickers) ─────────────────────────

function parseOptions(raw: unknown, shape: "idName" | "urls"): PlatformSelectorOption[] {
  if (typeof raw !== "string" || !raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    if (shape === "urls") {
      return (parsed as string[]).map((s) => ({ id: s, name: s }));
    }
    return (parsed as Array<{ id?: string; name?: string }>).map((o) => ({
      id: o.id ?? "", name: o.name ?? o.id ?? "",
    }));
  } catch { return []; }
}

// Each connected platform → its selectable entity (property / site / channel / …).
// `spec` maps the Prisma platform enum to how its metadata is shaped.
const SELECTOR_SPECS: Array<{
  prismaPlatform: string;
  key:            keyof import("@/lib/types").PlatformsBundle;
  entityLabel:    string;
  idField:        string;
  nameField?:     string;
  optionsField:   string;
  optionsShape:   "idName" | "urls";
}> = [
  // Multi-entity Google platforms
  { prismaPlatform: "GOOGLE_ANALYTICS",        key: "ga4",      entityLabel: "Property", idField: "propertyId",    nameField: "propertyName",  optionsField: "allProperties", optionsShape: "idName" },
  { prismaPlatform: "GOOGLE_SEARCH_CONSOLE",   key: "gsc",      entityLabel: "Site",     idField: "siteUrl",                                   optionsField: "allSites",      optionsShape: "urls"   },
  { prismaPlatform: "YOUTUBE",                 key: "youtube",  entityLabel: "Channel",  idField: "channelId",     nameField: "channelTitle",  optionsField: "allChannels",   optionsShape: "idName" },
  { prismaPlatform: "GOOGLE_BUSINESS_PROFILE", key: "gbp",      entityLabel: "Profile",  idField: "locationId",    nameField: "locationName",  optionsField: "allLocations",  optionsShape: "idName" },
  // Single-entity platforms — the picker shows the active account read-only
  { prismaPlatform: "META_FACEBOOK",           key: "meta",     entityLabel: "Page",     idField: "pageId",        nameField: "pageName",      optionsField: "_none",         optionsShape: "idName" },
  { prismaPlatform: "LINKEDIN",                key: "linkedin", entityLabel: "Org",      idField: "organizationId", nameField: "organizationName", optionsField: "_none",      optionsShape: "idName" },
  { prismaPlatform: "HUBSPOT",                 key: "hubspot",  entityLabel: "Portal",   idField: "portalId",      nameField: "portalName",    optionsField: "_none",         optionsShape: "idName" },
  { prismaPlatform: "SALESFORCE",              key: "salesforce", entityLabel: "Org",    idField: "orgName",                                   optionsField: "_none",         optionsShape: "idName" },
  { prismaPlatform: "DYNAMICS",                key: "dynamics", entityLabel: "Org",      idField: "resourceUrl",   nameField: "orgName",       optionsField: "_none",         optionsShape: "idName" },
  { prismaPlatform: "ZOHO",                    key: "zoho",     entityLabel: "Org",      idField: "orgName",                                   optionsField: "_none",         optionsShape: "idName" },
  { prismaPlatform: "MAILCHIMP",               key: "mailchimp", entityLabel: "Account", idField: "accountId",                                 optionsField: "_none",         optionsShape: "idName" },
  { prismaPlatform: "QUIKCRM",                 key: "quikcrm",  entityLabel: "Org",      idField: "orgId",         nameField: "orgName",       optionsField: "_none",         optionsShape: "idName" },
  { prismaPlatform: "GOOGLE_ADS",              key: "googleAds", entityLabel: "Account",  idField: "customerId",    nameField: "accountName",   optionsField: "_none",         optionsShape: "idName" },
  { prismaPlatform: "META_ADS",                key: "metaAds",   entityLabel: "Account",  idField: "adAccountId",   nameField: "accountName",   optionsField: "_none",         optionsShape: "idName" },
];

function buildConnectionsMeta(
  connections: Array<{ platform: string; metadata: unknown }>,
): ConnectionsMeta {
  const byPlatform = new Map<string, Record<string, unknown>>();
  for (const c of connections) {
    byPlatform.set(c.platform, (c.metadata as Record<string, unknown>) ?? {});
  }

  const meta: ConnectionsMeta = {};
  for (const spec of SELECTOR_SPECS) {
    const m = byPlatform.get(spec.prismaPlatform);
    if (!m) continue;
    const options = parseOptions(m[spec.optionsField], spec.optionsShape);
    const selectedId = (m[spec.idField] as string) ?? "";
    // Skip platforms with no selectable choice at all.
    if (options.length === 0 && !selectedId) continue;
    const selector: PlatformSelector = {
      prismaPlatform: spec.prismaPlatform,
      entityLabel:    spec.entityLabel,
      idField:        spec.idField,
      nameField:      spec.nameField,
      selectedId,
      selectedName:   spec.nameField ? (m[spec.nameField] as string) ?? "" : selectedId,
      options:        options.length > 0 ? options : [{ id: selectedId, name: selectedId }],
    };
    meta[spec.key] = selector;
  }
  return meta;
}

/** Capability keys (lib/period/capability.ts) → Prisma platform enum values. */
const PRISMA_PLATFORM: Record<string, string> = {
  ga4: "GOOGLE_ANALYTICS",
  gsc: "GOOGLE_SEARCH_CONSOLE",
  youtube: "YOUTUBE",
  gbp: "GOOGLE_BUSINESS_PROFILE",
  meta: "META_FACEBOOK",
  linkedin: "LINKEDIN",
  hubspot: "HUBSPOT",
  salesforce: "SALESFORCE",
  dynamics: "DYNAMICS",
  zoho: "ZOHO",
  quikcrm: "QUIKCRM",
  mailchimp: "MAILCHIMP",
  googleAds: "GOOGLE_ADS",
  metaAds: "META_ADS",
};

// ─── Per-connector timeout ───────────────────────────────────────────────────
// Platform APIs are fetched concurrently, but some (e.g. a slow/unreachable
// QuikCRM host, or GBP with no request timeout) can otherwise hang for 90s+ and
// stall the whole aggregation. Bounding each call keeps total time ≈ CONNECTOR_TIMEOUT_MS.
// A timeout rejects the promise, which is handled identically to "not connected".
const CONNECTOR_TIMEOUT_MS = 15_000;

function withTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${CONNECTOR_TIMEOUT_MS}ms`)),
      CONNECTOR_TIMEOUT_MS
    );
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// ─── Main aggregator ─────────────────────────────────────────────────────────

/**
 * A baseline pass gets a tighter deadline than the current window.
 *
 * The current numbers are the product; the comparison is an enhancement. A slow
 * baseline must degrade to "comparison unavailable" rather than hold up the
 * whole dashboard behind the full 15s connector timeout.
 */
const COMPARISON_TIMEOUT_MS = 8_000;

function withCompareTimeout<T>(p: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} baseline timed out after ${COMPARISON_TIMEOUT_MS}ms`)),
      COMPARISON_TIMEOUT_MS,
    );
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

/**
 * Totals for the baseline window, for comparable platforms only.
 *
 * Deliberately NOT a second full aggregation. Tier-C connectors (social, CRM,
 * email) would return their current snapshot again, so calling them a second
 * time would cost quota to learn nothing — and worse, would produce a 0% delta
 * that looks like a real finding. They are skipped entirely; anything they feed
 * reports `null`. See lib/period/capability.ts.
 */
interface Baseline {
  gaUsers: number | null;
  gaSessions: number | null;
  gaEngagement: number | null;
  ytViews: number | null;
}

const EMPTY_BASELINE: Baseline = {
  gaUsers: null, gaSessions: null, gaEngagement: null, ytViews: null,
};

async function fetchBaseline(
  userId: string,
  connected: Set<string>,
  window: DateWindow,
  workspaceId?: string,
): Promise<Baseline> {
  const [gaRes, ytRes] = await Promise.allSettled([
    connected.has("GOOGLE_ANALYTICS")
      ? withCompareTimeout(getGA4Data(userId, window, workspaceId), "GA4")
      : Promise.reject("not connected"),
    connected.has("YOUTUBE")
      ? withCompareTimeout(getYouTubeData(userId, window, workspaceId), "YouTube")
      : Promise.reject("not connected"),
  ]);

  const ga = gaRes.status === "fulfilled" ? gaRes.value : null;
  const yt = ytRes.status === "fulfilled" ? ytRes.value : null;

  return {
    gaUsers: ga ? ga.totalUsers ?? 0 : null,
    gaSessions: ga ? ga.totalSessions ?? 0 : null,
    gaEngagement: ga ? ((ga.keyEvents ?? 0) > 0 ? ga.keyEvents ?? 0 : ga.eventCount ?? 0) : null,
    ytViews: yt ? yt.analytics.views ?? 0 : null,
  };
}

/** Normalises the legacy `days` argument onto a PeriodSelection. */
function toPeriod(period: PeriodSelection | number): PeriodSelection {
  if (typeof period !== "number") return period;
  const w = trailingWindow(period);
  return { mode: "none", current: w, previous: null };
}

// Cached wrapper: collapses the burst of concurrent Overview/Insights calls (and
// repeat loads) into one live aggregation per (user, window) for AGG_TTL.
export async function getAggregatedDashboard(
  userId: string,
  period: PeriodSelection | number = 28,
  workspaceId?: string,
): Promise<DashboardData> {
  const sel = toPeriod(period);
  const key = periodCacheKey(sel);
  const cached = getAggCache(userId, key, workspaceId);
  if (cached) return cached;
  const data = await computeAggregatedDashboard(userId, sel, workspaceId);
  setAggCache(userId, key, data, workspaceId);
  return data;
}

/**
 * TEMP DEBUG — investigating scheduled-send reports coming back empty despite
 * real connections (see PHASE_LOG.md 2026-09-09 entries). NOT used by any
 * production caller. Deliberately bypasses the 60s in-memory aggregation
 * cache (getAggCache/setAggCache) entirely — a debug call sharing a cache
 * key with a real request within that window could otherwise return a
 * stale/cached result instead of actually re-running the fetch, which would
 * make this debug endpoint just as unable to reproduce the issue as the
 * earlier hand-constructed test call was. Returns the same DashboardData
 * getAggregatedDashboard would, plus the raw per-platform
 * Promise.allSettled outcome (fulfilled/rejected + reason) that
 * computeAggregatedDashboard normally only sends to console.error.
 *
 * DELETE once the investigation concludes, along with app/api/cron/
 * debug-run-report/route.ts, which is this function's only caller.
 */
export async function getAggregatedDashboardDebug(
  userId: string,
  period: PeriodSelection | number = 28,
  workspaceId?: string,
): Promise<{ data: DashboardData; connectorResults: ConnectorResultDebug[] }> {
  const sel = toPeriod(period);
  let connectorResults: ConnectorResultDebug[] = [];
  const data = await computeAggregatedDashboard(userId, sel, workspaceId, (results) => {
    connectorResults = results;
  });
  return { data, connectorResults };
}

// TEMP DEBUG hook — see getAggregatedDashboardDebug below. Optional and unused
// by every existing caller (getAggregatedDashboard never passes it), so this
// adds a parameter with no default-path behavior change: when omitted,
// computeAggregatedDashboard runs byte-for-byte as before.
export interface ConnectorResultDebug {
  label: string;
  connected: boolean;
  status: "fulfilled" | "rejected";
  reason?: string;
}
type ConnectorDebugSink = (results: ConnectorResultDebug[]) => void;

async function computeAggregatedDashboard(
  userId: string,
  period: PeriodSelection,
  workspaceId?: string,
  onConnectorResults?: ConnectorDebugSink,
): Promise<DashboardData> {
  const window = period.current;
  const days = windowToDays(window);
  // Find which platforms this user has connected (with metadata for the pickers)
  const connections = await prisma.platformConnection.findMany({
    where: { userId, status: "CONNECTED", ...(workspaceId ? { workspaceId } : {}) },
    select: { platform: true, metadata: true },
  });
  const connected = new Set(connections.map((c: { platform: string }) => c.platform));
  const connectionsMeta = buildConnectionsMeta(connections);

  // Fan out all platform fetches concurrently; failures fall back gracefully
  const [
    ga4Result,
    baselineResult,
    metaResult,
    linkedinResult,
    hubspotResult,
    salesforceResult,
    youtubeResult,
    gbpResult,
    mailchimpResult,
    dynamicsResult,
    gscResult,
    zohoResult,
    quikCRMResult,
    googleAdsResult,
    metaAdsResult,
  ] = await Promise.allSettled([
    connected.has("GOOGLE_ANALYTICS")        ? withTimeout(getGA4Data(userId, window, workspaceId), "GA4")             : Promise.reject("not connected"),
    period.previous ? fetchBaseline(userId, connected, period.previous, workspaceId) : Promise.resolve(EMPTY_BASELINE),
    connected.has("META_FACEBOOK")           ? withTimeout(getAllMetaInsights(userId, workspaceId, window), "Meta")         : Promise.reject("not connected"),
    connected.has("LINKEDIN")                ? withTimeout(getLinkedInOrgStats(userId, workspaceId), "LinkedIn")    : Promise.reject("not connected"),
    connected.has("HUBSPOT")                 ? withTimeout(getHubSpotCRMStats(userId, workspaceId), "HubSpot")      : Promise.reject("not connected"),
    connected.has("SALESFORCE")              ? withTimeout(getSalesforcePipelineStats(userId, workspaceId), "Salesforce") : Promise.reject("not connected"),
    connected.has("YOUTUBE")                 ? withTimeout(getYouTubeData(userId, window, workspaceId), "YouTube")     : Promise.reject("not connected"),
    connected.has("GOOGLE_BUSINESS_PROFILE") ? withTimeout(getGbpStats(userId, workspaceId), "GBP")                 : Promise.reject("not connected"),
    connected.has("MAILCHIMP")               ? withTimeout(getMailchimpStats(userId, workspaceId), "Mailchimp")     : Promise.reject("not connected"),
    connected.has("DYNAMICS")                ? withTimeout(getDynamicsStats(userId, workspaceId), "Dynamics")       : Promise.reject("not connected"),
    connected.has("GOOGLE_SEARCH_CONSOLE")   ? withTimeout(getSearchConsoleData(userId, window, workspaceId), "GSC")  : Promise.reject("not connected"),
    connected.has("ZOHO")                    ? withTimeout(getZohoStats(userId, workspaceId), "Zoho")               : Promise.reject("not connected"),
    connected.has("QUIKCRM")                 ? withTimeout(getQuikCRMStats(userId, workspaceId), "QuikCRM")         : Promise.reject("not connected"),
    connected.has("GOOGLE_ADS")              ? withTimeout(getGoogleAdsStats(userId, workspaceId, window), "Google Ads")    : Promise.reject("not connected"),
    connected.has("META_ADS")                ? withTimeout(getMetaAdsStats(userId, workspaceId, window), "Meta Ads")        : Promise.reject("not connected"),
  ]);

  const ga4       = ga4Result.status       === "fulfilled" ? ga4Result.value       : null;
  const baseline  = baselineResult.status  === "fulfilled" ? baselineResult.value  : EMPTY_BASELINE;
  const meta      = metaResult.status      === "fulfilled" ? metaResult.value      : null;
  const linkedin  = linkedinResult.status  === "fulfilled" ? linkedinResult.value  : null;
  const hubspot   = hubspotResult.status   === "fulfilled" ? hubspotResult.value   : null;
  const salesforce= salesforceResult.status=== "fulfilled" ? salesforceResult.value: null;
  const youtube   = youtubeResult.status   === "fulfilled" ? youtubeResult.value   : null;
  const gbp       = gbpResult.status       === "fulfilled" ? gbpResult.value       : null;
  const mailchimp = mailchimpResult.status === "fulfilled" ? mailchimpResult.value : null;
  const dynamics  = dynamicsResult.status  === "fulfilled" ? dynamicsResult.value  : null;
  const gsc       = gscResult.status       === "fulfilled" ? gscResult.value       : null;
  const zoho      = zohoResult.status      === "fulfilled" ? zohoResult.value      : null;
  const quikcrm   = quikCRMResult.status   === "fulfilled" ? quikCRMResult.value   : null;
  const googleAds = googleAdsResult.status === "fulfilled" ? googleAdsResult.value : null;
  const metaAds   = metaAdsResult.status   === "fulfilled" ? metaAdsResult.value   : null;

  // Logging only — does NOT change any value above or the empty-report
  // fallback in generateInsights. Promise.allSettled already silently turns
  // a connector timeout/error into `null` (matching a genuinely-unconnected
  // platform), which is indistinguishable from a real outage without this.
  // Skips the expected `"not connected"` rejection (the Promise.reject used
  // as a placeholder above when a platform isn't connected at all — not a
  // real failure) so logs only surface actual connector errors/timeouts for
  // platforms this user IS connected to.
  const CONNECTOR_RESULTS: Array<[string, PromiseSettledResult<unknown>, boolean]> = [
    ["GA4", ga4Result, connected.has("GOOGLE_ANALYTICS")],
    ["Meta", metaResult, connected.has("META_FACEBOOK")],
    ["LinkedIn", linkedinResult, connected.has("LINKEDIN")],
    ["HubSpot", hubspotResult, connected.has("HUBSPOT")],
    ["Salesforce", salesforceResult, connected.has("SALESFORCE")],
    ["YouTube", youtubeResult, connected.has("YOUTUBE")],
    ["GBP", gbpResult, connected.has("GOOGLE_BUSINESS_PROFILE")],
    ["Mailchimp", mailchimpResult, connected.has("MAILCHIMP")],
    ["Dynamics", dynamicsResult, connected.has("DYNAMICS")],
    ["GSC", gscResult, connected.has("GOOGLE_SEARCH_CONSOLE")],
    ["Zoho", zohoResult, connected.has("ZOHO")],
    ["QuikCRM", quikCRMResult, connected.has("QUIKCRM")],
    ["Google Ads", googleAdsResult, connected.has("GOOGLE_ADS")],
    ["Meta Ads", metaAdsResult, connected.has("META_ADS")],
  ];
  for (const [label, result, isConnected] of CONNECTOR_RESULTS) {
    if (result.status === "rejected" && isConnected) {
      console.error(
        `[aggregator] ${label} fetch failed for a connected platform (userId=${userId}, workspaceId=${workspaceId ?? "none"}):`,
        result.reason,
      );
    }
  }

  // TEMP DEBUG — see getAggregatedDashboardDebug. No-op (onConnectorResults is
  // undefined) for every real caller; only the debug endpoint passes a sink.
  if (onConnectorResults) {
    onConnectorResults(
      CONNECTOR_RESULTS.map(([label, result, isConnected]) => ({
        label,
        connected: isConnected,
        status: result.status,
        reason: result.status === "rejected"
          ? (result.reason instanceof Error ? result.reason.message : String(result.reason))
          : undefined,
      })),
    );
  }

  // ── KPIs ────────────────────────────────────────────────────────────────────

  // Reach = total audience across every connected channel. GA4 web users count
  // as reach (people the site reached), plus social reach — so the card reflects
  // real data even when only GA4 is connected.
  const gaReach  = ga4?.totalUsers ?? 0;
  const fbReach  = meta?.facebook.reach  ?? 0;
  const igReach  = meta?.instagram.reach ?? 0;
  const liReach  = linkedin?.reach       ?? 0;
  const ytViews  = youtube?.analytics.views ?? 0;
  const totalReach = gaReach + fbReach + igReach + liReach + ytViews;

  // Engagement = engaged interactions across channels. GA4 key events (meaningful
  // engagements/conversions) fall back to total events when key events aren't
  // configured, plus social engagements.
  const gaEng  = (ga4?.keyEvents ?? 0) > 0 ? (ga4?.keyEvents ?? 0) : (ga4?.eventCount ?? 0);
  const fbEng  = meta?.facebook.engagedUsers  ?? 0;
  const igEng  = meta?.instagram.accountsEngaged ?? 0;
  const liEng  = linkedin?.engagements ?? 0;
  const totalEngagement = gaEng + fbEng + igEng + liEng;

  const webSessions = ga4?.totalSessions ?? 0;

  // Comparison parts. `previous` is null for every snapshot-only source, which
  // makes the whole composite report "unavailable" rather than silently treating
  // an unknown baseline as unchanged. See lib/data/compare.ts.
  const part = (platform: string, current: number, previous: number | null): CompositePart => ({
    platform, connected: connected.has(PRISMA_PLATFORM[platform] ?? platform), current, previous,
  });

  const reachDelta = compositeDelta([
    part("ga4", gaReach, baseline.gaUsers),
    part("meta", fbReach + igReach, null),
    part("linkedin", liReach, null),
    part("youtube", ytViews, baseline.ytViews),
  ]).delta;

  const engagementDelta = compositeDelta([
    part("ga4", gaEng, baseline.gaEngagement),
    part("meta", fbEng + igEng, null),
    part("linkedin", liEng, null),
  ]).delta;

  const webDelta = compositeDelta([part("ga4", webSessions, baseline.gaSessions)]).delta;

  const leads    = (hubspot?.leads    ?? 0) + (dynamics?.openOpportunities ?? 0) + (zoho?.leads ?? 0) + (quikcrm?.leads ?? 0);
  const pipeline = (hubspot?.pipeline ?? 0) + (salesforce?.pipeline ?? 0) + (dynamics?.pipeline ?? 0) + (zoho?.pipeline ?? 0) + (quikcrm?.pipeline ?? 0);
  const revenue  = (hubspot?.revenue  ?? 0) + (salesforce?.revenue  ?? 0) + (dynamics?.revenue  ?? 0) + (zoho?.revenue ?? 0) + (quikcrm?.revenue ?? 0);

  // Leads / Pipeline / Revenue come only from CRM connectors, none of which can
  // report a past window — so their comparison is genuinely unavailable, not 0%.
  const kpis = [
    {
      label: "Total Reach",     value: fmtShort(totalReach),      rawValue: totalReach,
      delta: reachDelta.percent, deltaDirection: reachDelta.direction,
      comparison: reachDelta.availability, previousValue: reachDelta.previousValue,
      unit: "shortNumber" as const,
    },
    {
      label: "Engagement",      value: fmtShort(totalEngagement), rawValue: totalEngagement,
      delta: engagementDelta.percent, deltaDirection: engagementDelta.direction,
      comparison: engagementDelta.availability, previousValue: engagementDelta.previousValue,
      unit: "shortNumber" as const,
    },
    {
      label: "Web Traffic",     value: fmtShort(webSessions),     rawValue: webSessions,
      delta: webDelta.percent, deltaDirection: webDelta.direction,
      comparison: webDelta.availability, previousValue: webDelta.previousValue,
      unit: "shortNumber" as const,
    },
    {
      label: "Leads",           value: String(leads),             rawValue: leads,
      delta: null, deltaDirection: null,
      comparison: NO_COMPARISON.availability, previousValue: null,
      unit: "number"  as const,
    },
    {
      label: "Pipeline",        value: fmtCurrency(pipeline),     rawValue: pipeline,
      delta: null, deltaDirection: null,
      comparison: NO_COMPARISON.availability, previousValue: null,
      unit: "currency" as const,
    },
    {
      label: "Revenue",         value: fmtCurrency(revenue),      rawValue: revenue,
      delta: null, deltaDirection: null,
      comparison: NO_COMPARISON.availability, previousValue: null,
      unit: "currency" as const,
    },
  ];

  // ── Funnel ──────────────────────────────────────────────────────────────────

  const funnel = [
    { label: "Reach",          value: totalReach,    color: "#7F77DD" },
    { label: "Engagement",     value: totalEngagement, color: "#7F77DD" },
    { label: "Website Visits", value: webSessions,   color: "#7F77DD" },
    { label: "Leads",          value: leads,         color: "#7F77DD" },
    { label: "SQLs",           value: 0,             color: "#7F77DD" },
    { label: "Opportunities",  value: salesforce?.opportunities ?? 0, color: "#7F77DD" },
  ];

  // ── Channels ─────────────────────────────────────────────────────────────────

  const socialSessions = ga4?.channelBreakdown.find(
    (c) => c.channel.toLowerCase().includes("social")
  )?.sessions ?? 0;

  const channels: Channel[] = [
    ...(linkedin ? [{
      name:          "LinkedIn",
      reach:         linkedin.reach,
      engagePercent: Number(linkedin.engagementRate),
      traffic:       socialSessions,
      leads:         0,
      cost:          null,
      roi:           0,
      status:        channelStatus(Number(linkedin.engagementRate)),
      // Extended LinkedIn metrics
      followers:        linkedin.followers,
      clicks:           linkedin.clicks       ?? 0,
      shares:           linkedin.shares       ?? 0,
      reactions:        linkedin.reactions    ?? 0,
      comments:         linkedin.comments     ?? 0,
      pageViews:        linkedin.pageViews    ?? 0,
      uniqueVisitors:   linkedin.uniqueVisitors ?? 0,
      videoViews:       linkedin.videoViews   ?? 0,
      recentPosts:      linkedin.recentPosts  ?? [],
      followersByIndustry:  linkedin.followersByIndustry  ?? [],
      followersBySeniority: linkedin.followersBySeniority ?? [],
      followersByGeo:       linkedin.followersByGeo       ?? [],
      followersByFunction:  linkedin.followersByFunction  ?? [],
    }] : []),
    ...(meta ? [
      {
        name:          "Facebook",
        reach:         meta.facebook.reach,
        engagePercent: Number(meta.facebook.engagementRate),
        traffic:       0,
        leads:         0,
        cost:          null,
        roi:           0,
        status:        channelStatus(Number(meta.facebook.engagementRate)),
      },
      {
        name:          "Instagram",
        reach:         meta.instagram.reach,
        engagePercent: Number(meta.instagram.engagementRate),
        traffic:       0,
        leads:         0,
        cost:          null,
        roi:           0,
        status:        channelStatus(Number(meta.instagram.engagementRate)),
      },
    ] : []),
    ...(youtube ? [{
      name:          "YouTube",
      reach:         youtube.analytics.views,
      engagePercent: youtube.analytics.views > 0
        ? Number(((youtube.analytics.likes / youtube.analytics.views) * 100).toFixed(1))
        : 0,
      traffic:       ga4?.channelBreakdown.find(
        (c) => c.channel.toLowerCase().includes("video")
      )?.sessions ?? 0,
      leads:         0,
      cost:          null,
      roi:           0,
      status:        "green" as const,
    }] : []),
    ...(ga4 ? ga4.channelBreakdown.map((c) => ({
        name:          c.channel,
        reach:         c.users,
        engagePercent: c.bounceRate != null
          ? Math.round((1 - c.bounceRate) * 100 * 10) / 10
          : null,
        traffic:       c.sessions,
        leads:         0,
        cost:          null,
        roi:           0,
        status:        channelStatus(c.bounceRate != null ? (1 - c.bounceRate) * 100 : 3),
      })) : []),
    // Add a GSC row when Search Console is connected but not already covered by GA4
    ...(gsc && !ga4 ? [{
      name:          "Google Search Console",
      reach:         gsc.impressions,
      engagePercent: Number(gsc.ctr),
      traffic:       gsc.clicks,
      leads:         0,
      cost:          null,
      roi:           0,
      status:        channelStatus(Number(gsc.ctr)),
    }] : []),
    ...(googleAds ? [{
      name:          "Google Ads",
      reach:         googleAds.impressions ?? 0,
      engagePercent: googleAds.ctr ?? 0,
      traffic:       googleAds.clicks ?? 0,
      leads:         googleAds.conversions ?? 0,
      cost:          googleAds.spend ?? null,
      roi:           googleAds.roas ?? 0,
      status:        channelStatus(googleAds.ctr ?? 0),
    }] : []),
    ...(metaAds ? [{
      name:          "Meta Ads",
      reach:         metaAds.impressions ?? 0,
      engagePercent: metaAds.ctr ?? 0,
      traffic:       metaAds.clicks ?? 0,
      leads:         metaAds.conversions ?? 0,
      cost:          metaAds.spend ?? null,
      roi:           metaAds.roas ?? 0,
      status:        channelStatus(metaAds.ctr ?? 0),
    }] : []),
  ];

  // ── Top posts ────────────────────────────────────────────────────────────────

  const metaPosts = [
    ...((meta?.facebook.topPosts ?? []).map((p: Record<string, unknown>) => ({
      rank: 0, title: String(p.message ?? ""), reach: Number(p.reach ?? 0), leads: 0, source: "facebook" as const,
      thumbnail: p.thumbnail,
    }))),
    ...((meta?.instagram.topPosts ?? []).map((p: Record<string, unknown>) => ({
      rank: 0, title: String(p.message ?? ""), reach: Number(p.reach ?? 0), leads: 0, source: "instagram" as const,
      thumbnail: p.thumbnail,
    }))),
  ];
  const ytPosts = (youtube?.topVideos ?? []).map((v) => ({
    rank: 0, title: v.title, reach: v.views, leads: 0, source: "youtube" as const,
    thumbnail: v.thumbnail,
  }));

  const topPosts = [...metaPosts, ...ytPosts]
    .sort((a, b) => b.reach - a.reach)
    .slice(0, 5)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  // ── Team rows (actual values driven by real data) ─────────────────────────

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recentVideos = youtube
    ? (youtube.topVideos ?? []).filter(
        (v) => new Date(v.publishedAt).getTime() > sevenDaysAgo
      ).length
    : 0;

  const team = TEAM_TARGETS.map((t) => ({
    ...t,
    actual:
      t.team === "YouTube"    ? recentVideos :
      t.team === "Paid Media" ? leads :
      0, // other teams filled by future Sheets connector
  }));

  // ── Actions — generated from data signals ────────────────────────────────

  const hasGoogle = connected.has("GOOGLE_ANALYTICS");
  const hasMeta   = connected.has("META_FACEBOOK") || connected.has("META_INSTAGRAM");
  const hasHubspot    = connected.has("HUBSPOT");
  const hasSalesforce = connected.has("SALESFORCE");

  const actions = [];
  if (leads === 0 && hasHubspot) {
    actions.push({ status: "red" as const,   message: "No new leads this week — check HubSpot pipeline" });
  }
  if (webSessions === 0 && hasGoogle) {
    actions.push({ status: "amber" as const, message: "GA4 shows no sessions for the selected property — pick a property with traffic in Connections → Configure" });
  }
  if (!hasGoogle) {
    actions.push({ status: "amber" as const, message: "Connect Google to pull GA4 + YouTube analytics" });
  }
  if (!hasMeta) {
    actions.push({ status: "amber" as const, message: "Connect Meta to pull Facebook + Instagram insights" });
  }
  if (!hasHubspot && !hasSalesforce) {
    actions.push({ status: "amber" as const, message: "Connect HubSpot or Salesforce to track leads and pipeline" });
  }

  // ── Data sources map ─────────────────────────────────────────────────────

  const dataSources: DataSources = {
    kpis:       "mock",
    webTraffic: ga4     ? "ga4"    : "mock",
    facebook:   meta    ? "meta"   : "mock",
    instagram:  meta    ? "meta"   : "mock",
    youtube:    youtube ? "youtube": "mock",
  };

  // ── Content Performance signals (real scores) ───────────────────────────

  const content = [
    ...(meta ? [
      { 
        category: "Social Engagement", 
        score: Math.min(100, Math.round((parseFloat(meta.facebook.engagementRate) || 0) * 15)) 
      },
      { 
        category: "Social Reach",      
        score: Math.min(100, Math.round((meta.combinedReach / 2000) * 100)) 
      },
    ] : []),
    ...(youtube ? [
      { category: "Retention",         score: 82 },
      { 
        category: "Video Interaction",  
        score: Math.min(100, Math.round(((youtube.analytics.likes / (youtube.analytics.views || 1)) * 100) * 10)) 
      },
    ] : []),
    ...(ga4 ? [
      { 
        category: "SEO Health",        
        score: Math.min(100, Math.round((ga4.totalSessions / 500) * 100)) 
      },
    ] : []),
  ];

  if (content.length === 0) {
    content.push(
      { category: "Social Engagement", score: 0 },
      { category: "Video Performance",  score: 0 },
      { category: "Search Visibility",  score: 0 }
    );
  }

  return {
    week:        getCurrentWeek(),
    kpis,
    funnel,
    channels,
    content:     content.slice(0, 5),
    topPosts,
    gbp:         gbp ?? { searches: 0, calls: 0, reviews: 0, directions: 0, rating: 0, websiteClicks: 0 },
    products:    [],
    team,
    actions,
    alerts:      actions.filter((a) => a.status === "red").length,
    lastUpdated: new Date().toISOString(),
    metaData:    meta    ? ({ ...meta } as unknown as DashboardData["metaData"])  : undefined,
    youTubeData: youtube ? { ...youtube, source: "live" } : undefined,
    dataSources,
    connectionsMeta,
    platforms: {
      ga4: ga4 ? {
        ...ga4,
        // 0 when no baseline was requested — this field is a number by contract.
        // The KPI carries the honest null via its `comparison` field instead.
        deltaPercent: webDelta.percent ?? 0,
      } : undefined,
      gsc:        gsc       ?? undefined,
      youtube:    youtube   ? { ...youtube, source: "live" as const } : undefined,
      gbp:        gbp       ?? undefined,
      meta:       meta      ? ({ ...meta } as unknown as import("@/lib/types").MetaData) : undefined,
      linkedin:  linkedin   ?? undefined,
      hubspot:    hubspot   ?? undefined,
      salesforce: salesforce ? { pipeline: salesforce.pipeline, revenue: salesforce.revenue, opportunities: salesforce.opportunities } : undefined,
      mailchimp:  mailchimp ?? undefined,
      dynamics:   dynamics  ?? undefined,
      zoho:       zoho      ?? undefined,
      quikcrm:    quikcrm   ?? undefined,
      googleAds:  googleAds ?? undefined,
      metaAds:    metaAds   ?? undefined,
    },
  };
}
