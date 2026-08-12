import { describe, expect, it } from "vitest";
import {
  ResultParseError,
  junitParser,
  selectParser,
} from "@/lib/test/resultParser";

/**
 * TM-6.1 / TM-10.1 — JUnit parser unit coverage.
 * Targets the branches named in the epic's test matrix: pass/fail/skip,
 * nested suites, malformed XML with position, and automation_id conventions.
 */

const PASSING = `<?xml version="1.0" encoding="UTF-8"?>
<testsuites>
  <testsuite name="Login" tests="1">
    <testcase classname="LoginTest" name="valid_creds" time="1.25"/>
  </testsuite>
</testsuites>`;

describe("junitParser — status mapping", () => {
  it("maps a bare testcase to Passed and converts time to ms", () => {
    const [result] = junitParser.parse(PASSING);
    expect(result).toMatchObject({
      automationId: "LoginTest::valid_creds",
      status: "Passed",
      elapsedMs: 1250,
      failureMessage: null,
      stackTrace: null,
      suite: "Login",
    });
  });

  it("maps <failure> to Failed, capturing message and stack separately", () => {
    const xml = `<testsuite name="Checkout">
      <testcase classname="Pay" name="guest" time="0.5">
        <failure message="Expected 200 but got 500">at pay.ts:42
at run.ts:9</failure>
      </testcase>
    </testsuite>`;

    const [result] = junitParser.parse(xml);
    expect(result.status).toBe("Failed");
    expect(result.failureMessage).toBe("Expected 200 but got 500");
    expect(result.stackTrace).toBe("at pay.ts:42\nat run.ts:9");
  });

  it("maps <error> to Failed as well", () => {
    const xml = `<testsuite name="S">
      <testcase name="boom"><error message="TypeError"/></testcase>
    </testsuite>`;
    expect(junitParser.parse(xml)[0].status).toBe("Failed");
  });

  it("derives the message from the body when no message attribute exists", () => {
    const xml = `<testsuite name="S">
      <testcase name="t"><failure>AssertionError: nope
  at x.ts:1</failure></testcase>
    </testsuite>`;
    const [result] = junitParser.parse(xml);
    expect(result.failureMessage).toBe("AssertionError: nope");
    expect(result.stackTrace).toContain("at x.ts:1");
  });

  it("maps <skipped> to Blocked by default and Skipped when configured", () => {
    const xml = `<testsuite name="S">
      <testcase name="t"><skipped message="no browser"/></testcase>
    </testsuite>`;

    expect(junitParser.parse(xml)[0].status).toBe("Blocked");
    expect(junitParser.parse(xml, { skippedStatus: "Skipped" })[0].status).toBe("Skipped");
    expect(junitParser.parse(xml)[0].failureMessage).toBe("no browser");
  });

  it("prefers failure over skipped when a testcase carries both", () => {
    const xml = `<testsuite name="S">
      <testcase name="t"><skipped/><failure message="real"/></testcase>
    </testsuite>`;
    expect(junitParser.parse(xml)[0].status).toBe("Failed");
  });
});

