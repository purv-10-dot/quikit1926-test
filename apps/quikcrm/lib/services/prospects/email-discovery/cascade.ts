/**
 * The email-discovery cascade.
 *
 * Each tier runs only if the one before it came up empty, cheapest and
 * highest-signal first:
 *
 *   1. Resolve the company domain (MX-gated)              — free, DNS only
 *   2. Learned pattern for that domain                    — free, one indexed read
 *   3. Addresses published on the company's own site      — free, a few fetches
 *   4. Hunter email-finder (+ domain-search for pattern)  — costs credits, scored
 *   5. Apollo people/match                                — costs credits
 *   6. Ranked guess from the best pattern available       — free, never promoted
 *
 * WHAT "FOUND" DOES NOT MEAN. There is no SMTP verification anywhere in this
 * chain — Vercel blocks outbound port 25, so the source implementation's
 * RCPT-TO probe cannot run. Tiers 1-3 and 6 therefore produce addresses that
 * are *plausible*, not *confirmed*. Only tiers 4 and 5 involve a provider that
 * has actually observed the address somewhere.
 *
 * That distinction is enforced by `shouldPromote`: a guess is recorded for a
 * human to accept, but never written to CrmProspect.email. Mailing a
 * confidently-wrong address hard-bounces and damages domain reputation, which
 * is materially worse than leaving the field blank.
 */
import { getPrimaryMxHost, getMailProvider, resolveDomain } from "./domain";
import {
  buildFromPattern,
  buildPrioritizedCandidates,
  inferPattern,
  normalizePart,
  splitName,
} from "./patterns";
import { researchPublicEmails } from "./public-emails";
import { getRememberedPattern, rememberPattern } from "./pattern-memory";
import { hunterDomainPattern, hunterFindEmail, isHunterConfigured } from "./providers/hunter";
import { apolloFindEmail, isApolloConfigured } from "./providers/apollo";
import type { DiscoveryInput, DiscoveryResult } from "./types";

/**
 * Minimum confidence for an address to be written onto CrmProspect.email.
 *
 * 0.8 is where Hunter's own documentation puts the boundary between "verified
 * by observation" and "generated from a pattern", and Apollo's fixed 0.85 sits
 * just above it. Sources that cannot be scored (guesses, pattern memory) are
 * excluded by source regardless of the number they carry.
 */
export const PROMOTE_MIN_CONFIDENCE = 0.8;

/** Sources trustworthy enough to auto-fill the prospect's email field. */
const PROMOTABLE_SOURCES = new Set(["hunter", "apollo"]);

/**
 * May this result be copied to CrmProspect.email, or is it only a suggestion?
 *
 * Both conditions are required: a low-scoring Hunter hit is still a guess, and
 * a high "confidence" on a locally-built guess is self-assigned and means
 * nothing. Exported so the route and its tests share one definition.
 */
export function shouldPromote(result: DiscoveryResult): boolean {
  return (
    !!result.email &&
    !!result.source &&
    PROMOTABLE_SOURCES.has(result.source) &&
    result.confidence >= PROMOTE_MIN_CONFIDENCE
  );
}

/**
 * Run the cascade for one prospect.
 *
 * Never throws: every tier already swallows its own transport errors, and the
 * outer guard turns anything unexpected into a `not_found` result carrying the
 * message. The caller records the outcome either way, so a failed run is
 * observable rather than silent.
 */
