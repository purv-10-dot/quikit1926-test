import type { Connector } from "@/types";

export const connectors: Connector[] = [
  { id: "ga4",     name: "Google Analytics 4",        category: "Analytics",        initials: "GA", color: "#4285F4", connected: false },
  { id: "gsc",     name: "Google Search Console",     category: "Analytics",        initials: "SC", color: "#34A853", connected: false },
  { id: "youtube", name: "YouTube",                   category: "Organic & social", initials: "YT", color: "#FF0000", connected: false },
  { id: "gads",    name: "Google Ads",                category: "Advertising",      initials: "Ad", color: "#4285F4", connected: true  },
  { id: "meta_ads", name: "Meta Ads", category: "Advertising", initials: "Me", color: "#0866FF", connected: true },
  { id: "li_ads", name: "LinkedIn Ads", category: "Advertising", initials: "in", color: "#0A66C2", connected: false },
  { id: "x_ads", name: "X Ads", category: "Advertising", initials: "X", color: "#14171A", connected: false },
  { id: "li_page", name: "LinkedIn Company Page", category: "Organic & social", initials: "in", color: "#0A66C2", connected: false },
  { id: "meta", name: "Meta (Facebook & Instagram)", category: "Organic & social", initials: "M", color: "#0866FF", connected: false },
  { id: "x_organic", name: "X (Twitter)", category: "Organic & social", initials: "X", color: "#14171A", connected: false },
  { id: "hubspot", name: "HubSpot", category: "CRM", initials: "Hs", color: "#FF7A59", connected: true },
  { id: "salesforce", name: "Salesforce", category: "CRM", initials: "Sf", color: "#00A1E0", connected: false },
  { id: "genericcrm", name: "Generic CRM", category: "CRM", initials: "DB", color: "#63667A", connected: false },
  { id: "mailchimp", name: "Mailchimp", category: "Email & outbound", initials: "Mc", color: "#FFE01B", connected: false },
  { id: "klaviyo", name: "Klaviyo", category: "Email & outbound", initials: "Kl", color: "#111111", connected: false },
  { id: "instantly", name: "Instantly", category: "Email & outbound", initials: "In", color: "#6C5CE0", connected: false },
];

// Curated subset shown in the sidebar's "Connected platforms" list.
export const sidebarPlatformGroups = [
  { name: "Organic", icon: "↗", color: null, connectorIds: ["ga4", "gsc", "youtube", "meta", "li_page", "x_organic"] },
  { name: "Paid", icon: "$", color: null, connectorIds: ["gads", "meta_ads", "li_ads", "x_ads"] },
  { name: "Email Marketing", icon: "@", color: null, connectorIds: ["mailchimp", "klaviyo", "instantly"] },
];

// CRM connector ids used by the Leads page banner
export const crmConnectorIds = ["hubspot", "salesforce", "genericcrm"];
