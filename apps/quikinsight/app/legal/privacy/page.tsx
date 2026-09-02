import LegalShell from "@/components/legal/LegalShell";

const APP_NAME = "QuikInsight";

/**
 * Google Cloud OAuth verification — https://support.google.com/cloud/answer/13807376
 *
 * This page is submitted as the app's Privacy Policy URL on the OAuth consent
 * screen. It must explicitly state, in plain language and without requiring
 * sign-in, WHY the app requests access to each category of user data — a
 * scope requested on the consent screen but not explained here is a
 * documented rejection reason. The connector list and Google scopes below are
 * pulled from lib/types/connections.ts (PLATFORM_CONFIGS) — the single source
 * of truth for what this app actually requests. If a connector or scope
 * changes there, update this list in the same PR.
 */
const GOOGLE_SCOPES = [
  { scope: "analytics.readonly", purpose: "Read your Google Analytics 4 sessions, users, traffic sources and conversions, to display them in your dashboard." },
  { scope: "youtube.readonly / yt-analytics.readonly", purpose: "Read your YouTube channel's public stats and analytics (views, subscribers, likes, comments), to display them in your dashboard." },
  { scope: "webmasters.readonly", purpose: "Read your verified site's Search Console performance (clicks, impressions, queries, pages), to display them in your dashboard." },
  { scope: "business.manage", purpose: "Read your Google Business Profile's searches, calls, reviews, and directions requests, to display them in your dashboard." },
  { scope: "adwords", purpose: "Read your Google Ads spend, conversions, ROAS and campaign performance, to display them in your dashboard." },
];

const OTHER_CONNECTORS = [
  { name: "Meta (Facebook & Instagram)", purpose: "Read your connected Facebook Page's and linked Instagram Business account's reach, engagement, and post performance." },
  { name: "Meta Ads", purpose: "Read ad spend, reach, ROAS and campaign performance across your connected Facebook and Instagram ad accounts." },
  { name: "LinkedIn", purpose: "Read your Company Page's follower count, reach, impressions, and post performance." },
  { name: "HubSpot", purpose: "Read your CRM contacts, deals, and pipeline data." },
  { name: "Salesforce", purpose: "Read your opportunities, contacts, and sales pipeline data." },
  { name: "Mailchimp", purpose: "Read your email campaigns' open rate, click rate, and subscriber counts." },
  { name: "Dynamics 365", purpose: "Read your CRM accounts, opportunities, and pipeline data." },
  { name: "Zoho CRM", purpose: "Read your contacts, deals, and sales pipeline data." },
  { name: "QuikCRM", purpose: "Read your contacts, deals, pipeline, and revenue data via an API key you provide." },
];

export default function PrivacyPolicyPage() {
  return (
    <LegalShell title="Privacy Policy" updated="September 2, 2026">
      <h2>Who we are</h2>
      <p>
        {APP_NAME} is operated by QuikIT (&quot;we&quot;, &quot;us&quot;). If you have questions
        about this policy or your data, contact us at{" "}
        <a href="mailto:support@quikit.ai">support@quikit.ai</a>. This policy is governed by the
        laws of India, with the courts of Madhya Pradesh having exclusive jurisdiction.
      </p>

      <h2>What {APP_NAME} does</h2>
      <p>
        {APP_NAME} is a marketing analytics dashboard. It connects to the marketing, advertising,
        and CRM accounts you choose to link, and unifies their metrics into a single live
        dashboard with AI-generated insights, grounded in rule-based analysis of your own numbers.
        {" "}{APP_NAME}{" "}
        only reads data from the accounts you explicitly connect — nothing is accessed until you
        complete that account&apos;s connection flow, and each connection can be disconnected at
        any time from the Integrations page.
      </p>

      <h2>Why we request access to your Google data</h2>
      <p>
        When you connect a Google account, {APP_NAME} requests the following scopes. Each is used
        for exactly one purpose: reading the corresponding metrics so they can be displayed back
        to you in your own dashboard.
      </p>
      <ul>
        {GOOGLE_SCOPES.map((s) => (
          <li key={s.scope}>
            <strong>{s.scope}</strong> — {s.purpose}
          </li>
        ))}
      </ul>
      <p>
        {APP_NAME} requests <strong>read-only</strong> access wherever a provider offers it. We do
        not modify, delete, or post on your behalf using these scopes, we do not sell the data
        obtained through them, and we do not share it with third parties for advertising purposes.
      </p>

      <h2>Other connected accounts</h2>
      <p>Beyond Google, {APP_NAME} supports connecting the following accounts. As with Google, each is read-only and used solely to populate your dashboard:</p>
      <ul>
        {OTHER_CONNECTORS.map((c) => (
          <li key={c.name}>
            <strong>{c.name}</strong> — {c.purpose}
          </li>
        ))}
      </ul>

      <h2>Data we store</h2>
      <p>
        To keep your dashboard working between visits, {APP_NAME} stores: the OAuth access and
        refresh tokens for each account you connect (so we can refresh your metrics without asking
        you to reconnect every time), the metrics retrieved from those accounts, and basic account
        information (your name, email, and organization) used to authenticate you via the QuikIT
        single sign-on.
      </p>

      <h2>Data retention</h2>
      <p>
        When you disconnect a connected account from the Integrations page, its stored access and
        refresh tokens are deleted immediately. Metrics already retrieved from that account may
        remain in your dashboard history until you delete them.
      </p>
      <p>
        QuikIT does not currently offer self-service account deletion. Disconnecting your
        platform connections, as described above, does not delete your {APP_NAME} account or your
        dashboard history. If you would like your {APP_NAME} data — including any stored tokens,
        connections, and retrieved metrics — deleted, contact us at{" "}
        <a href="mailto:support@quikit.ai">support@quikit.ai</a> and we will process your request
        manually.
      </p>

      <h2>Security measures</h2>
      <p>
        OAuth access and refresh tokens are stored encrypted at rest. Access to stored tokens and
        metrics is restricted to the systems that need them to render your dashboard and refresh
        your data, and all connections to third-party providers use OAuth over HTTPS. No plaintext
        passwords for connected accounts are ever collected or stored — authentication is handled
        entirely through each provider&apos;s own OAuth flow.
      </p>

      <h2>Cookies and tracking</h2>
      <p>
        {APP_NAME} does not use third-party analytics, advertising, or tracking scripts on this
        site. We use only the cookies required for you to sign in and stay signed in via QuikIT
        single sign-on.
      </p>

      <h2>Children&apos;s privacy</h2>
      <p>
        {APP_NAME} is not directed at, and is not intended for use by, anyone under the age of 18.
      </p>

      <h2>How to revoke access</h2>
      <p>
        You can disconnect any connected account at any time from {APP_NAME}&apos;s Integrations
        page — this deletes the stored access token immediately. You can also revoke {APP_NAME}
        &apos;s access directly from the third-party provider (for example, from your{" "}
        <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
          Google Account permissions
        </a>{" "}
        page for Google-connected accounts).
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We may update this policy from time to time. Material changes will be reflected by
        updating the &quot;Last updated&quot; date above.
      </p>
    </LegalShell>
  );
}
