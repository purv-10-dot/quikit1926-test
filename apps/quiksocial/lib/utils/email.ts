import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (!transporter) {
    const emailUser = process.env.EMAIL_USER;
    const emailPassword = process.env.EMAIL_PASSWORD;

    if (!emailUser || !emailPassword) {
      throw new Error('EMAIL_USER and EMAIL_PASSWORD must be set');
    }

    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: emailUser, pass: emailPassword },
    });
  }
  return transporter;
}

export async function sendOTPEmail(email: string, otp: string, name?: string): Promise<void> {
  const smtp = getTransporter();
  const from = process.env.SMTP_FROM || process.env.EMAIL_USER || 'noreply@quiksocial.com';

  await smtp.sendMail({
    from,
    to: email,
    subject: 'Your QuikSocial Verification Code',
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
            <h1 style="color:white;margin:0;">QuikSocial</h1>
          </div>
          <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;">
            <h2 style="color:#333;margin-top:0;">Verify Your Email</h2>
            ${name ? `<p>Hi ${name},</p>` : '<p>Hello,</p>'}
            <p>Use the code below to complete your registration:</p>
            <div style="background:white;border:2px dashed #667eea;border-radius:8px;padding:20px;text-align:center;margin:20px 0;">
              <h1 style="color:#667eea;font-size:36px;letter-spacing:8px;margin:0;font-family:'Courier New',monospace;">${otp}</h1>
            </div>
            <p style="color:#666;font-size:14px;">This code expires in 10 minutes.</p>
            <p style="color:#666;font-size:14px;">If you didn't request this, ignore this email.</p>
          </div>
        </body>
      </html>
    `,
    text: `Your QuikSocial verification code: ${otp}\nExpires in 10 minutes.`,
  });
}

export async function sendCampaignReadyEmail(params: {
  toEmail: string;
  name?: string | null;
  campaignName: string;
  postsGenerated: number;
  totalPosts: number;
  campaignsUrl: string;
}): Promise<void> {
  const { toEmail, name, campaignName, postsGenerated, totalPosts, campaignsUrl } = params;
  const smtp = getTransporter();
  const from = process.env.SMTP_FROM || process.env.EMAIL_USER || 'noreply@quiksocial.com';

  // Partial completions are real and worth surfacing — silently dropping
  // failed posts trains users to distrust the count. The subject and body
  // both include "X of Y" when there were skips so the email matches what
  // they'll see in the campaign card.
  const isPartial = totalPosts > 0 && postsGenerated < totalPosts;
  const subject = isPartial
    ? `Your "${campaignName}" campaign is ready! ${postsGenerated} of ${totalPosts} posts generated.`
    : `Your "${campaignName}" campaign is ready!`;

  const skipped = Math.max(0, totalPosts - postsGenerated);
  const partialNotice = isPartial
    ? `<div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;padding:12px 14px;margin:16px 0;color:#92400E;font-size:13px;line-height:1.5;">
         <strong>Heads up:</strong> ${skipped} of ${totalPosts} ${skipped === 1 ? 'post' : 'posts'} could not be generated this run. The remaining ${postsGenerated} ${postsGenerated === 1 ? 'is' : 'are'} ready to review and schedule.
       </div>`
    : '';

  const greeting = name ? `Hi ${name},` : 'Hello,';

  await smtp.sendMail({
    from,
    to: toEmail,
    subject,
    html: `
      <!DOCTYPE html>
      <html>
        <body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:30px;text-align:center;border-radius:10px 10px 0 0;">
            <h1 style="color:white;margin:0;">QuikSocial</h1>
          </div>
          <div style="background:#f9f9f9;padding:30px;border-radius:0 0 10px 10px;">
            <h2 style="color:#333;margin-top:0;">Your campaign is ready</h2>
            <p>${greeting}</p>
            <p>Your campaign <strong>"${campaignName}"</strong> just finished generating.
              ${isPartial
                ? `<strong>${postsGenerated} of ${totalPosts}</strong> ${postsGenerated === 1 ? 'post is' : 'posts are'} ready to review.`
                : `All <strong>${totalPosts}</strong> ${totalPosts === 1 ? 'post is' : 'posts are'} ready to review.`}
            </p>
            ${partialNotice}
            <div style="text-align:center;margin:28px 0;">
              <a href="${campaignsUrl}" style="display:inline-block;padding:12px 22px;background:#667eea;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">
                Open Campaigns →
              </a>
            </div>
            <p style="color:#666;font-size:13px;">Schedule them for your audience or tweak any post that needs more polish.</p>
          </div>
        </body>
      </html>
    `,
    text: isPartial
      ? `Your "${campaignName}" campaign is ready! ${postsGenerated} of ${totalPosts} posts generated. ${skipped} could not be generated this run.\nReview and schedule: ${campaignsUrl}`
      : `Your "${campaignName}" campaign is ready! All ${totalPosts} posts generated.\nReview and schedule: ${campaignsUrl}`,
  });
}

export async function sendApprovalInviteEmail(params: {
  toEmail: string;
  inviterName?: string | null;
  workspaceRoles: Array<{ workspace: string; role: string }>;
}): Promise<void> {
  const { toEmail, inviterName, workspaceRoles } = params;
  const smtp = getTransporter();
  const from = process.env.SMTP_FROM || process.env.EMAIL_USER || 'noreply@quiksocial.com';
  const appUrl = process.env.NEXTAUTH_URL || 'http://localhost:3065';

  const rows = workspaceRoles
    .map(({ workspace, role }) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${workspace}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-transform:capitalize;">${role}</td>
      </tr>`)
    .join('');

  await smtp.sendMail({
    from,
    to: toEmail,
    subject: 'You are invited to a QuikSocial workspace',
    html: `
      <div style="background:#f3f4f6;padding:24px 12px;font-family:Arial,sans-serif;">
        <div style="max-width:620px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#0f172a,#1f2937);padding:22px 24px;">
            <h2 style="margin:0;color:#fff;font-size:22px;">Workspace Invitation</h2>
          </div>
          <div style="padding:24px;">
            <p style="color:#111827;font-size:15px;">
              ${inviterName ? `<strong>${inviterName}</strong> has invited you` : 'You have been invited'} to join QuikSocial.
            </p>
            <table cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:18px;">
              <thead>
                <tr>
                  <th align="left" style="padding:10px 12px;color:#6b7280;font-size:12px;">Workspace</th>
                  <th align="left" style="padding:10px 12px;color:#6b7280;font-size:12px;">Role</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
            <p style="color:#374151;font-size:14px;">Sign up or log in with <strong>${toEmail}</strong> to accept automatically.</p>
            <a href="${appUrl}/login" style="display:inline-block;padding:12px 18px;background:#111827;color:#fff;text-decoration:none;border-radius:10px;font-size:14px;font-weight:700;">
              Open QuikSocial
            </a>
          </div>
        </div>
      </div>
    `,
    text: `You've been invited to QuikSocial.\nLog in with ${toEmail}: ${appUrl}/login`,
  });
}
