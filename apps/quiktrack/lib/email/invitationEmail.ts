/**
 * QuikTrack-local fork of the org onboarding-invitation email.
 *
 * The platform-shared renderer (`renderInvitationEmail` in `@quikit/shared`)
 * is used by every app, so re-skinning it there would change everyone's invite
 * email. QuikTrack wants the new Quikit email-template design (the "quiktrack"
 * skin — branded header banner, light-blue card), so this module renders the
 * same invitation content through QuikTrack's shared email chrome instead.
 *
 * Signature + subjects mirror the shared renderer exactly, so the calling route
 * only swaps the import. Other apps are untouched.
 *
 * All markup is table/inline-styled (no <style>-block classes, no flexbox) so
 * it survives Gmail/Outlook; the header image is embedded via cid: by the
 * shared chrome + sendEmail. See sendEmail.ts.
 */

import { INVITE_METHOD, SSO_PROVIDER, type RenderInvitationParams } from "@quikit/shared";
import { emailChrome, esc, emailButton, EMAIL_FONT } from "./sendEmail";

const lead = (html: string): string =>
  `<p style="margin:0 0 10px;font-family:${EMAIL_FONT};font-size:13px;font-weight:400;line-height:1.6;color:#111111;">${html}</p>`;

const subhead = (text: string): string =>
  `<p style="margin:16px 0 6px;font-family:${EMAIL_FONT};font-size:12px;font-weight:700;color:#111111;">${esc(text)}</p>`;

const boldInline = (s: string): string => `<strong style="font-weight:700;">${esc(s)}</strong>`;

function listHtml(items: string[], ordered: boolean): string {
  const tag = ordered ? "ol" : "ul";
  const lis = items
    .map(
      (item) =>
        `<li style="margin:0 0 4px;font-family:${EMAIL_FONT};font-size:12px;font-weight:400;line-height:1.7;color:#111111;">${item}</li>`,
    )
    .join("");
  return `<${tag} style="margin:6px 0 4px;padding-left:20px;">${lis}</${tag}>`;
}

function appListHtml(appNames: string[]): string {
  if (appNames.length === 0) {
    return lead(`<span style="color:#5b6472;">App access will be assigned after sign-in.</span>`);
  }
  return listHtml(appNames.map((n) => esc(n)), false);
}

const fineNote = (html: string): string =>
  `<p style="margin:14px 0 0;font-family:${EMAIL_FONT};font-size:11px;font-weight:400;line-height:1.6;color:#9aa4b2;word-break:break-word;">${html}</p>`;

const linkInline = (url: string): string =>
  `<a href="${url}" style="color:#2d88ff;text-decoration:underline;word-break:break-all;">${esc(url)}</a>`;

function loginDetailsPanel(email: string, password: string | null): string {
  const pwRow = password
    ? `<br/>Temporary password: <strong style="font-weight:700;">${esc(password)}</strong>`
    : "";
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0;background:#eaf2ff;border-radius:8px;">
                <tr><td style="padding:16px 18px;">
                  <div style="font-family:${EMAIL_FONT};font-size:12px;font-weight:700;color:#111111;margin-bottom:6px;">Your login details</div>
                  <div style="font-family:${EMAIL_FONT};font-size:12px;font-weight:400;line-height:1.8;color:#111111;">Email: <strong style="font-weight:700;">${esc(email)}</strong>${pwRow}</div>
                </td></tr>
              </table>`;
}

const title = (text: string): string =>
  `<h1 style="margin:0 0 14px;font-family:${EMAIL_FONT};font-size:22px;font-weight:700;line-height:1.3;color:#111111;">${esc(text)}</h1>`;

export function renderInvitationEmail(params: RenderInvitationParams): { subject: string; html: string } {
  const {
    to,
    firstName,
    orgName,
    inviterName,
    role,
    appNames,
    token,
    appBaseUrl,
    inviteMethod,
    ssoProvider,
    isReminder,
    tempPassword,
  } = params;
  // Empty string (SSO invites pass "") means "no password issued" — suppress
  // the credentials block, matching the shared renderer's behaviour.
  const displayPassword = tempPassword && tempPassword.length > 0 ? tempPassword : null;

  const loginUrl = `${appBaseUrl}/login`;
  const acceptUrl = `${appBaseUrl}/invitations/accept?token=${token}`;

  // ── SSO branch (FRD §4.1) — no credentials, provider-specific CTA ────────
  if (inviteMethod === INVITE_METHOD.SSO) {
    const provider = ssoProvider === SSO_PROVIDER.GOOGLE ? "Google" : "Microsoft";
    const headline = `You're invited to ${orgName}`;
    const preheader = `${inviterName} has added you as the ${role} for ${orgName} on the Quikit platform.`;
    const cardHtml = `${title(headline)}
              ${lead(`Hi ${boldInline(firstName)},`)}
              ${lead(`${esc(inviterName)} has added you as the ${boldInline(role)} for ${boldInline(orgName)} on the Quikit platform.`)}
              ${subhead("You have been granted access to:")}
              ${appListHtml(appNames)}
              ${subhead("Getting started:")}
              ${listHtml(
                [
                  `Click the ${boldInline(`Sign in with ${provider}`)} button below.`,
                  `Use your ${provider} account ${boldInline(to)} to authenticate.`,
                  `You will be redirected to your Quikit dashboard.`,
                ],
                true,
              )}
              ${emailButton(`Sign in with ${provider}`, loginUrl)}
              ${fineNote(`Alternatively, visit:<br/>${linkInline(loginUrl)}`)}
              ${fineNote(`This invitation is valid for 7 days from the date of this email.`)}`;

    const subject = isReminder
      ? `Reminder: you've been invited to join ${orgName} on Quikit`
      : `You've been invited to join ${orgName} on Quikit`;

    return { subject, html: emailChrome({ title: headline, preheader, cardHtml }) };
  }

  // ── Native Email branch (FRD §4.2) — credentials + Set-Password link ─────
  const headline = `Welcome to ${orgName}`;
  const preheader = `${inviterName} has set you up as the ${role} for ${orgName} on the Quikit platform.`;
  const cardHtml = `${title(headline)}
              ${lead(`Hi ${boldInline(firstName)},`)}
              ${lead(`${esc(inviterName)} has set you up as the ${boldInline(role)} for ${boldInline(orgName)} on the Quikit platform.`)}
              ${subhead("You have been granted access to:")}
              ${appListHtml(appNames)}
              ${loginDetailsPanel(to, displayPassword)}
              ${subhead("Getting started:")}
              ${listHtml(
                [
                  `Click the link below.`,
                  ...(displayPassword ? [`Enter your temporary password.`] : []),
                  `You will be prompted to set a new password.`,
                  `Log in with your credentials.`,
                ],
                true,
              )}
              ${emailButton("Set Up My Account", acceptUrl)}
              ${fineNote(`If the button doesn't work, copy and paste this link into your browser:<br/>${linkInline(acceptUrl)}`)}
              ${fineNote(`For security, we recommend setting a new password on your first login. This invitation is valid for 7 days.`)}`;

  const subject = isReminder
    ? `Reminder: welcome to ${orgName} on Quikit — your login details`
    : `Welcome to ${orgName} on Quikit — your login details`;

  return { subject, html: emailChrome({ title: headline, preheader, cardHtml }) };
}
