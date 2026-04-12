/**
 * Email worker — processes email:* jobs from the BullMQ "email" queue.
 *
 * Uses Resend (via @quikit/shared/email pattern) to send transactional
 * emails. Each job type has its own handler with a specific HTML template.
 *
 * To run this worker in production:
 *   node -e "require('./packages/queue/workers/emailWorker').startEmailWorker()"
 *
 * Or import and call startEmailWorker() from a long-running process.
 */

import { Worker, type Job } from "bullmq";
import Redis from "ioredis";
import { Resend } from "resend";
import type { ReviewReminderData, MeetingReminderData, FeedbackNotificationData } from "../jobs/email";

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || "re_placeholder");
  }
  return _resend;
}

const FROM = "QuikScale <notifications@resend.dev>";

/* ── Template renderers ──────────────────────────────────────────────── */

function renderReviewReminder(data: ReviewReminderData): { subject: string; html: string } {
  return {
    subject: `Self-assessment due — ${data.quarter} ${data.year}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#0f172a;">Hi ${data.userName},</h2>
        <p style="color:#475569;line-height:1.6;">
          Your quarterly self-assessment for <strong>${data.quarter} ${data.year}</strong> is due in
          <strong>${data.daysRemaining} day${data.daysRemaining === 1 ? "" : "s"}</strong>.
        </p>
        <p style="color:#475569;">
          Take 10 minutes to reflect on your wins, growth areas, and goals before your manager
          starts the review process.
        </p>
        <a href="${process.env.APP_URL || "http://localhost:3004"}/performance/self"
           style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;margin:16px 0;">
          Start Self-Assessment →
        </a>
        <p style="color:#94a3b8;font-size:13px;margin-top:24px;">
          — QuikScale Performance
        </p>
      </div>
    `,
  };
}

function renderMeetingReminder(data: MeetingReminderData): { subject: string; html: string } {
  const time = new Date(data.scheduledAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return {
    subject: `Meeting in 1 hour: ${data.meetingName}`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#0f172a;">${data.meetingName}</h2>
        <p style="color:#475569;">Starting at <strong>${time}</strong>${data.location ? ` · ${data.location}` : ""}</p>
        ${data.meetingLink ? `<a href="${data.meetingLink}" style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;">Join Meeting →</a>` : ""}
        <p style="color:#94a3b8;font-size:13px;margin-top:24px;">— QuikScale Meetings</p>
      </div>
    `,
  };
}

function renderFeedbackNotification(data: FeedbackNotificationData): { subject: string; html: string } {
  const categoryLabel = {
    kudos: "🎉 Kudos",
    coaching: "💡 Coaching feedback",
    concern: "⚠️ A concern",
    general: "💬 Feedback",
  }[data.category];

  return {
    subject: `${data.senderName} left you feedback`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto;">
        <h2 style="color:#0f172a;">Hi ${data.recipientName},</h2>
        <p style="color:#475569;line-height:1.6;">
          <strong>${data.senderName}</strong> left you ${categoryLabel.toLowerCase()}.
        </p>
        <a href="${process.env.APP_URL || "http://localhost:3004"}/performance/feedback"
           style="display:inline-block;background:#6366f1;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;">
          View Feedback →
        </a>
        <p style="color:#94a3b8;font-size:13px;margin-top:24px;">— QuikScale People</p>
      </div>
    `,
  };
}

/* ── Job processor ───────────────────────────────────────────────────── */

async function processEmailJob(job: Job): Promise<void> {
  const resend = getResend();

  switch (job.name) {
    case "email:review-reminder": {
      const data = job.data as ReviewReminderData;
      const { subject, html } = renderReviewReminder(data);
      await resend.emails.send({ from: FROM, to: data.userEmail, subject, html });
      break;
    }

    case "email:meeting-reminder": {
      const data = job.data as MeetingReminderData;
      const { subject, html } = renderMeetingReminder(data);
      // Send to all attendees
      for (const email of data.attendeeEmails) {
        await resend.emails.send({ from: FROM, to: email, subject, html });
      }
      break;
    }

    case "email:feedback-notification": {
      const data = job.data as FeedbackNotificationData;
      const { subject, html } = renderFeedbackNotification(data);
      await resend.emails.send({ from: FROM, to: data.recipientEmail, subject, html });
      break;
    }

    default:
      console.warn(`[emailWorker] Unknown job name: ${job.name}`);
  }
}

/* ── Worker entrypoint ───────────────────────────────────────────────── */

export function startEmailWorker(): Worker | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[emailWorker] REDIS_URL not set — email worker not started.");
    return null;
  }

  const connection = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const worker = new Worker("email", processEmailJob, {
    connection,
    concurrency: 5, // process up to 5 emails in parallel
  });

  worker.on("completed", (job) => {
    console.log(`[emailWorker] ✓ ${job.name} (${job.id})`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[emailWorker] ✗ ${job?.name} (${job?.id}):`, err.message);
  });

  console.log("[emailWorker] Started — listening for email:* jobs");
  return worker;
}
