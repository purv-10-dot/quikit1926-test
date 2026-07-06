/**
 * Email templates service — ported from EmailTemplatesService (Prisma).
 * EmailTemplate.type is a Prisma enum (EmailTemplateType) whose string values
 * are mapped (welcome-kit, course-completion, certificate, upgrade-invoice).
 * The legacy controller accepts the wire value (e.g. "welcome-kit") directly.
 */
import type { EmailTemplateType } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest } from '@/lib/http';

// Map wire string → Prisma enum member. Prisma enum members are the @map values
// here because Prisma exposes the enum by member name, not the mapped DB value.
// Member names: welcome_kit, course_completion, certificate, upgrade_invoice.
const TYPE_MAP: Record<string, EmailTemplateType> = {
  'welcome-kit': 'welcome_kit' as EmailTemplateType,
  welcome_kit: 'welcome_kit' as EmailTemplateType,
  'course-completion': 'course_completion' as EmailTemplateType,
  course_completion: 'course_completion' as EmailTemplateType,
  certificate: 'certificate' as EmailTemplateType,
  'upgrade-invoice': 'upgrade_invoice' as EmailTemplateType,
  upgrade_invoice: 'upgrade_invoice' as EmailTemplateType,
};

function resolveType(type: string): EmailTemplateType {
  const resolved = TYPE_MAP[type];
  if (!resolved) throw BadRequest(`Unknown email template type: ${type}`);
  return resolved;
}

export async function getTemplate(type: string) {
  return prisma.emailTemplate.findUnique({ where: { type: resolveType(type) } });
}

export async function saveTemplate(type: string, subject: string, htmlContent: string) {
  const resolved = resolveType(type);
  return prisma.emailTemplate.upsert({
    where: { type: resolved },
    create: { type: resolved, subject, htmlContent },
    update: { subject, htmlContent },
  });
}

export async function getTemplateWithDefaults(type: string): Promise<{ subject: string; htmlContent: string }> {
  const template = await getTemplate(type);
  if (template) return { subject: template.subject, htmlContent: template.htmlContent };
  return getDefaultTemplate(type);
}

function getDefaultTemplate(type: string): { subject: string; htmlContent: string } {
  const resolved = TYPE_MAP[type];

  if (resolved === ('upgrade_invoice' as EmailTemplateType)) {
    return {
      subject: 'Storage Upgrade Required - {{tenantName}}',
      htmlContent: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1f2937;">Storage Upgrade Required</h2>
            <p>Dear {{contactName}},</p>

            <p>Your organization <strong>{{tenantName}}</strong> has reached <strong>{{storagePercentage}}%</strong> of your allocated storage limit (2GB).</p>

            <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Current Usage:</h3>
              <ul style="list-style: none; padding: 0;">
                <li><strong>Storage Used:</strong> {{storageUsedMB}} MB</li>
                <li><strong>Storage Limit:</strong> {{storageLimitMB}} MB ({{storageLimitGB}} GB)</li>
                <li><strong>Percentage Used:</strong> {{storagePercentage}}%</li>
              </ul>
            </div>

            <p>To continue uploading content without interruption, please consider upgrading your storage plan.</p>

            <div style="margin: 30px 0;">
              <a href="{{loginUrl}}"
                 style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                View Upgrade Options
              </a>
            </div>

            <p>If you have any questions, please contact our support team.</p>

            <p>Best regards,<br>QuikSkill LMS Team</p>
          </div>
        `,
    };
  }

  if (resolved === ('welcome_kit' as EmailTemplateType)) {
    return {
      subject: 'Welcome to QuikSkill LMS - {{tenantName}}',
      htmlContent: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
      .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
      .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
      .info-box { background: white; padding: 20px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #667eea; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Welcome to QuikSkill LMS!</h1>
      </div>
      <div class="content">
        <p>Dear {{contactName}},</p>
        <p>Congratulations! Your organization <strong>{{tenantName}}</strong> has been successfully onboarded to QuikSkill LMS.</p>

        <div class="info-box">
          <h3>Your Login Credentials</h3>
          <p><strong>Login URL:</strong> <a href="{{loginUrl}}">{{loginUrl}}</a></p>
          <p><strong>Invitation Link:</strong> <a href="{{invitationUrl}}">Click here to accept invitation</a></p>
        </div>

        <p>Please find attached the Welcome Kit PDF guide that contains:</p>
        <ul>
          <li>Getting started instructions</li>
          <li>Platform overview and features</li>
          <li>Best practices for course creation</li>
          <li>Support and resources</li>
        </ul>

        <p>If you have any questions, please don't hesitate to contact our support team.</p>

        <p>Best regards,<br>The QuikSkill Team</p>
      </div>
    </div>
  </body>
</html>`,
    };
  }

  if (resolved === ('course_completion' as EmailTemplateType)) {
    return {
      subject: 'Congratulations on Completing {{courseName}}! 🎉',
      htmlContent: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
      .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
      .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 40px 30px; text-align: center; }
      .content { padding: 36px 40px; }
      .cta-button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; margin: 20px 0; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>Well Done, {{studentName}}!</h1>
        <p>You have successfully completed your course</p>
      </div>
      <div class="content">
        <p>Dear <strong>{{studentName}}</strong>,</p>
        <p>We are thrilled to inform you that you have successfully completed <strong>{{courseName}}</strong>.</p>
        <div style="text-align: center;">
          <a href="{{loginUrl}}" class="cta-button">View My Achievements</a>
        </div>
        <p>Best regards,<br><strong>The QuikSkill LMS Team</strong></p>
      </div>
    </div>
  </body>
</html>`,
    };
  }

  if (resolved === ('certificate' as EmailTemplateType)) {
    return {
      subject: 'Your Certificate for {{courseName}} is Ready! 🏆',
      htmlContent: `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f4f4; }
      .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
      .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 40px 30px; text-align: center; }
      .content { padding: 36px 40px; }
      .cta-button { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; margin: 20px 0; }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <span>🏆</span>
        <h1>Certificate of Completion</h1>
        <p>Congratulations on your achievement!</p>
      </div>
      <div class="content">
        <p>Dear <strong>{{studentName}}</strong>,</p>
        <p>We are proud to present you with your official Certificate of Completion for successfully completing <strong>{{courseName}}</strong>.</p>
        <div style="text-align: center;">
          <a href="{{certificateUrl}}" class="cta-button">Download Certificate</a>
        </div>
        <p>Best regards,<br><strong>The QuikSkill LMS Team</strong></p>
      </div>
    </div>
  </body>
</html>`,
    };
  }

  return {
    subject: 'A message from QuikSkill LMS',
    htmlContent: `<!DOCTYPE html>
<html>
  <head><meta charset="utf-8"></head>
  <body>
    <div style="max-width:600px;margin:30px auto;font-family:Arial,sans-serif;">
      <h1>QuikSkill LMS</h1>
      <p>Dear {{studentName}},</p>
      <p>You have a new notification from <strong>QuikSkill LMS</strong>.</p>
      <p><a href="{{loginUrl}}">Go to My Account</a></p>
      <p>Best regards,<br><strong>The QuikSkill LMS Team</strong></p>
    </div>
  </body>
</html>`,
  };
}
