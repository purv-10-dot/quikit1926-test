/**
 * Email job definitions — data shapes for email-related queue jobs.
 *
 * Each interface defines what data the producer (API route) must provide
 * when enqueuing the job, and what the consumer (worker) will receive.
 */

export interface ReviewReminderData {
  tenantId: string;
  userId: string;
  userEmail: string;
  userName: string;
  quarter: string;
  year: number;
  daysRemaining: number;
}

export interface MeetingReminderData {
  tenantId: string;
  meetingId: string;
  meetingName: string;
  scheduledAt: string; // ISO datetime
  attendeeEmails: string[];
  location?: string;
  meetingLink?: string;
}

export interface FeedbackNotificationData {
  tenantId: string;
  recipientEmail: string;
  recipientName: string;
  senderName: string;
  category: "kudos" | "coaching" | "concern" | "general";
  // Don't include content — just notify that feedback exists
}
