/**
 * Shared types for prospect email drafting.
 *
 * The draft is a SUGGESTION. Nothing here sends anything: the route returns a
 * subject + body, the compose modal pre-fills them, and a human reads, edits
 * and sends through the existing /api/email/send path. That separation is
 * deliberate — an AI-written outbound email that reaches a real prospect with
 * no human read is a reputational risk the CRM should not take on its own.
 */

/** Everything we know about a prospect, flattened for the prompt. */
export interface ProspectDraftContext {
  prospect: {
    name: string;
    firstName: string;
    email: string | null;
    title: string | null;
    company: string | null;
    linkedinUrl: string | null;
    shortSummary: string | null;
    about: string | null;
  };
  company: {
    name: string | null;
    industry: string | null;
    website: string | null;
    headquarters: string | null;
    size: string | null;
    employeeCount: number | null;
    tagline: string | null;
    about: string | null;
    specialties: string | null;
  };
  /** Ideal Customer Profile the prospect was tagged with, when any. */
  icp: {
    name: string;
    description: string | null;
    personaNotes: string | null;
    segment: string | null;
    regions: string[];
  } | null;
  /** Most recent LinkedIn posts, newest first, already truncated. */
  recentPosts: Array<{ text: string; when: string | null; engagement: number }>;
  /** Current + prior roles, most relevant first. */
  experience: Array<{ jobTitle: string; companyName: string; duration: string; current: boolean }>;
  /** Tail of the LinkedIn DM thread, oldest → newest. */
  conversation: Array<{ from: string; direction: "sent" | "received" | ""; text: string }>;
  /** Who the email is from — drives the sign-off. */
  sender: {
    name: string;
    email: string | null;
    companyName: string | null;
    companyWebsite: string | null;
  };
}

export interface EmailDraft {
  subject: string;
  /** Plain-text-ish HTML body — paragraphs separated by <br/><br/>. */
  bodyHtml: string;
  /**
   * "ai" when the AI runtime produced it, "template" when the deterministic
   * fallback did. Surfaced to the UI so the user knows what they are editing.
   */
  source: "ai" | "template";
  /** Populated when the AI path was attempted and failed. */
  fallbackReason?: string;
}
