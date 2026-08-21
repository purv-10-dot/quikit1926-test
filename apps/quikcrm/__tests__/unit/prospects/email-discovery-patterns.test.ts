/**
 * Pure helpers behind the email-discovery cascade.
 *
 * These carry the correctness of every guessed address, so they are pinned
 * independently of the network tiers. The cases that matter most:
 *   - buildFromPattern / inferPattern are exact inverses over the closed key set
 *   - provider pattern notation ({first}.{last}, etc.) normalises into that set
 *   - role accounts (info@, sales@) cannot vote for the "firstname" pattern
 *   - domain normalisation handles multi-label eTLDs (.co.uk, .co.in)
 */
import { describe, expect, it } from "vitest";
import {
  EMAIL_PATTERNS,
  buildCandidates,
  buildFromPattern,
  buildPrioritizedCandidates,
  inferPattern,
  normalizeProviderPattern,
  normalizePart,
  splitName,
} from "@/lib/services/prospects/email-discovery/patterns";
import {
  extractEmailsFromText,
  inferPublicPattern,
} from "@/lib/services/prospects/email-discovery/public-emails";
import {
  extractDomainFromUrl,
  guessDomainsFromCompany,
  isLikelyCorporateDomain,
  normalizeDomain,
  getMailProvider,
} from "@/lib/services/prospects/email-discovery/domain";

describe("name parsing", () => {
  it("splits a full name into first and remainder", () => {
    expect(splitName("Jane Alice Smith")).toEqual({ first: "Jane", last: "Alice Smith" });
    expect(splitName("Cher")).toEqual({ first: "Cher", last: "" });
    expect(splitName("   ")).toEqual({ first: "", last: "" });
  });

  it("reduces a name part to its first token, stripped of punctuation", () => {
    expect(normalizePart("O'Brien")).toBe("obrien");
    expect(normalizePart("Jean Pierre")).toBe("jean");
    expect(normalizePart("D'Souza-Fernandes")).toBe("dsouzafernandes");
  });
});

describe("buildFromPattern / inferPattern", () => {
  it("round-trips every pattern in the closed set", () => {
    for (const pattern of EMAIL_PATTERNS) {
      const email = buildFromPattern("jane", "smith", "acme.com", pattern);
      expect(inferPattern(email, "jane", "smith")).toBe(pattern);
    }
  });

  it("falls back to firstname for an unknown pattern key rather than throwing", () => {
    expect(buildFromPattern("jane", "smith", "acme.com", "nonsense")).toBe("jane@acme.com");
  });

  it("returns '' when an address matches no known pattern", () => {
    expect(inferPattern("j.a.smith@acme.com", "jane", "smith")).toBe("");
  });
});

describe("buildCandidates", () => {
  it("produces the five patterns for a two-part name, first.last first", () => {
    const out = buildCandidates("Jane", "Smith", "acme.com");
    expect(out[0]).toBe("jane.smith@acme.com");
    expect(out).toHaveLength(5);
  });

  it("emits only firstname@ for a single-token name", () => {
    // Every other pattern needs a surname; emitting "j.@acme.com" would be junk.
    expect(buildCandidates("Cher", "", "acme.com")).toEqual(["cher@acme.com"]);
  });

  it("returns nothing without a first name or a domain", () => {
    expect(buildCandidates("", "Smith", "acme.com")).toEqual([]);
    expect(buildCandidates("Jane", "Smith", "")).toEqual([]);
  });
});

describe("buildPrioritizedCandidates", () => {
  it("ranks a learned pattern above the provider default", () => {
    const out = buildPrioritizedCandidates({
      first: "jane",
      last: "smith",
      domain: "acme.com",
      provider: "google-workspace",
      knownPattern: "firstinitiallastname",
    });
    expect(out[0]).toBe("jsmith@acme.com");
  });

  it("puts a known-good address ahead of everything", () => {
    const out = buildPrioritizedCandidates({
      first: "jane",
      last: "smith",
      domain: "acme.com",
      provider: "unknown",
      publicEmail: "jane.s@acme.com",
    });
    expect(out[0]).toBe("jane.s@acme.com");
  });

  it("de-duplicates while preserving best position", () => {
    const out = buildPrioritizedCandidates({
      first: "jane",
      last: "smith",
      domain: "acme.com",
      provider: "unknown",
      knownPattern: "firstname.lastname",
    });
    expect(new Set(out).size).toBe(out.length);
  });
});

