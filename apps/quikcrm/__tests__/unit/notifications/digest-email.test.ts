/**
 * Phase 5 — digest email renderer (template unit, RED→GREEN).
 *
 * renderDigestEmail(assembled) turns one AssembledDigest (the real green output
 * of runDailyDigest) into an email-client-safe { subject, text, html }:
 *   - table-based layout, INLINE styles only (no <style>, no flex/grid),
 *   - matches the existing email-templates.ts chrome (#1e40af header, escHtml),
 *   - DEMO banner rendered PROMINENTLY at the top (it's on the AssembledDigest),
 *   - §1 activity volume by rep, §2 activity mix by type,
 *   - §3 per-rep custom-field tables (Number → sum + team total; Select → value×count),
 *   - §4 tasks: LAYOUT + a LOUD "NOT BUILT" placeholder (shape-ready; the tasks
 *     DATA is a separate unit). The placeholder must be unmistakably "not wired",
 *     NOT mistakable for "zero tasks today" (empty-but-working).
 *
 * sendDigestEmail(assembled) is CODED but NOT FIRED — no test invokes it (the
 * boundary: send path coded, real send held for explicit go-ahead).
 *
 * HONEST LABEL: a correct HTML string ≠ verified across real inbox clients
 * (Outlook/Gmail/Apple Mail) — that is owed, deploy-only.
 */
import { describe, it, expect } from "vitest";
import { renderDigestEmail } from "@/lib/services/notifications/digest-email";
import type { AssembledDigest } from "@/lib/services/notifications/digest-run";

// A real-shaped AssembledDigest (matches runDailyDigest output).
function sampleDigest(overrides: Partial<AssembledDigest> = {}): AssembledDigest {
  return {
    recipient: { userId: "u1", orgId: "o1", role: "Administrator", email: "lead@x.co", name: "Lead Person" },
    activitiesByType: [
      { type: "Upwork Connect", count: 14 },
      { type: "LinkedIn DM", count: 9 },
    ],
    // §1 now consumes activityByRep (true per-rep activity volume), not derived
    // from fieldAggregates.
    activityByRep: [
      { ownerId: "r1", ownerName: "Rep One", count: 11 },
      { ownerId: "r2", ownerName: "Rep Two", count: 6 },
    ],
    fieldAggregates: [
      {
        activityTypeId: "Upwork Connect",
        aggregates: [
          {
            fieldKey: "bid",
            fieldLabel: "Bid Amount",
            fieldType: "Number",
            perRep: [
              { ownerId: "r1", ownerName: "Rep One", numberSum: 3000 },
              { ownerId: "r2", ownerName: "Rep Two", numberSum: 1500 },
            ],
            teamTotal: { numberSum: 4500 },
          },
          {
            fieldKey: "outcome",
            fieldLabel: "Outcome",
            fieldType: "Select",
            perRep: [
              { ownerId: "r1", ownerName: "Rep One", countsByValue: [{ value: "Replied", count: 2 }] },
            ],
          },
        ],
      },
    ],
    isDemo: true,
    demoBanner: "⚠️ DEMO — all-time totals, daily windowing not built yet; review STRUCTURE, not numbers.",
    ...overrides,
  };
}

describe("renderDigestEmail — email-client-safe template (Phase 5)", () => {
  it("returns { subject, text, html }", () => {
    const out = renderDigestEmail(sampleDigest());
    expect(typeof out.subject).toBe("string");
    expect(typeof out.text).toBe("string");
    expect(typeof out.html).toBe("string");
    expect(out.html).toMatch(/<!DOCTYPE html>/i);
  });

  it("renders the DEMO banner PROMINENTLY near the top (before the sections)", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toMatch(/DEMO/);
    expect(html).toMatch(/all-time/i);
    // prominent = appears before §1 content (the activity-volume heading)
    const bannerIdx = html.search(/DEMO/);
    const section1Idx = html.search(/activity volume by rep/i);
    expect(bannerIdx).toBeGreaterThanOrEqual(0);
    expect(section1Idx).toBeGreaterThan(bannerIdx);
  });

  it("GO-LIVE: isDemo:false → DEMO banner is ABSENT (gated off; data is yesterday-real)", () => {
    const { html } = renderDigestEmail(sampleDigest({ isDemo: false }));
    expect(html).not.toMatch(/DEMO/);
    expect(html).not.toMatch(/all-time totals/i);
    // sections still render — only the banner is gone
    expect(html).toMatch(/activity volume by rep/i);
  });

  it("§1 renders TRUE activity volume by rep (from activityByRep), no contribution-flag", () => {
    const { html } = renderDigestEmail(sampleDigest());
    // true heading now that the number is correct
    expect(html).toMatch(/activity volume by rep/i);
    // rep rows + their TRUE per-rep activity counts (from activityByRep, not field-contributions)
    expect(html).toContain("Rep One");
    expect(html).toContain("11");
    expect(html).toContain("Rep Two");
    expect(html).toContain("6");
    // the honest-label workaround is GONE — no contribution flag remains
    expect(html).not.toMatch(/custom-field contribution/i);
    expect(html).not.toMatch(/not activities logged/i);
  });

  it("§2 renders activity mix by type (type · count)", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toMatch(/by type|activity mix/i);
    expect(html).toContain("Upwork Connect");
    expect(html).toContain("14");
    expect(html).toContain("LinkedIn DM");
    expect(html).toContain("9");
  });

  it("§3 Number field shows per-rep sums AND the team total", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toContain("Bid Amount");
    expect(html).toContain("3000");
    expect(html).toContain("1500");
    expect(html).toContain("4500"); // team total
  });

  it("§3 Select field shows value×count", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toContain("Outcome");
    expect(html).toMatch(/Replied/);
    expect(html).toMatch(/Replied[^<]*2|2[^<]*Replied|×\s*2|x\s*2/i);
  });

  it("§4 tasks: renders a LOUD not-built placeholder, distinct from 'zero tasks today'", () => {
    const { html } = renderDigestEmail(sampleDigest());
    // section is present in the shape
    expect(html).toMatch(/tasks/i);
    // LOUD not-built: explicit "not wired / placeholder / pending" language
    expect(html).toMatch(/not.*wired|placeholder|not yet wired|pending/i);
    // and it must NOT read like an empty-but-working section ("no tasks due today")
    expect(html).not.toMatch(/no tasks (due )?today/i);
    expect(html).not.toMatch(/0 tasks due/i);
    // warning-styled (carries the same ⚠ marker class as a flagged block, not a muted row)
    expect(html).toMatch(/⚠[^<]*tasks|tasks[^<]*not yet/i);
  });

  it("escapes HTML in dynamic values (injection-safe)", () => {
    const evil = sampleDigest({
      activitiesByType: [{ type: "<script>alert(1)</script>", count: 1 }],
    });
    const { html } = renderDigestEmail(evil);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toMatch(/&lt;script&gt;/);
  });

  it("uses table-based layout only — no flex/grid in the output", () => {
    const { html } = renderDigestEmail(sampleDigest());
    expect(html).toMatch(/<table/i);
    expect(html).not.toMatch(/display:\s*flex/i);
    expect(html).not.toMatch(/display:\s*grid/i);
    // inline styles, not a <style> block
    expect(html).not.toMatch(/<style[\s>]/i);
  });

  it("subject names the digest", () => {
    const { subject } = renderDigestEmail(sampleDigest());
    expect(subject).toMatch(/digest/i);
  });
});