describe("junitParser — structure", () => {
  it("walks arbitrarily nested testsuites", () => {
    const xml = `<testsuites>
      <testsuite name="outer">
        <testsuite name="inner">
          <testcase classname="A" name="one"/>
          <testcase classname="A" name="two"/>
        </testsuite>
        <testcase classname="B" name="three"/>
      </testsuite>
    </testsuites>`;

    const results = junitParser.parse(xml);
    expect(results.map((r) => r.automationId)).toEqual([
      "A::one",
      "A::two",
      "B::three",
    ]);
    // Innermost enclosing suite wins, so unmatched-id diagnostics point at the
    // suite the test actually lived in.
    expect(results[0].suite).toBe("inner");
    expect(results[2].suite).toBe("outer");
  });

  it("accepts <testsuite> as the root element", () => {
    const xml = `<testsuite name="S"><testcase name="t"/></testsuite>`;
    expect(junitParser.parse(xml)).toHaveLength(1);
  });

  it("returns an empty array for a suite with no testcases", () => {
    expect(junitParser.parse(`<testsuite name="S"/>`)).toEqual([]);
  });

  it("decodes entities and preserves CDATA verbatim", () => {
    const xml = `<testsuite name="S">
      <testcase name="a &amp; b"><failure message="x &lt; y"><![CDATA[raw &amp; <tag>]]></failure></testcase>
    </testsuite>`;

    const [result] = junitParser.parse(xml);
    expect(result.automationId).toBe("a & b");
    expect(result.failureMessage).toBe("x < y");
    expect(result.stackTrace).toBe("raw &amp; <tag>");
  });

  it("skips the prolog, comments and DOCTYPE", () => {
    const xml = `<?xml version="1.0"?>
<!-- a comment -->
<!DOCTYPE testsuite>
<testsuite name="S"><!-- inner --><testcase name="t"/></testsuite>`;
    expect(junitParser.parse(xml)).toHaveLength(1);
  });

  it("treats missing or invalid time as null rather than 0", () => {
    const xml = `<testsuite name="S">
      <testcase name="a"/>
      <testcase name="b" time=""/>
      <testcase name="c" time="notanumber"/>
      <testcase name="d" time="-1"/>
      <testcase name="e" time="0"/>
    </testsuite>`;
    expect(junitParser.parse(xml).map((r) => r.elapsedMs)).toEqual([
      null,
      null,
      null,
      null,
      0,
    ]);
  });
});

describe("junitParser — automationId conventions", () => {
  const xml = `<testsuite name="S"><testcase classname="Suite.Case" name="test_x"/></testsuite>`;

  it("defaults to classname::name", () => {
    expect(junitParser.parse(xml)[0].automationId).toBe("Suite.Case::test_x");
  });

  it("supports classname.name", () => {
    expect(
      junitParser.parse(xml, { automationIdFormat: "classname.name" })[0].automationId,
    ).toBe("Suite.Case.test_x");
  });

  it("supports bare name", () => {
    expect(
      junitParser.parse(xml, { automationIdFormat: "name" })[0].automationId,
    ).toBe("test_x");
  });

  it("falls back to the bare name when classname is absent", () => {
    const noClass = `<testsuite name="S"><testcase name="solo"/></testsuite>`;
    expect(junitParser.parse(noClass)[0].automationId).toBe("solo");
  });
});

describe("junitParser — malformed input", () => {
  const expectParseError = (xml: string): ResultParseError => {
    try {
      junitParser.parse(xml);
    } catch (error: unknown) {
      if (error instanceof ResultParseError) return error;
      throw error;
    }
    throw new Error("expected a ResultParseError");
  };

  it("rejects an empty document", () => {
    expect(() => junitParser.parse("   ")).toThrow(ResultParseError);
  });

  it("rejects mismatched tags and reports the opening position", () => {
    const error = expectParseError(
      `<testsuite name="S">\n  <testcase name="t"></wrong>\n</testsuite>`,
    );
    expect(error.message).toContain("Mismatched tag");
    expect(error.line).toBe(2);
    expect(error.column).toBeGreaterThan(0);
  });

  it("rejects an unclosed element", () => {
    const error = expectParseError(`<testsuite name="S"><testcase name="t">`);
    expect(error.message).toContain("Unclosed element");
  });

  it("rejects an unquoted attribute value", () => {
    const error = expectParseError(`<testsuite name=S></testsuite>`);
    expect(error.message).toContain("must be quoted");
    expect(error.line).toBe(1);
  });

  it("rejects a wrong root element", () => {
    expect(() => junitParser.parse(`<results><testcase name="t"/></results>`)).toThrow(
      /Expected root <testsuites> or <testsuite>/,
    );
  });

  it("reports the correct line for an error on a later line", () => {
    const error = expectParseError(
      `<testsuite name="S">\n\n\n  <testcase name=bad/>\n</testsuite>`,
    );
    expect(error.line).toBe(4);
  });
});

describe("selectParser", () => {
  it("auto-detects JUnit", () => {
    expect(selectParser(PASSING).format).toBe("junit");
  });

  it("selects by explicit format id", () => {
    expect(selectParser(PASSING, "junit").format).toBe("junit");
  });

  it("throws on an unknown format id", () => {
    expect(() => selectParser(PASSING, "tap")).toThrow(/Unknown report format/);
  });

  it("throws when nothing recognises the payload", () => {
    expect(() => selectParser("just some text")).toThrow(/Unrecognised report format/);
  });
});
