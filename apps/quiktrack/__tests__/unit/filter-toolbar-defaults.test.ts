import { describe, it, expect } from "vitest";
import { defaultTqlFor } from "@/app/(dashboard)/filters/[id]/_components/filter-toolbar";
import { parse } from "@/lib/tql/parser";
import { translate } from "@/lib/tql/translator";

const CTX = { userId: "user-1" };

describe("defaultTqlFor — every non-empty result is valid TQL", () => {
  const slugs = [
    "my-open",
    "reported-by-me",
    "all",
    "open",
    "done",
    "viewed-recently",
    "created-recently",
    "resolved-recently",
    "updated-recently",
    "some-unknown-slug",
  ];

  for (const slug of slugs) {
    it(`"${slug}" produces a query lib/tql can translate without throwing`, () => {
      const query = defaultTqlFor(slug);
      expect(() => translate(parse(query), CTX)).not.toThrow();
    });
  }

  it('"all" sorts by updated DESC (no filter, matching the slug\'s own default orderBy)', () => {
    expect(defaultTqlFor("all")).toBe("ORDER BY updated DESC");
  });

  it("an unknown slug produces an empty query (no equivalent to translate)", () => {
    expect(defaultTqlFor("some-unknown-slug")).toBe("");
  });

  it('"my-open" uses currentUser() and resolution IS EMPTY, not a fabricated status-category match', () => {
    const q = defaultTqlFor("my-open");
    expect(q).toContain("assignee = currentUser()");
    expect(q).toContain("resolution IS EMPTY");
  });

  it('"done"/"resolved-recently" use resolution IS NOT EMPTY', () => {
    expect(defaultTqlFor("done")).toContain("resolution IS NOT EMPTY");
    expect(defaultTqlFor("resolved-recently")).toContain("resolution IS NOT EMPTY");
  });
});
