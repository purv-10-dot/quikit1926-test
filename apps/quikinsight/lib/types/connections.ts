export type Platform =
  | "google"
  | "google_ads"
  | "gbp"
  | "meta"
  | "meta_ads"
  | "linkedin"
  | "hubspot"
  | "salesforce"
  | "mailchimp"
  | "dynamics"
  | "zoho"
  | "quikcrm";

export interface PlatformConfig {
  id:          Platform;
  name:        string;
  description: string;
  color:       string;
  scopes:      string[];
  dataTypes:   string[];
}

export interface ConnectionStatus {
  platform:    Platform;
  connected:   boolean;
  connectedAt?: string;
  lastSync?:   string;
  metadata?:   Record<string, string>;
  error?:      string;
}

// ─── Per-platform metadata stored in JSON column ─────────────────────────────

export interface GoogleMetadata {
  propertyId?:    string;
  propertyName?:  string;
  allProperties?: string; // JSON string of [{id,name}]
  allSites?:      string; // JSON string of site URLs
  channelId?:     string;
  channelTitle?:  string;
  allChannels?:   string; // JSON string of [{id,name}]
  siteUrl?:       string;
}

export interface MetaMetadata {
  pageId?:       string;
  pageName?:     string;
  igAccountId?:  string;
}

export interface LinkedInMetadata {
  organizationId?:   string;
  organizationName?: string;
}

export interface HubSpotMetadata {
  portalId?:   string;
  portalName?: string;
}

export interface SalesforceMetadata {
  instanceUrl?: string;
  orgName?:     string;
}

export interface GbpMetadata {
  accountId?:   string;
  locationId?:  string;
  locationName?: string;
  allLocations?: string; // JSON string of [{id,name}]
}

export interface MailchimpMetadata {
  dc?:        string; // data-center prefix, e.g. "us21"
  accountId?: string;
  apiEndpoint?: string;
}

export interface DynamicsMetadata {
  resourceUrl?: string; // org Web API base, e.g. https://org.crm.dynamics.com
  orgName?:     string;
}

export interface ZohoMetadata {
  apiDomain?: string; // e.g. https://www.zohoapis.com (region-specific)
  orgName?:   string;
}

export interface QuikCRMMetadata {
  apiUrl?:  string; // base URL entered by user, e.g. https://api.quikcrm.com
  orgId?:   string;
  orgName?: string;
}

export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  google: {
    id:          "google",
    name:        "Google",
    description: "GA4, YouTube, Search Console & Business Profile",
    color:       "#4285F4",
    scopes: [
      "https://www.googleapis.com/auth/analytics.readonly",
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
      "https://www.googleapis.com/auth/webmasters.readonly",
      "https://www.googleapis.com/auth/business.manage",
    ],
    dataTypes: ["Web Traffic", "YouTube", "Search", "Business Profile"],
  },
  google_ads: {
    id:          "google_ads",
    name:        "Google Ads",
    description: "Ad spend, conversions, ROAS, and campaign performance",
    color:       "#4285F4",
    scopes:      ["https://www.googleapis.com/auth/adwords"],
    dataTypes:   ["Spend", "Conversions", "ROAS", "Campaigns"],
  },
  meta: {
    id:          "meta",
    name:        "Meta",
    description: "Facebook Page insights + Instagram Business",
    color:       "#1877F2",
    scopes: [
      "pages_show_list",
      "pages_read_engagement",
      "instagram_basic",
      "instagram_manage_insights",
    ],
    dataTypes: ["Facebook Reach", "Instagram Reach", "Engagement"],
  },
  meta_ads: {
    id:          "meta_ads",
    name:        "Meta Ads",
    description: "Ad spend, reach, ROAS across Facebook & Instagram",
    color:       "#0866FF",
    scopes:      ["ads_read"],
    dataTypes:   ["Spend", "Reach", "ROAS", "Campaigns"],
  },
  linkedin: {
    id:          "linkedin",
    name:        "LinkedIn",
    description: "Company page analytics and follower data",
    color:       "#0A66C2",
    // Community Management API scopes — required to read the company page's
    // admin ACLs (to discover organizationId) and follower/share statistics.
    // r_member_postAnalytics: personal post impressions/engagement
    // r_member_profileAnalytics: personal follower count
    // These must be approved on the LinkedIn app or LinkedIn rejects the
    // authorization with `unauthorized_scope_error`.
    scopes:      ["r_organization_social", "rw_organization_admin", "r_basicprofile", "r_member_postAnalytics", "r_member_profileAnalytics"],
    dataTypes:   ["LinkedIn Reach", "Impressions", "Followers", "Page Views", "Posts", "Video Views"],
  },
  hubspot: {
    id:          "hubspot",
    name:        "HubSpot",
    description: "CRM contacts, deals, and pipeline data",
    color:       "#FF7A59",
    scopes:      ["oauth", "crm.objects.contacts.read", "crm.objects.deals.read"],
    dataTypes:   ["Leads", "Pipeline", "Revenue"],
  },
  salesforce: {
    id:          "salesforce",
    name:        "Salesforce",
    description: "Opportunities, contacts, and sales pipeline",
    color:       "#00A1E0",
    scopes:      ["api", "refresh_token"],
    dataTypes:   ["Opportunities", "Pipeline Value"],
  },
  gbp: {
    id:          "gbp",
    name:        "Google Business Profile",
    description: "Searches, calls, reviews, directions, and ratings",
    color:       "#34A853",
    scopes:      ["https://www.googleapis.com/auth/business.manage"],
    dataTypes:   ["Searches", "Calls", "Reviews", "Directions"],
  },
  mailchimp: {
    id:          "mailchimp",
    name:        "Mailchimp",
    description: "Email campaigns — opens, clicks, and subscribers",
    color:       "#FFE01B",
    scopes:      [],
    dataTypes:   ["Open Rate", "Click Rate", "Subscribers"],
  },
  dynamics: {
    id:          "dynamics",
    name:        "Dynamics 365",
    description: "Microsoft CRM accounts, opportunities, and pipeline",
    color:       "#0078D4",
    scopes:      [], // resource-scoped at runtime (see OAuth route)
    dataTypes:   ["Accounts", "Opportunities", "Pipeline"],
  },
  zoho: {
    id:          "zoho",
    name:        "Zoho CRM",
    description: "Contacts, deals, and sales pipeline",
    color:       "#E42527",
    scopes:      ["ZohoCRM.modules.READ", "ZohoCRM.settings.READ"],
    dataTypes:   ["Contacts", "Deals", "Pipeline"],
  },
  quikcrm: {
    id:          "quikcrm",
    name:        "QuikCRM",
    description: "Contacts, deals, and sales pipeline via API key",
    color:       "#0EA5E9",
    scopes:      [],
    dataTypes:   ["Contacts", "Deals", "Pipeline", "Revenue"],
  },
};
