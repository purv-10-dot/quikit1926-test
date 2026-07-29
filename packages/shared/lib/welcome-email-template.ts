/**
 * Welcome / trial-started email content renderer.
 *
 * Pure template module — takes the recipient's first name and returns
 * `{ subject, html }`. Apps wire their own transport (SMTP via nodemailer,
 * Resend, …) and pass the rendered subject + HTML through, exactly like
 * `onboarding-email-template.ts`. Same rationale: provider swaps stay in
 * app-level email modules, the copy lives here so both entry points send a
 * byte-identical email.
 *
 * Plain layout by design: no branded card, no header bar, no footer chrome and
 * no styled buttons — just the approved copy as paragraphs plus one bulleted
 * list, with the sign-in URL shown inline as text (and linked, so mail clients
 * that render HTML make it clickable).
 *
 * Sent from exactly two places, both at the point registration is fully
 * complete:
 *   - self-serve  → apps/auth, when the user clicks Continue or Skip for now
 *                   on the "A few quick details" onboarding screen
 *   - super admin → apps/quikit, after POST /api/super/orgs creates the org
 *                   and its first Org Admin
 */

export interface RenderWelcomeParams {
  /** Recipient's first name — rendered in the greeting. */
  firstName: string;
  /**
   * Absolute URL of the central login page, shown as text so the user knows
   * where to sign in. Callers pass their app's existing helper — `getLoginUrl()`
   * in apps/quikit, `${authBase()}/login` in apps/auth — so no new env var is
   * introduced. Omit (or pass a non-http value) and the sign-in line is left
   * out entirely rather than rendering a broken URL.
   */
  loginUrl?: string;
  /** Trial length in days; shown in the subject + body. */
  trialDays?: number;
}

const DEFAULT_TRIAL_DAYS = 14;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only absolute http(s) URLs are rendered. */
function safeUrl(url: string | undefined): string | null {
  return url && /^https?:\/\/[^\s"'<>]+$/.test(url) ? url : null;
}

export function renderWelcomeEmail(params: RenderWelcomeParams): { subject: string; html: string } {
  const trialDays = params.trialDays ?? DEFAULT_TRIAL_DAYS;
  const safeFirst = escapeHtml(params.firstName || "there");
  const loginUrl = safeUrl(params.loginUrl);

  const p = "margin:0 0 16px;color:#0f172a;font-size:15px;line-height:1.6;";

  const nextSteps = [
    "Create your first workflow",
    "Invite your team",
    "Explore AI-powered features",
    "Track your business progress",
  ]
    .map((s) => `<li style="margin:0 0 6px;color:#0f172a;font-size:15px;line-height:1.6;">${s}</li>`)
    .join("");

  // Sits right after the mission paragraph — the point in the copy where the
  // reader is told to go set the workspace up. The URL is its own line so it
  // survives plain-text rendering.
  const signInLine = loginUrl
    ? `
      <p style="${p}">Sign in to your workspace to get started:<br />
        <a href="${loginUrl}" style="color:#4f46e5;">${escapeHtml(loginUrl)}</a>
      </p>`
    : "";

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
    <div style="max-width:600px;margin:0 auto;">
      <p style="${p}">Hi ${safeFirst},</p>
      <p style="${p}">Welcome to Quikit! We're excited to have you on board.</p>
      <p style="${p}">Your ${trialDays}-day free trial has started, and your workspace is ready.</p>
      <p style="${p}">Our goal over the next two weeks is simple: help you experience how an AI-first business platform can simplify work, automate routine tasks, and give you better visibility across your business.</p>
      <p style="${p}"><strong>Today's Mission (5 minutes)</strong></p>
      <p style="${p}">Complete your workspace setup to unlock a personalized experience and AI recommendations tailored to your business.</p>${signInLine}
      <p style="${p}">Over the next few days, we'll guide you step by step as you:</p>
      <ul style="margin:0 0 16px;padding-left:22px;">${nextSteps}</ul>
      <p style="${p}">You'll also have access to the AI Success Manager, your built-in guide that will recommend the next best action whenever you need it.</p>
      <p style="${p}">We're looking forward to helping you get the most from Quikit.</p>
      <p style="${p}">See you inside,</p>
      <p style="margin:0;color:#0f172a;font-size:15px;line-height:1.6;">The Quikit Team</p>
    </div>
  </body>
</html>`;

  return {
    subject: `Welcome to Quikit – Your ${trialDays}-Day Free Trial Has Started`,
    html,
  };
}
