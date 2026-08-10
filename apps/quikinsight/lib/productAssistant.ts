// Rule-based product assistant — no AI, no network, fully deterministic.

export interface AssistantMessage {
  role: "user" | "assistant";
  text: string;
  suggestions?: string[];
}

interface Rule {
  patterns: RegExp[];
  response: string;
  suggestions?: string[];
}

const RULES: Rule[] = [
  {
    patterns: [/\bhello\b|\bhi\b|\bhey\b|\bgreet/i],
    response: "👋 Hi there! I'm the QuikInsight assistant. I can help you navigate the tool, understand features, or troubleshoot connections. What would you like to know?",
    suggestions: ["What can QuikInsight do?", "How do I connect Google Analytics?", "What is the Ask AI feature?"],
  },
  {
    patterns: [/what.*quikinsight|what.*this tool|what.*app|what.*platform|overview of/i],
    response: "**QuikInsight** is a unified marketing intelligence platform. It pulls data from your connected channels — Google Analytics, Search Console, Meta, LinkedIn, Google Ads, Meta Ads, email tools, and more — and surfaces it in one dashboard.\n\nKey capabilities:\n• **Dashboard** — live KPIs, channel performance, organic reach\n• **Ask AI** — ask natural-language questions about your data\n• **Insights** — AI-generated weekly recommendations\n• **Reports** — exportable PDF/email performance reports\n• **Integrations** — connect and manage all your data sources\n• **Leads** — pipeline and CRM overview",
    suggestions: ["How do I connect a platform?", "What is the Insights feature?", "How does Ask AI work?"],
  },
  {
    patterns: [/connect.*google analytics|google analytics.*connect|ga4/i],
    response: "To connect **Google Analytics 4**:\n1. Go to **Integrations** in the left sidebar\n2. Find Google Analytics 4 and click **Connect**\n3. Sign in with the Google account that has access to your GA4 property\n4. Select the GA4 property you want to track\n5. Click **Save** — data will appear in the Dashboard within seconds.",
    suggestions: ["How do I connect Google Ads?", "How do I connect Search Console?", "What data does GA4 show?"],
  },
  {
    patterns: [/connect.*google.*search|search console|gsc/i],
    response: "To connect **Google Search Console**:\n1. Go to **Integrations**\n2. Find Google Search Console and click **Connect**\n3. Authenticate with the same Google account used in Search Console\n4. Pick the site/property you want to monitor\n5. Organic keyword and click data will populate in the Dashboard.",
    suggestions: ["How do I connect GA4?", "What data does Search Console show?"],
  },
  {
    patterns: [/connect.*meta|connect.*facebook|connect.*instagram/i],
    response: "To connect **Meta (Facebook & Instagram)**:\n1. Go to **Integrations**\n2. Click **Connect** on Meta (Facebook & Instagram)\n3. You'll be redirected to Facebook OAuth — approve the requested permissions\n4. Select the Facebook Page to track\n5. If that Page has a linked Instagram Business account, Instagram data will also be pulled in automatically.",
    suggestions: ["What Meta data is shown?", "How do I connect Meta Ads?"],
  },
  {
    patterns: [/connect.*linkedin/i],
    response: "To connect **LinkedIn Company Page**:\n1. Go to **Integrations**\n2. Click **Connect** on LinkedIn\n3. Authenticate with a LinkedIn account that is an admin of your Company Page\n4. Select your organisation\n5. Follower growth, impressions, and engagement data will appear in the Dashboard.",
    suggestions: ["How do I connect Meta?", "How do I connect Google Analytics?"],
  },
  {
    patterns: [/connect.*google.*ads|google ads/i],
    response: "To connect **Google Ads**:\n1. Go to **Integrations**\n2. Find Google Ads and click **Connect**\n3. Sign in with the Google account linked to your Ads account\n4. Select the Ads customer account\n5. Spend, impressions, clicks, and ROAS will show in the Paid section of your Dashboard.",
    suggestions: ["How do I connect Meta Ads?", "What paid metrics are tracked?"],
  },
  {
    patterns: [/connect.*meta.*ads|meta ads/i],
    response: "To connect **Meta Ads**:\n1. Go to **Integrations**\n2. Click **Connect** on Meta Ads\n3. Authenticate via Facebook OAuth (same flow as connecting the Page)\n4. Select your Ad Account\n5. Campaign spend, reach, and ROAS data will populate in the Paid section.",
    suggestions: ["How do I connect Google Ads?", "What paid metrics are tracked?"],
  },
  {
    patterns: [/connect.*email|mailchimp|klaviyo|instantly/i],
    response: "To connect an **Email Marketing** tool:\n1. Go to **Integrations**\n2. Find Mailchimp, Klaviyo, or Instantly in the Email Marketing section\n3. Click **Connect** and enter your API key (found in the tool's account settings)\n4. Email open rates, click rates, and subscriber data will flow into the Dashboard.",
    suggestions: ["What email metrics are shown?", "How do I connect Google Analytics?"],
  },
  {
    patterns: [/ask ai|ai chat|ai feature|ai assistant|gemini/i],
    response: "**Ask AI** is a conversational interface grounded in your live connected data. You can ask questions like:\n• *\"What drove the traffic drop last week?\"*\n• *\"Which ad campaign has the best ROAS?\"*\n• *\"Summarise my LinkedIn performance this month\"*\n\nAnswers are generated using your actual metrics — not generic information. Find it in the **Ask AI** section of the sidebar.",
    suggestions: ["What is the Insights feature?", "How do I connect a platform?"],
  },
  {
    patterns: [/insight|recommendation|suggest/i],
    response: "**Insights** are AI-generated observations and recommendations based on your connected data. They appear in the **Insights** section and are also emailed to you on a weekly or daily schedule.\n\nEach insight is tagged as:\n• 🔴 **Attention** — something needs action\n• 🟢 **Good** — a positive trend\n• 🔵 **Decision** — a choice you should make\n\nYou can mark insights as resolved once actioned.",
    suggestions: ["How do I set up email insights?", "What is Ask AI?"],
  },
  {
    patterns: [/report|export|pdf|email report/i],
    response: "**Reports** let you generate and export performance summaries. Go to the **Reports** section to:\n• View a generated narrative for any date range\n• Email the report to stakeholders\n• Export as PDF\n\nReports are automatically generated from all your connected platforms.",
    suggestions: ["What platforms can I connect?", "What is the Insights feature?"],
  },
  {
    patterns: [/dashboard|overview|kpi|metric/i],
    response: "The **Dashboard** (Overview) shows:\n• **Score card** — overall marketing health score out of 100\n• **KPI strip** — Sessions, Leads, Pipeline, and ROAS at a glance\n• **Channel performance** — per-channel reach, engagement, and trend\n• **AI brief** — top 3 actions recommended today\n• **Organic platforms** — follower and engagement breakdown\n• **Recommendations** — prioritised suggestions\n\nAll cards update in real time from your connected platforms.",
    suggestions: ["How do I connect a platform?", "What is Ask AI?"],
  },
  {
    patterns: [/lead|crm|hubspot|salesforce/i],
    response: "The **Leads** page shows your pipeline data pulled from connected CRMs (HubSpot, Salesforce). You can see:\n• Total leads by channel source\n• Pipeline value\n• Conversion rates\n\nConnect your CRM in **Integrations** to enable this view.",
    suggestions: ["How do I connect HubSpot?", "What is the Dashboard?"],
  },
  {
    patterns: [/integration|connect.*platform|add.*platform/i],
    response: "All platform connections are managed in **Integrations** (sidebar → Integrations). Available connections:\n\n**Organic:** Google Analytics, Search Console, YouTube, Meta (FB+IG), LinkedIn, X\n**Paid:** Google Ads, Meta Ads, LinkedIn Ads, X Ads\n**Email:** Mailchimp, Klaviyo, Instantly\n**CRM:** HubSpot, Salesforce\n\nClick **Connect** next to any platform and follow the OAuth or API-key flow.",
    suggestions: ["How do I connect Google Analytics?", "How do I connect Meta?", "How do I connect email tools?"],
  },
  {
    patterns: [/team|member|collaborat/i],
    response: "The **Team** section shows your team's OKRs, KPIs, priorities, and weekly wins. It's designed for marketing team alignment — every member can see shared goals and track progress.",
    suggestions: ["What is the Dashboard?", "What can QuikInsight do?"],
  },
  {
    patterns: [/pricing|plan|upgrade|cost|subscription/i],
    response: "For pricing and plan details, please visit the QuikInsight website or contact your account manager. From within the app you can see your current plan and credit usage in the bottom-left of the sidebar.",
    suggestions: ["What can QuikInsight do?", "How do I connect a platform?"],
  },
  {
    patterns: [/data.*refresh|how.*often|update.*frequen|real.?time/i],
    response: "Data refresh rates depend on the platform:\n• **Google Analytics / Search Console** — daily (Google's API limit)\n• **Meta / LinkedIn / YouTube** — every few hours\n• **Google Ads / Meta Ads** — near real-time (hourly)\n• **Email tools** — hourly\n\nDashboard cards always show the most recently fetched data.",
    suggestions: ["What data does the Dashboard show?", "How do I connect a platform?"],
  },
  {
    patterns: [/not.*connect|disconnect|error.*connect|can.*connect|troubleshoot/i],
    response: "If a platform isn't connecting:\n1. Go to **Integrations** and check the status indicator\n2. Click **Reconnect** to refresh the OAuth token\n3. Make sure the account you're authenticating with has admin access to the platform\n4. Check that your browser isn't blocking third-party cookies (needed for OAuth)\n5. If the issue persists, disconnect and reconnect from scratch.",
    suggestions: ["How do I connect Google Analytics?", "How do I connect Meta?"],
  },
  {
    patterns: [/thank|thanks|cheers|great|perfect|awesome|helpful/i],
    response: "Happy to help! Is there anything else you'd like to know about QuikInsight?",
    suggestions: ["What can QuikInsight do?", "How do I connect a platform?", "What is Ask AI?"],
  },
];

const FALLBACK: AssistantMessage = {
  role: "assistant",
  text: "I'm not sure about that one. Here are some things I can help with:",
  suggestions: ["What can QuikInsight do?", "How do I connect a platform?", "What is Ask AI?", "What does the Dashboard show?"],
};

export function getAssistantReply(input: string): AssistantMessage {
  const trimmed = input.trim();
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(trimmed))) {
      return { role: "assistant", text: rule.response, suggestions: rule.suggestions };
    }
  }
  return FALLBACK;
}

export const WELCOME: AssistantMessage = {
  role: "assistant",
  text: "👋 Hi! I'm the **QuikInsight Assistant**. I can help you understand the tool, connect platforms, or find features. What would you like to know?",
  suggestions: ["What can QuikInsight do?", "How do I connect Google Analytics?", "What is Ask AI?"],
};
