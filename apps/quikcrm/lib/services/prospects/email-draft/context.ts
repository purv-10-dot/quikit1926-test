/**
 * Builds the prompt context for a prospect email draft.
 *
 * Everything the DB holds about the prospect feeds the draft — profile,
 * promoted company columns, the full scraped company record, work history,
 * recent posts, the ICP, and the LinkedIn DM thread. Two constraints shape how:
 *
 *   1. BUDGET. `posts`, `companyData`, `experiences` and `linkedinConversation`
 *      are raw scraped blobs with no size ceiling; a chatty prospect can carry
 *      tens of thousands of characters. Each list is capped and each string
 *      truncated so one unusual profile cannot blow the model's context or the
 *      org's AI budget.
 *
 *   2. TRUST. Every one of those blobs is attacker-influenced text — a prospect
 *      controls their own LinkedIn About section and can write "ignore previous
 *      instructions" into it. We never interpolate it into the instruction part
 *      of the prompt; it goes in `contextData`, which the runtime sanitises, and
 *      the instruction tells the model to treat it as data. See
 *      docs/14-ai-integration-guide.md.
 */
import { parseLinkedInPosts } from "@/lib/services/prospects/linkedin-posts";
import { parseLinkedInCompany } from "@/lib/services/prospects/linkedin-company";
import { parseLinkedInExperiences } from "@/lib/services/prospects/linkedin-experience";
import { parseLinkedInConversation } from "@/lib/services/prospects/linkedin-conversation";
import type { ProspectDraftContext } from "./types";

/** Per-string ceiling. Long enough for a real post, short enough to bound cost. */
const MAX_TEXT = 600;
/** Long-form fields (About sections) get more room — they carry the most signal. */
const MAX_LONG_TEXT = 1_200;
const MAX_POSTS = 5;
const MAX_EXPERIENCE = 4;
/**
 * The tail of the DM thread, not the head. A first-touch email cares about what
 * was said most recently far more than how the thread opened, and the tail is
 * what a human would re-read before replying.
 */
const MAX_MESSAGES = 12;

function clean(value: string | null | undefined, max = MAX_TEXT): string | null {
  if (typeof value !== "string") return null;
  // Collapse scraped whitespace — LinkedIn blobs are full of newline runs that
  // cost tokens and carry no meaning.
  const flat = value.replace(/\s+/g, " ").trim();
  if (!flat) return null;
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

/** First token of the name, for a natural greeting. Falls back to the whole name. */
export function firstNameOf(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first || name.trim();
}

/** The prospect row shape this builder needs. Matches the route's `select`. */
export interface ProspectForDraft {
  name: string;
  email: string | null;
  title: string | null;
  company: string | null;
  linkedinUrl: string | null;
  shortSummary: string | null;
  about: string | null;
  companyIndustry: string | null;
  companyWebsite: string | null;
  companyHeadquarters: string | null;
  companySize: string | null;
  companyEmployeeCount: number | null;
  posts: unknown;
  companyData: unknown;
  experiences: unknown;
  linkedinConversation: unknown;
  icp: {
    name: string;
    description: string | null;
    personaNotes: string | null;
    segment: string | null;
    regions: string[];
  } | null;
}

export interface SenderForDraft {
  name: string;
  email: string | null;
  companyName: string | null;
  companyWebsite: string | null;
}

/**
 * What the context actually carries, as counts and lengths — never the text
 * itself. This is what makes "the draft is generic" diagnosable: a prospect
 * with `posts=0 conversation=0 about=0` gives the model almost nothing to
 * personalise with, and that is a data problem, not a prompt problem.
 */
export function summarizeContext(ctx: ProspectDraftContext): Record<string, unknown> {
  return {
    title: ctx.prospect.title ? "y" : "n",
    company: ctx.company.name ?? "—",
    industry: ctx.company.industry ? "y" : "n",
    aboutChars: ctx.prospect.about?.length ?? 0,
    summaryChars: ctx.prospect.shortSummary?.length ?? 0,
    companyAboutChars: ctx.company.about?.length ?? 0,
    posts: ctx.recentPosts.length,
    experience: ctx.experience.length,
    messages: ctx.conversation.length,
    icp: ctx.icp?.name ?? "—",
    // Rough size of what ships to the runtime — the cost driver.
    contextChars: JSON.stringify(ctx).length,
  };
}

export function buildDraftContext(
  prospect: ProspectForDraft,
  sender: SenderForDraft,
): ProspectDraftContext {
  const company = parseLinkedInCompany(prospect.companyData);
  const posts = parseLinkedInPosts(prospect.posts);
  const experiences = parseLinkedInExperiences(prospect.experiences);
  const conversation = parseLinkedInConversation(prospect.linkedinConversation);

  return {
    prospect: {
      name: prospect.name,
      firstName: firstNameOf(prospect.name),
      email: prospect.email,
      title: clean(prospect.title),
      company: clean(prospect.company),
      linkedinUrl: prospect.linkedinUrl,
      shortSummary: clean(prospect.shortSummary, MAX_LONG_TEXT),
      about: clean(prospect.about, MAX_LONG_TEXT),
    },
    company: {
      // Promoted columns win over the scraped blob: they are the projection the
      // rest of the app filters on, so a draft must not contradict them.
      name: clean(company?.name) ?? clean(prospect.company),
      industry: clean(prospect.companyIndustry) ?? clean(company?.industry),
      website: prospect.companyWebsite ?? clean(company?.website),
      headquarters: clean(prospect.companyHeadquarters) ?? clean(company?.headquarters),
      size: clean(prospect.companySize) ?? clean(company?.companySize),
      employeeCount: prospect.companyEmployeeCount,
      tagline: clean(company?.tagline),
      about: clean(company?.about, MAX_LONG_TEXT),
      specialties: clean(company?.specialties),
    },
    icp: prospect.icp
      ? {
          name: prospect.icp.name,
          description: clean(prospect.icp.description, MAX_LONG_TEXT),
          personaNotes: clean(prospect.icp.personaNotes, MAX_LONG_TEXT),
          segment: prospect.icp.segment,
          regions: prospect.icp.regions,
        }
      : null,
    recentPosts: posts.slice(0, MAX_POSTS).flatMap((p) => {
      const text = clean(p.text);
      if (!text) return [];
      return [{ text, when: p.date ?? p.relativeTime, engagement: p.reactions + p.comments }];
    }),
    experience: experiences.slice(0, MAX_EXPERIENCE).map((e) => ({
      jobTitle: e.jobTitle,
      companyName: e.companyName,
      duration: e.duration || [e.startDate, e.endDate].filter(Boolean).join(" - "),
      current: e.current,
    })),
    conversation: (conversation?.messages ?? [])
      // messageOrder is the authoritative chronological key (see the schema note
      // on CrmProspect.linkedinConversation) — sort by it rather than trusting
      // array order, then take the newest slice and restore reading order.
      .slice()
      .sort((a, b) => a.messageOrder - b.messageOrder)
      .slice(-MAX_MESSAGES)
      .flatMap((m) => {
        const text = clean(m.text);
        if (!text) return [];
        return [{ from: m.senderName, direction: m.direction, text }];
      }),
    sender: {
      name: sender.name,
      email: sender.email,
      companyName: sender.companyName,
      companyWebsite: sender.companyWebsite,
    },
  };
}
