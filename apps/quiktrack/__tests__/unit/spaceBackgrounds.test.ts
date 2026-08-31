import { describe, it, expect } from "vitest";
import {
  BACKGROUND_COLORS,
  BACKGROUND_GRADIENTS,
  backgroundCss,
  backgroundForeground,
  isPresetKey,
  isSafeImageValue,
  isValidBackground,
} from "@/lib/spaceBackgrounds";

const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("isPresetKey", () => {
  it("accepts a key from the matching list", () => {
    expect(isPresetKey("color", "slate")).toBe(true);
    expect(isPresetKey("gradient", "ocean")).toBe(true);
  });

  it("rejects a key from the other list (the lists are not interchangeable)", () => {
    expect(isPresetKey("color", "ocean")).toBe(false);
    expect(isPresetKey("gradient", "slate")).toBe(false);
  });

  it("rejects unknown keys and the image type (which has no presets)", () => {
    expect(isPresetKey("color", "chartreuse")).toBe(false);
    expect(isPresetKey("image", "slate")).toBe(false);
  });
});

describe("isSafeImageValue", () => {
  it("accepts https URLs and base64 data URLs of allowed types", () => {
    expect(isSafeImageValue("https://cdn.example.com/bg.png")).toBe(true);
    expect(isSafeImageValue(PNG)).toBe(true);
    expect(isSafeImageValue("data:image/webp;base64,UklGRg==")).toBe(true);
  });

  it("rejects anything that could break out of the CSS url() token", () => {
    // These are the whole reason the guard exists: `backgroundCss` interpolates
    // the value into `url(...)` inside a style attribute.
    expect(isSafeImageValue('https://x/a.png")-attack')).toBe(false);
    expect(isSafeImageValue("https://x/a.png');background:red")).toBe(false);
    expect(isSafeImageValue("https://x/a.png) no-repeat, url(evil")).toBe(false);
    expect(isSafeImageValue("https://x/a b.png")).toBe(false);
    expect(isSafeImageValue("https://x/a\\.png")).toBe(false);
  });

  it("rejects non-https schemes and disallowed data types", () => {
    expect(isSafeImageValue("http://x/a.png")).toBe(false);
    expect(isSafeImageValue("javascript:alert(1)")).toBe(false);
    expect(isSafeImageValue("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isSafeImageValue("data:text/html;base64,PGI+")).toBe(false);
  });
});

describe("isValidBackground", () => {
  it("accepts well-formed preset and image payloads", () => {
    expect(isValidBackground({ type: "color", value: "blue" })).toBe(true);
    expect(isValidBackground({ type: "gradient", value: "nebula" })).toBe(true);
    expect(isValidBackground({ type: "image", value: PNG })).toBe(true);
  });

  it("rejects malformed payloads", () => {
    expect(isValidBackground(null)).toBe(false);
    expect(isValidBackground("blue")).toBe(false);
    expect(isValidBackground({ type: "color" })).toBe(false);
    expect(isValidBackground({ type: "color", value: "" })).toBe(false);
    expect(isValidBackground({ type: "color", value: 7 })).toBe(false);
    expect(isValidBackground({ type: "video", value: "blue" })).toBe(false);
  });

  it("rejects raw CSS smuggled in as a preset value", () => {
    expect(isValidBackground({ type: "color", value: "red; position:fixed" })).toBe(false);
    expect(
      isValidBackground({ type: "gradient", value: "linear-gradient(#000,#fff)" }),
    ).toBe(false);
  });
});

describe("backgroundCss", () => {
  it("returns null for no background", () => {
    expect(backgroundCss(null)).toBeNull();
    expect(backgroundCss(undefined)).toBeNull();
  });

  it("resolves preset keys to their registered CSS", () => {
    const slate = BACKGROUND_COLORS.find((p) => p.key === "slate")!;
    const ocean = BACKGROUND_GRADIENTS.find((p) => p.key === "ocean")!;
    expect(backgroundCss({ type: "color", value: "slate" })).toBe(slate.css);
    expect(backgroundCss({ type: "gradient", value: "ocean" })).toBe(ocean.css);
  });

  it("builds a url() shorthand for images", () => {
    expect(backgroundCss({ type: "image", value: PNG })).toBe(
      `center / cover no-repeat url(${PNG})`,
    );
  });

  it("degrades to null rather than emitting unsafe or unknown values", () => {
    // A preset we later retire must blank the background, not the header.
    expect(backgroundCss({ type: "color", value: "retired-key" })).toBeNull();
    expect(backgroundCss({ type: "image", value: "https://x/a.png)evil" })).toBeNull();
  });
});

describe("backgroundForeground", () => {
  it("defaults to dark text with no background", () => {
    expect(backgroundForeground(null)).toBe("dark");
  });

  it("reads the preset's registered foreground", () => {
    expect(backgroundForeground({ type: "color", value: "slate" })).toBe("dark");
    expect(backgroundForeground({ type: "color", value: "midnight" })).toBe("light");
    expect(backgroundForeground({ type: "gradient", value: "ocean" })).toBe("light");
  });

  it("treats custom images as dark (unknowable) so they get the light treatment", () => {
    expect(backgroundForeground({ type: "image", value: PNG })).toBe("light");
  });

  it("falls back to dark for an unknown preset key", () => {
    expect(backgroundForeground({ type: "color", value: "retired-key" })).toBe("dark");
  });
});

describe("preset registry invariants", () => {
  it("has unique keys within each list", () => {
    const colorKeys = BACKGROUND_COLORS.map((p) => p.key);
    const gradientKeys = BACKGROUND_GRADIENTS.map((p) => p.key);
    expect(new Set(colorKeys).size).toBe(colorKeys.length);
    expect(new Set(gradientKeys).size).toBe(gradientKeys.length);
  });

  it("every preset declares a foreground and non-empty CSS", () => {
    for (const p of [...BACKGROUND_COLORS, ...BACKGROUND_GRADIENTS]) {
      expect(p.css.length).toBeGreaterThan(0);
      expect(["light", "dark"]).toContain(p.foreground);
    }
  });
});
