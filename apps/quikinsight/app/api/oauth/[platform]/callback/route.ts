import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PLATFORM_CONFIGS } from "@/lib/types/connections";
import type { Platform } from "@/lib/types/connections";
import { clearCache } from "@/lib/dashboardCache";
import { verifyOAuthState } from "@/lib/oauthState";
import { getActiveWorkspaceId } from "@/lib/workspace";
import axios from "axios";

const BASE_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3011";

// Map lowercase connection platform keys → Prisma enum values
const PLATFORM_TO_PRISMA: Record<string, string> = {
  google:     "GOOGLE_ANALYTICS",
  google_ads: "GOOGLE_ADS",
  gbp:        "GOOGLE_BUSINESS_PROFILE",
  meta:       "META_FACEBOOK",
  meta_ads:   "META_ADS",
  linkedin:   "LINKEDIN",
  hubspot:    "HUBSPOT",
  salesforce: "SALESFORCE",
  mailchimp:  "MAILCHIMP",
  dynamics:   "DYNAMICS",
  zoho:       "ZOHO",
};

interface TokenResponse {
  access_token:  string;
  refresh_token?: string;
  expires_in?:   number;
  token_type?:   string;
  scope?:        string;
}

// API-key based platforms (e.g. QuikCRM) have no OAuth token exchange and are omitted.
const TOKEN_ENDPOINTS: Partial<Record<
  Platform,
  { tokenUrl: string; clientId: string; clientSecret: string }
>> = {
  google: {
    tokenUrl:     "https://oauth2.googleapis.com/token",
    clientId:     process.env.QUIKINSIGHT_GOOGLE_CLIENT_ID     ?? "",
    clientSecret: process.env.QUIKINSIGHT_GOOGLE_CLIENT_SECRET ?? "",
  },
  google_ads: {
    tokenUrl:     "https://oauth2.googleapis.com/token",
    clientId:     process.env.QUIKINSIGHT_GOOGLE_ADS_CLIENT_ID     ?? "",
    clientSecret: process.env.QUIKINSIGHT_GOOGLE_ADS_CLIENT_SECRET ?? "",
  },
  meta_ads: {
    tokenUrl:     "https://graph.facebook.com/v19.0/oauth/access_token",
    clientId:     process.env.META_ADS_APP_ID     ?? "",
    clientSecret: process.env.META_ADS_APP_SECRET ?? "",
  },
  meta: {
    tokenUrl:     "https://graph.facebook.com/v19.0/oauth/access_token",
    clientId:     process.env.META_APP_ID     ?? "",
    clientSecret: process.env.META_APP_SECRET ?? "",
  },
  linkedin: {
    tokenUrl:     "https://www.linkedin.com/oauth/v2/accessToken",
    clientId:     process.env.LINKEDIN_CLIENT_ID     ?? "",
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET ?? "",
  },
  hubspot: {
    tokenUrl:     "https://api.hubapi.com/oauth/v1/token",
    clientId:     process.env.HUBSPOT_CLIENT_ID     ?? "",
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET ?? "",
  },
  salesforce: {
    tokenUrl:     "https://login.salesforce.com/services/oauth2/token",
    clientId:     process.env.SALESFORCE_CLIENT_ID     ?? "",
    clientSecret: process.env.SALESFORCE_CLIENT_SECRET ?? "",
  },
  gbp: {
    tokenUrl:     "https://oauth2.googleapis.com/token",
    clientId:     process.env.QUIKINSIGHT_GOOGLE_CLIENT_ID     ?? "",
    clientSecret: process.env.QUIKINSIGHT_GOOGLE_CLIENT_SECRET ?? "",
  },
  mailchimp: {
    tokenUrl:     "https://login.mailchimp.com/oauth2/token",
    clientId:     process.env.MAILCHIMP_CLIENT_ID     ?? "",
    clientSecret: process.env.MAILCHIMP_CLIENT_SECRET ?? "",
  },
  dynamics: {
    tokenUrl:     "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    clientId:     process.env.DYNAMICS_CLIENT_ID     ?? "",
    clientSecret: process.env.DYNAMICS_CLIENT_SECRET ?? "",
  },
  zoho: {
    tokenUrl:     "https://accounts.zoho.com/oauth/v2/token",
    clientId:     process.env.ZOHO_CLIENT_ID     ?? "",
    clientSecret: process.env.ZOHO_CLIENT_SECRET ?? "",
  },
};

