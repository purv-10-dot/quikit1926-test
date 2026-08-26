/**
 * Space background registry — the single source of truth shared by the picker
 * (client), the API validator (server), and the header renderer.
 *
 * Stored on `QtProject.background` as `{ type, value }`:
 *   • type "color"    → `value` is a COLOR KEY from BACKGROUND_COLORS
 *   • type "gradient" → `value` is a GRADIENT KEY from BACKGROUND_GRADIENTS
 *   • type "image"    → `value` is an https:// URL or a `data:image/...` URL
 *
 * Presets are stored as KEYS, never as raw CSS. That keeps rows tiny, lets us
 * restyle a theme later without a data migration, and means a hostile client
 * can't smuggle arbitrary CSS into every viewer's header (`background` is
 * interpolated into a style attribute).
 */

export type SpaceBackgroundType = "color" | "gradient" | "image";

export interface SpaceBackground {
  type: SpaceBackgroundType;
  value: string;
}

export interface BackgroundPreset {
  key: string;
  label: string;
  /** The CSS `background` shorthand value this preset renders as. */
  css: string;
  /** Foreground that stays readable on top of `css`. */
  foreground: "light" | "dark";
}

/** Flat colour washes — deliberately muted so header text stays legible. */
export const BACKGROUND_COLORS: readonly BackgroundPreset[] = [
  { key: "slate", label: "Slate", css: "#f1f5f9", foreground: "dark" },
  { key: "blue", label: "Blue", css: "#dbeafe", foreground: "dark" },
  { key: "teal", label: "Teal", css: "#ccfbf1", foreground: "dark" },
  { key: "green", label: "Green", css: "#dcfce7", foreground: "dark" },
  { key: "amber", label: "Amber", css: "#fef3c7", foreground: "dark" },
  { key: "rose", label: "Rose", css: "#ffe4e6", foreground: "dark" },
  { key: "purple", label: "Purple", css: "#ede9fe", foreground: "dark" },
  { key: "midnight", label: "Midnight", css: "#1e293b", foreground: "light" },
] as const;

/** Two-stop gradients, matching the Jira "Set space background" theme strip. */
export const BACKGROUND_GRADIENTS: readonly BackgroundPreset[] = [
  {
    key: "dawn",
    label: "Dawn",
    css: "linear-gradient(135deg, #fdba74 0%, #f472b6 100%)",
    foreground: "light",
  },
  {
    key: "ocean",
    label: "Ocean",
    css: "linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)",
    foreground: "light",
  },
  {
    key: "forest",
    label: "Forest",
    css: "linear-gradient(135deg, #4ade80 0%, #0f766e 100%)",
    foreground: "light",
  },
  {
    key: "nebula",
    label: "Nebula",
    css: "linear-gradient(135deg, #a78bfa 0%, #4338ca 100%)",
    foreground: "light",
  },
  {
    key: "ember",
    label: "Ember",
    css: "linear-gradient(135deg, #fb7185 0%, #b91c1c 100%)",
    foreground: "light",
  },
  {
    key: "graphite",
    label: "Graphite",
    css: "linear-gradient(135deg, #64748b 0%, #0f172a 100%)",
    foreground: "light",
  },
] as const;

/**
 * Upload ceiling for a custom background image. Images are inlined as data URLs
 * into a jsonb column, so this is a row-size guard, not a UX preference — keep
 * it well under Postgres' practical jsonb comfort zone.
 */
export const MAX_BACKGROUND_IMAGE_BYTES = 1_500_000;

/** MIME types the picker accepts for a custom background image. */
export const BACKGROUND_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
] as const;

function findPreset(type: SpaceBackgroundType, value: string): BackgroundPreset | null {
  const list =
    type === "color" ? BACKGROUND_COLORS : type === "gradient" ? BACKGROUND_GRADIENTS : null;
  return list?.find((p) => p.key === value) ?? null;
}

/** True when `value` names a preset in this `type`'s list. */
export function isPresetKey(type: SpaceBackgroundType, value: string): boolean {
  return findPreset(type, value) !== null;
}

/**
 * True when `value` is an image reference we're willing to put in a style
 * attribute: an https URL or an inline data URL of an accepted image type.
 * `url(...)` is built by `backgroundCss`, so anything that survives this check
 * must not be able to break out of the CSS url() token — hence the explicit
 * rejection of quotes, parentheses, whitespace, and backslashes.
 */
export function isSafeImageValue(value: string): boolean {
  if (/["'()\\\s]/.test(value)) return false;
  if (value.startsWith("https://")) return true;
  return BACKGROUND_IMAGE_TYPES.some((t) => value.startsWith(`data:${t};base64,`));
}

/** Structural + value validation for a background payload from the wire. */
export function isValidBackground(bg: unknown): bg is SpaceBackground {
  if (!bg || typeof bg !== "object") return false;
  const { type, value } = bg as Partial<SpaceBackground>;
  if (typeof value !== "string" || value.length === 0) return false;
  if (type === "image") return isSafeImageValue(value);
  if (type === "color" || type === "gradient") return isPresetKey(type, value);
  return false;
}

/**
 * The CSS `background` shorthand for a stored background, or null for "no
 * background" (the default plain surface). Returns null rather than throwing on
 * an unknown preset key so a template/theme we later retire degrades to plain
 * instead of blanking the header.
 */
export function backgroundCss(bg: SpaceBackground | null | undefined): string | null {
  if (!bg) return null;
  if (bg.type === "image") {
    return isSafeImageValue(bg.value) ? `center / cover no-repeat url(${bg.value})` : null;
  }
  return findPreset(bg.type, bg.value)?.css ?? null;
}

/**
 * Which foreground the header should use on top of this background. Custom
 * images are unknowable, so they get the "light" (white-on-scrim) treatment the
 * header pairs with a dark overlay.
 */
export function backgroundForeground(bg: SpaceBackground | null | undefined): "light" | "dark" {
  if (!bg) return "dark";
  if (bg.type === "image") return "light";
  return findPreset(bg.type, bg.value)?.foreground ?? "dark";
}