export async function discoverEmail(
  orgId: string,
  input: DiscoveryInput,
): Promise<DiscoveryResult> {
  try {
    const fullName = (input.fullName || "").trim();
    const companyName = (input.companyName || "").trim();

    if (!companyName && !input.companyWebsite) {
      return { status: "company_invalid", confidence: 0 };
    }

    const { first: firstRaw, last: lastRaw } = splitName(fullName);
    const first = normalizePart(firstRaw);
    const last = normalizePart(lastRaw);
    if (!first) {
      return { status: "company_invalid", confidence: 0 };
    }

    // ── Tier 1: domain ──────────────────────────────────────────────────────
    const domain = await resolveDomain({
      companyWebsite: input.companyWebsite,
      linkedinUrl: input.linkedinUrl,
      companyName,
    });
    if (!domain) {
      return { status: "domain_not_found", confidence: 0 };
    }

    const provider = getMailProvider(await getPrimaryMxHost(domain));

    // ── Tier 2: learned pattern ─────────────────────────────────────────────
    // Ranking input, not an answer on its own: knowing the company uses
    // first.last does not confirm THIS person has a mailbox.
    const knownPattern = await getRememberedPattern(orgId, domain);

    // ── Tier 3: the company's own website ───────────────────────────────────
    const research = await researchPublicEmails(domain);

    // A published address that exactly matches a candidate for this person is
    // the one genuinely observed result available without a paid provider.
    const candidates = buildPrioritizedCandidates({
      first,
      last,
      domain,
      provider,
      knownPattern,
      publicPattern: research.pattern,
    });
    const observed = research.emails.find((email) => candidates.includes(email));
    if (observed) {
      const pattern = inferPattern(observed, first, last);
      if (pattern) await rememberPattern(orgId, domain, pattern, "inferred");
      return {
        status: "verified",
        email: observed,
        // Published on the company's own site AND matching this person's name.
        // Scored below a provider hit because one page is a narrow sample.
        confidence: 0.75,
        domain,
        pattern,
        source: "public_inference",
      };
    }

    if (research.pattern) {
      await rememberPattern(orgId, domain, research.pattern, "inferred");
    }

    // ── Tier 4: Hunter ──────────────────────────────────────────────────────
    if (isHunterConfigured()) {
      const hit = await hunterFindEmail(domain, firstRaw, lastRaw);
      if (hit?.email) {
        if (hit.pattern) await rememberPattern(orgId, domain, hit.pattern, "hunter");
        return {
          status: hit.confidence >= PROMOTE_MIN_CONFIDENCE ? "verified" : "guessed",
          email: hit.email,
          confidence: hit.confidence,
          domain,
          pattern: hit.pattern || inferPattern(hit.email, first, last),
          source: "hunter",
        };
      }

      // No address for this person, but the org pattern is still worth caching
      // for the next prospect at the same company.
      if (!knownPattern && !research.pattern) {
        const domainPattern = await hunterDomainPattern(domain);
        if (domainPattern) await rememberPattern(orgId, domain, domainPattern, "hunter");
      }
    }

    // ── Tier 5: Apollo ──────────────────────────────────────────────────────
    if (isApolloConfigured()) {
      const hit = await apolloFindEmail({
        fullName,
        domain,
        companyName,
        linkedinUrl: input.linkedinUrl,
      });
      if (hit?.email) {
        const pattern = inferPattern(hit.email, first, last);
        if (pattern) await rememberPattern(orgId, domain, pattern, "apollo");
        return {
          status: "verified",
          email: hit.email,
          confidence: hit.confidence,
          domain,
          pattern,
          source: "apollo",
        };
      }
    }

    // ── Tier 6: best-effort guess ───────────────────────────────────────────
    // Recorded as a suggestion only. `shouldPromote` rejects it by source, so
    // it can never reach CrmProspect.email no matter how it is scored.
    const bestPattern = knownPattern || research.pattern;
    if (bestPattern) {
      return {
        status: "guessed",
        email: buildFromPattern(first, last, domain, bestPattern),
        confidence: 0.5,
        domain,
        pattern: bestPattern,
        source: knownPattern ? "pattern_memory" : "public_inference",
      };
    }

    if (candidates.length) {
      return {
        status: "guessed",
        email: candidates[0],
        // Nothing but a provider-default ordering supports this one.
        confidence: 0.3,
        domain,
        pattern: inferPattern(candidates[0], first, last),
        source: "guess",
      };
    }

    return { status: "not_found", confidence: 0, domain };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Discovery failed";
    console.error("[email-discovery] cascade failed", error);
    return { status: "not_found", confidence: 0, error: message };
  }
}