// Fetch minimal metadata after connecting (page IDs, channel IDs, etc.)
async function fetchPlatformMetadata(
  platform: Platform,
  accessToken: string
): Promise<Record<string, string>> {
  try {
    // Meta Ads: list ad accounts and store the first as default
    if (platform === "meta_ads") {
      const accountsRes = await axios.get(
        `https://graph.facebook.com/v19.0/me/adaccounts?fields=id,name,account_status&access_token=${accessToken}`
      );
      const accounts: Array<{ id: string; name: string; account_status?: number }> =
        accountsRes.data?.data ?? [];
      if (accounts.length === 0) return {};
      // Filter to active accounts (status 1 = ACTIVE)
      const active = accounts.filter((a) => a.account_status === 1);
      const first = (active.length > 0 ? active : accounts)[0];
      return {
        adAccountId:  first.id,   // already in act_XXXXXXX format
        accountName:  first.name ?? first.id,
        allAccounts:  JSON.stringify(accounts.map((a) => ({ id: a.id, name: a.name }))),
      };
    }

    // Google Ads: list accessible customer accounts, store the first as default
    if (platform === "google_ads") {
      const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "";
      const res = await axios.get(
        "https://googleads.googleapis.com/v17/customers:listAccessibleCustomers",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "developer-token": devToken,
          },
        }
      );
      const resourceNames: string[] = res.data?.resourceNames ?? [];
      if (resourceNames.length === 0) return {};
      // resourceNames are like "customers/1234567890"
      const customerId = resourceNames[0].replace("customers/", "").replace(/-/g, "");
      // Fetch account name
      let accountName = customerId;
      try {
        const nameRes = await axios.post(
          `https://googleads.googleapis.com/v17/customers/${customerId}/googleAds:searchStream`,
          { query: "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 1" },
          {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "developer-token": devToken,
              "Content-Type": "application/json",
            },
          }
        );
        const text: string = typeof nameRes.data === "string" ? nameRes.data : JSON.stringify(nameRes.data);
        const match = text.match(/"descriptiveName"\s*:\s*"([^"]+)"/);
        if (match) accountName = match[1];
      } catch { /* name is best-effort */ }
      return {
        customerId,
        accountName,
        allCustomers: JSON.stringify(resourceNames.map((r) => ({
          id: r.replace("customers/", "").replace(/-/g, ""),
          name: r,
        }))),
      };
    }
    if (platform === "google") {
      // Fetch GA4 properties, YouTube channels, GSC sites, and GBP accounts in parallel
      const [propsRes, ytRes, ytManagedRes, gscRes, gbpAcctRes] = await Promise.allSettled([
        axios.get(
          "https://analyticsadmin.googleapis.com/v1beta/accountSummaries",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
        axios.get(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&maxResults=50",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
        axios.get(
          "https://youtubeanalytics.googleapis.com/v2/reports?metrics=views&startDate=2000-01-01&endDate=2000-01-01",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
        axios.get(
          "https://www.googleapis.com/webmasters/v3/sites",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
        axios.get(
          "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        ),
      ]);

      if (propsRes.status === "rejected")  console.error("[oauth:google] GA4 admin API failed:", propsRes.reason?.response?.data ?? propsRes.reason?.message);
      if (ytRes.status   === "rejected")  console.error("[oauth:google] YouTube API failed:",    ytRes.reason?.response?.data   ?? ytRes.reason?.message);
      if (gscRes.status  === "rejected")  console.error("[oauth:google] GSC API failed:",        gscRes.reason?.response?.data  ?? gscRes.reason?.message);
      if (gbpAcctRes.status === "rejected") console.error("[oauth:google] GBP accounts API failed:", gbpAcctRes.reason?.response?.data ?? gbpAcctRes.reason?.message);

      // GA4: store ALL properties so user can pick; default to first
      const ga4Meta: Record<string, string> = {};
      if (propsRes.status === "fulfilled") {
        const summaries = propsRes.value.data?.accountSummaries ?? [];
        const allProps: { id: string; name: string }[] = [];
        for (const account of summaries) {
          for (const prop of account.propertySummaries ?? []) {
            allProps.push({
              id:   prop.property?.replace("properties/", "") ?? "",
              name: prop.displayName ?? "",
            });
          }
        }
        if (allProps.length > 0) {
          ga4Meta.propertyId   = allProps[0].id;
          ga4Meta.propertyName = allProps[0].name;
          ga4Meta.allProperties = JSON.stringify(allProps);
        }
      }

      // YouTube: store ALL channels the account owns OR manages
      const ytMeta: Record<string, string> = {};
      const allYTChannels: { id: string; name: string }[] = [];
      
      // Owned channels (mine=true)
      if (ytRes.status === "fulfilled") {
        const items = (ytRes.value.data?.items ?? []) as Array<{ id?: string; snippet?: { title?: string } }>;
        for (const ch of items) {
          if (ch.id) allYTChannels.push({ id: ch.id, name: ch.snippet?.title ?? "" });
        }
      }

      // Managed channels (via managedByMe lookup)
      // Note: We check ytManagedRes status (the dummy report) to see if we even have analytics permission,
      // then we perform a specific lookup for managed channels.
      if (ytManagedRes.status === "fulfilled") {
         try {
           const managedRes = await axios.get(
             "https://www.googleapis.com/youtube/v3/channels?part=snippet&managedByMe=true&maxResults=50",
             { headers: { Authorization: `Bearer ${accessToken}` } }
           );
           const mItems = (managedRes.data?.items ?? []) as Array<{ id?: string; snippet?: { title?: string } }>;
           for (const ch of mItems) {
             if (ch.id && !allYTChannels.some(ex => ex.id === ch.id)) {
               allYTChannels.push({ id: ch.id, name: ch.snippet?.title ?? "" });
             }
           }
         } catch (e) {
           console.error("[oauth:google] Managed YouTube lookup failed:", (e as Error).message);
         }
      }

      if (allYTChannels.length > 0) {
        ytMeta.channelId    = allYTChannels[0].id;
        ytMeta.channelTitle = allYTChannels[0].name;
        ytMeta.allChannels  = JSON.stringify(allYTChannels);
      }

      // GSC: store ALL sites; default to first
      const gscMeta: Record<string, string> = {};
      if (gscRes.status === "fulfilled") {
        const sites: { siteUrl: string; permissionLevel: string }[] =
          gscRes.value.data?.siteEntry ?? [];
        if (sites.length > 0) {
          gscMeta.siteUrl  = sites[0].siteUrl;
          gscMeta.allSites = JSON.stringify(sites.map((s) => s.siteUrl));
        }
      }

      // GBP: list locations for the first account; store all + default
      const gbpMeta: Record<string, string> = {};
      if (gbpAcctRes.status === "rejected" && gbpAcctRes.reason?.response?.status === 429) {
        gbpMeta.quotaBlocked = "true";
      }
      if (gbpAcctRes.status === "fulfilled") {
        const accounts = (gbpAcctRes.value.data?.accounts ?? []) as Array<{ name?: string }>;
        if (accounts[0]?.name) gbpMeta.accountId = accounts[0].name.replace("accounts/", "");
        // Gather locations across every account the user manages.
        const locations: { id: string; name: string }[] = [];
        for (const account of accounts) {
          if (!account?.name) continue;
          try {
            const locRes = await axios.get(
              `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            for (const l of (locRes.data?.locations ?? []) as Array<{ name?: string; title?: string }>) {
              locations.push({ id: l.name?.replace(/^locations\//, "") ?? "", name: l.title ?? "" });
            }
          } catch (e) {
            console.error("[oauth:google] GBP locations API failed:", (e as { response?: { data?: unknown } })?.response?.data ?? (e as Error).message);
          }
        }
        if (locations.length > 0) {
          gbpMeta.locationId   = locations[0].id;
          gbpMeta.locationName = locations[0].name;
          gbpMeta.allLocations = JSON.stringify(locations);
        }
      }

      // Return a combined object — caller splits it per platform
      return {
        ...ga4Meta, ...ytMeta, ...gscMeta,
        _ga4: JSON.stringify(ga4Meta),
        _yt:  JSON.stringify(ytMeta),
        _gsc: JSON.stringify(gscMeta),
        _gbp: JSON.stringify(gbpMeta),
      };
    }

    if (platform === "meta") {
      // Capture ALL pages the user manages (+ each page's linked Instagram) so
      // they can pick which one to sync. Default to the first.
      const pageRes = await axios.get(
        `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,instagram_business_account&access_token=${accessToken}`
      );
      const pages = (pageRes.data?.data ?? []) as Array<{ id: string; name: string; instagram_business_account?: { id: string } }>;
      if (pages.length === 0) return {};

      const allPages = pages.map((p) => ({ id: p.id, name: p.name, igId: p.instagram_business_account?.id ?? "" }));
      const first = pages[0];
      const meta: Record<string, string> = {
        pageId:         first.id,
        selectedPageId: first.id,
        pageName:       first.name,
        allPages:       JSON.stringify(allPages.map((p) => ({ id: p.id, name: p.name }))),
        // page id → linked IG id, so the connector can resolve IG for the chosen page
        pageIgMap:      JSON.stringify(Object.fromEntries(allPages.map((p) => [p.id, p.igId]))),
      };
      if (first.instagram_business_account?.id) meta.igAccountId = first.instagram_business_account.id;
      return meta;
    }

    if (platform === "linkedin") {
      const orgRes = await axios.get(
        "https://api.linkedin.com/v2/organizationalEntityAcls?q=roleAssignee&role=ADMINISTRATOR&projection=(elements*(organizationalTarget~(id,localizedName)))",
        { headers: { Authorization: `Bearer ${accessToken}`, "X-Restli-Protocol-Version": "2.0.0" } }
      );
      const org = orgRes.data?.elements?.[0]?.["organizationalTarget~"];
      if (!org) return {};
      return { organizationId: String(org.id), organizationName: org.localizedName ?? "" };
    }

    if (platform === "hubspot") {
      const res = await axios.get("https://api.hubapi.com/oauth/v1/access-tokens/" + accessToken);
      return { portalId: String(res.data?.hub_id ?? ""), portalName: res.data?.hub_domain ?? "" };
    }

    if (platform === "salesforce") {
      const res = await axios.get(
        "https://login.salesforce.com/services/oauth2/userinfo",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      return { instanceUrl: res.data?.urls?.rest?.replace("/services/data/v{version}/", "") ?? "", orgName: res.data?.organization_id ?? "" };
    }

    if (platform === "gbp") {
      // List GBP accounts → first account's locations
      const acctRes = await axios.get(
        "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const account = acctRes.data?.accounts?.[0];
      if (!account) return {};
      const accountId = account.name?.replace("accounts/", "") ?? "";
      const locRes = await axios.get(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${account.name}/locations?readMask=name,title`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const locations: { id: string; name: string }[] = (locRes.data?.locations ?? []).map(
        (l: { name?: string; title?: string }) => ({
          id:   l.name?.replace(/^locations\//, "") ?? "",
          name: l.title ?? "",
        })
      );
      const meta: Record<string, string> = { accountId };
      if (locations.length > 0) {
        meta.locationId   = locations[0].id;
        meta.locationName = locations[0].name;
        meta.allLocations = JSON.stringify(locations);
      }
      return meta;
    }

    if (platform === "mailchimp") {
      const res = await axios.get("https://login.mailchimp.com/oauth2/metadata", {
        headers: { Authorization: `OAuth ${accessToken}` },
      });
      return {
        dc:          res.data?.dc ?? "",
        accountId:   String(res.data?.accountname ?? res.data?.user_id ?? ""),
        apiEndpoint: res.data?.api_endpoint ?? "",
      };
    }

    if (platform === "dynamics") {
      const configured = (process.env.DYNAMICS_RESOURCE ?? "").replace(/\/$/, "");
      if (configured) {
        // Token is scoped to the configured org — read org name from its Web API
        try {
          const res = await axios.get(
            `${configured}/api/data/v9.2/organizations?$select=name`,
            { headers: { Authorization: `Bearer ${accessToken}`, "OData-MaxVersion": "4.0", "OData-Version": "4.0", Accept: "application/json" } }
          );
          return { resourceUrl: configured, orgName: res.data?.value?.[0]?.name ?? "" };
        } catch {
          return { resourceUrl: configured };
        }
      }
      // No configured resource — discover the user's first org via Global Discovery
      const disco = await axios.get(
        "https://globaldisco.crm.dynamics.com/api/discovery/v2.0/Instances",
        { headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" } }
      );
      const inst = disco.data?.value?.[0];
      return {
        resourceUrl: (inst?.ApiUrl ?? inst?.Url ?? "").replace(/\/$/, ""),
        orgName:     inst?.FriendlyName ?? "",
      };
    }

    if (platform === "zoho") {
      const apiDomain = "https://www.zohoapis.com";
      const res = await axios.get(`${apiDomain}/crm/v3/org`, {
        headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      });
      return {
        apiDomain,
        orgName: res.data?.org?.[0]?.company_name ?? "",
      };
    }
  } catch {
    // Metadata is best-effort; don't fail the connection
  }
  return {};
}

export async function GET(
  req: NextRequest,
  { params }: { params: { platform: string } }
) {
  const platform = params.platform as Platform;
  const config   = PLATFORM_CONFIGS[platform];
  const endpoint = TOKEN_ENDPOINTS[platform];
  const redirectBase = `${BASE_URL}/integrations`;

  if (!config || !endpoint) {
    return NextResponse.redirect(
      new URL(`${redirectBase}?error=unknown_platform`, BASE_URL)
    );
  }

  // Mailchimp's callback lands on the 127.0.0.1 loopback host (it rejects
  // "localhost"), so the session + CSRF cookies aren't available here. It uses
  // a signed `state` carrying the userId instead. Every other platform keeps
  // the session + cookie-based CSRF check.
  const useSignedState = platform === "mailchimp";
  const appOrigin = useSignedState ? BASE_URL.replace("localhost", "127.0.0.1") : BASE_URL;
  const incomingState = req.nextUrl.searchParams.get("state");

  let userId: string;
  let orgId: string;
  if (useSignedState) {
    const verified = verifyOAuthState(incomingState);
    if (!verified) {
      return NextResponse.redirect(
        new URL(`${redirectBase}?error=invalid_state`, BASE_URL)
      );
    }
    userId = verified.userId;
    orgId = verified.orgId as string;
  } else {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/login", BASE_URL));
    }
    const storedState = req.cookies.get(`oauth_state_${platform}`)?.value;
    if (!incomingState || incomingState !== storedState) {
      return NextResponse.redirect(
        new URL(`${redirectBase}?error=invalid_state`, BASE_URL)
      );
    }
    userId = session.user.id;
    orgId = session.user.orgId as string;
  }

  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`${redirectBase}?error=${error ?? "no_code"}`, BASE_URL)
    );
  }

  try {
    const callbackUrl = `${appOrigin}/api/oauth/${platform}/callback`;

    // Exchange code for tokens
    const tokenPayload: Record<string, string> = {
      code,
      client_id:     endpoint.clientId,
      client_secret: endpoint.clientSecret,
      redirect_uri:  callbackUrl,
      grant_type:    "authorization_code",
    };

    // HubSpot requires PKCE — include code_verifier from the initiation cookie
    const pkceVerifier = req.cookies.get(`oauth_pkce_${platform}`)?.value;
    if (pkceVerifier) {
      tokenPayload.code_verifier = pkceVerifier;
    }

    const tokenRes = await axios.post<TokenResponse>(
      endpoint.tokenUrl,
      new URLSearchParams(tokenPayload).toString(),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const tokens = tokenRes.data;

    // ── Dynamics 365: multi-tenant org resolution ──────────────────────────
    // For arbitrary users we don't know their org URL up front, so the initial
    // token is scoped to Global Discovery. Discover the user's org, then swap
    // the refresh token for an ORG-scoped access token (Azure AD refresh tokens
    // are not resource-bound, so this is allowed). If DYNAMICS_RESOURCE is set,
    // the token is already org-scoped and we skip discovery.
    let dynamicsResource = "";
    if (platform === "dynamics") {
      const envResource = (process.env.DYNAMICS_RESOURCE ?? "").replace(/\/$/, "");
      dynamicsResource = envResource;
      if (!envResource) {
        try {
          const disco = await axios.get(
            "https://globaldisco.crm.dynamics.com/api/discovery/v2.0/Instances",
            { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: "application/json" } }
          );
          const inst = disco.data?.value?.[0];
          dynamicsResource = (inst?.ApiUrl ?? inst?.Url ?? "").replace(/\/$/, "");

          if (dynamicsResource && tokens.refresh_token) {
            const orgTok = await axios.post<TokenResponse>(
              endpoint.tokenUrl,
              new URLSearchParams({
                grant_type:    "refresh_token",
                client_id:     endpoint.clientId,
                client_secret: endpoint.clientSecret,
                refresh_token: tokens.refresh_token,
                scope:         `offline_access ${dynamicsResource}/.default`,
              }).toString(),
              { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
            );
            tokens.access_token  = orgTok.data.access_token;
            tokens.refresh_token = orgTok.data.refresh_token ?? tokens.refresh_token;
            tokens.expires_in    = orgTok.data.expires_in ?? tokens.expires_in;
          }
        } catch (e) {
          console.error("[oauth:dynamics] org discovery / token swap failed:",
            (e as { response?: { data?: unknown } })?.response?.data ?? (e as Error).message);
        }
      }
    }

    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

    // Fetch platform metadata. Dynamics is handled inline (its token is now
    // org-scoped, so a second Global Discovery call would fail).
    let metadata: Record<string, string>;
    if (platform === "dynamics") {
      metadata = { resourceUrl: dynamicsResource };
      try {
        const orgRes = await axios.get(
          `${dynamicsResource}/api/data/v9.2/organizations?$select=name`,
          { headers: { Authorization: `Bearer ${tokens.access_token}`, "OData-MaxVersion": "4.0", "OData-Version": "4.0", Accept: "application/json" } }
        );
        metadata.orgName = orgRes.data?.value?.[0]?.name ?? "";
      } catch { /* org name is best-effort */ }
    } else {
      metadata = await fetchPlatformMetadata(platform, tokens.access_token);
    }

    // Google OAuth covers GA4 + YouTube + Search Console + Business Profile — upsert all with split metadata
    const platformEntries: { platform: string; meta: Record<string, string> }[] =
      platform === "google"
        ? [
            { platform: "GOOGLE_ANALYTICS",        meta: JSON.parse((metadata as Record<string,string>)._ga4  ?? "{}") },
            { platform: "YOUTUBE",                 meta: JSON.parse((metadata as Record<string,string>)._yt   ?? "{}") },
            { platform: "GOOGLE_SEARCH_CONSOLE",   meta: JSON.parse((metadata as Record<string,string>)._gsc  ?? "{}") },
            { platform: "GOOGLE_BUSINESS_PROFILE", meta: JSON.parse((metadata as Record<string,string>)._gbp  ?? "{}") },
          ]
        : [{ platform: PLATFORM_TO_PRISMA[platform] ?? platform.toUpperCase(), meta: metadata as Record<string,string> }];

    await Promise.all(platformEntries.map(async ({ platform: prismaPlatform, meta }) => {
      const workspaceId = await getActiveWorkspaceId(userId, orgId);
      return prisma.platformConnection.upsert({
        where:  { workspaceId_platform: { workspaceId, platform: prismaPlatform as never } },
        create: {
          userId,
          orgId,
          workspaceId,
          platform:       prismaPlatform as never,
          accessToken:    tokens.access_token,
          refreshToken:   tokens.refresh_token ?? null,
          tokenExpiresAt: expiresAt,
          scopes:         config.scopes,
          metadata:       meta,
          status:         "CONNECTED",
        },
        update: {
          accessToken:    tokens.access_token,
          refreshToken:   tokens.refresh_token ?? undefined,
          tokenExpiresAt: expiresAt,
          scopes:         config.scopes,
          metadata:       meta,
          status:         "CONNECTED",
          updatedAt:      new Date(),
        },
      });
    }));

    clearCache(); // new connection — force dashboard to re-aggregate

    // Redirect back to the localhost dashboard (where the user's session
    // lives), clearing the CSRF cookie for the cookie-based flows.
    const res = NextResponse.redirect(
      new URL(`${redirectBase}?connected=${platform}`, BASE_URL)
    );
    if (!useSignedState) res.cookies.delete(`oauth_state_${platform}`);
    res.cookies.delete(`oauth_pkce_${platform}`);
    return res;
  } catch (err) {
    const detail =
      (err as { response?: { data?: unknown } })?.response?.data
        ? JSON.stringify((err as { response: { data: unknown } }).response.data)
        : err instanceof Error ? err.message : String(err);
    console.error(`[oauth:${platform}] connect failed:`, detail);
    return NextResponse.redirect(
      new URL(`${redirectBase}?error=connect_failed&reason=${encodeURIComponent(detail).slice(0, 300)}`, BASE_URL)
    );
  }
}