describe("normalizeProviderPattern", () => {
  it("maps Hunter's brace notation onto our keys", () => {
    expect(normalizeProviderPattern("{first}.{last}")).toBe("firstname.lastname");
    expect(normalizeProviderPattern("{first}{last}")).toBe("firstlast");
    expect(normalizeProviderPattern("{first}_{last}")).toBe("firstname_lastname");
    expect(normalizeProviderPattern("{f}{last}")).toBe("firstinitiallastname");
    expect(normalizeProviderPattern("{first}")).toBe("firstname");
  });

  it("passes through a value already in our key set", () => {
    expect(normalizeProviderPattern("firstname.lastname")).toBe("firstname.lastname");
  });

  it("returns '' for notation it cannot map, so the caller keeps its own ranking", () => {
    expect(normalizeProviderPattern("{initials}")).toBe("");
    expect(normalizeProviderPattern("")).toBe("");
    expect(normalizeProviderPattern(null)).toBe("");
  });
});

describe("extractEmailsFromText", () => {
  it("finds addresses at the domain and lowercases them", () => {
    const text = "Contact Jane.Smith@Acme.com or sales@acme.com. Not bob@other.com.";
    expect(extractEmailsFromText(text, "acme.com").sort()).toEqual([
      "jane.smith@acme.com",
      "sales@acme.com",
    ]);
  });

  it("treats dots in the domain literally, not as regex wildcards", () => {
    // Without escaping, "acme.com" would also match "acmeXcom".
    expect(extractEmailsFromText("a@acmeXcom", "acme.com")).toEqual([]);
  });
});

describe("inferPublicPattern", () => {
  it("infers first.last from separator evidence", () => {
    expect(inferPublicPattern(["jane.smith@acme.com", "bob.jones@acme.com"])).toBe(
      "firstname.lastname",
    );
  });

  it("ignores role accounts so they cannot vote for 'firstname'", () => {
    // This is the fix over the source implementation, which counted every
    // address it found: info@ + sales@ would have won "firstname" outright at a
    // company that actually uses first.last for people.
    expect(inferPublicPattern(["info@acme.com", "sales@acme.com"])).toBe("");
  });

  it("requires two independent examples before a bare local-part wins", () => {
    expect(inferPublicPattern(["jane@acme.com"])).toBe("");
    expect(inferPublicPattern(["jane@acme.com", "bob@acme.com"])).toBe("firstname");
  });

  it("returns '' with no evidence at all", () => {
    expect(inferPublicPattern([])).toBe("");
  });
});

describe("domain helpers", () => {
  it("normalises hostnames, honouring multi-label public suffixes", () => {
    expect(normalizeDomain("www.acme.com")).toBe("acme.com");
    expect(normalizeDomain("mail.corp.acme.com")).toBe("acme.com");
    expect(normalizeDomain("careers.acme.co.uk")).toBe("acme.co.uk");
    expect(normalizeDomain("jobs.acme.co.in")).toBe("acme.co.in");
  });

  it("extracts a domain from a URL, including scheme-less values", () => {
    expect(extractDomainFromUrl("https://www.acme.com/about")).toBe("acme.com");
    // The LinkedIn scraper frequently produces these.
    expect(extractDomainFromUrl("acme.com/about")).toBe("acme.com");
    expect(extractDomainFromUrl("")).toBe("");
  });

  it("rejects consumer mailbox and social domains", () => {
    expect(isLikelyCorporateDomain("acme.com")).toBe(true);
    expect(isLikelyCorporateDomain("gmail.com")).toBe(false);
    expect(isLikelyCorporateDomain("linkedin.com")).toBe(false);
    expect(isLikelyCorporateDomain("notadomain")).toBe(false);
  });

  it("strips corporate suffixes when guessing domains", () => {
    const guesses = guessDomainsFromCompany("Acme Solutions Pvt Ltd");
    // Only the trailing suffix is stripped per pass, so "solutions" survives —
    // what matters is that .com leads and the slug is punctuation-free.
    expect(guesses[0].endsWith(".com")).toBe(true);
    expect(guesses.every((g) => /^[a-z0-9-]+\.[a-z]+$/.test(g))).toBe(true);
  });

  it("returns nothing for an empty company name", () => {
    expect(guessDomainsFromCompany("")).toEqual([]);
  });

  it("identifies mail providers from MX hostnames", () => {
    expect(getMailProvider("aspmx.l.google.com")).toBe("google-workspace");
    expect(getMailProvider("acme-com.mail.protection.outlook.com")).toBe("microsoft-365");
    expect(getMailProvider("us-smtp-inbound-1.mimecast.com")).toBe("mimecast");
    expect(getMailProvider("")).toBe("unknown");
  });
});
