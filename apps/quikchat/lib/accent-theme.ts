/**
 * Accent color themes. Each has a light + dark page/frame color; the rest of the
 * theme (own-bubble tint, active states) derives from these via CSS
 * `[data-accent]` rules in theme.css. Selection persists to localStorage under
 * `STORAGE_KEY` and is applied by setting `data-accent` on <html>.
 *
 * Lives in `lib/` rather than `components/chat/ColorThemePicker.tsx`, which is
 * where it used to be: that file exported these two constants and no component,
 * so every importer was reaching into a "Picker" for data. Both consumers
 * (SettingsModule writes, ChatShell reads on boot) import from here now.
 */
export const THEMES: { key: string; name: string; light: string; dark: string }[] = [
  { key: "sage", name: "Sage Green", light: "#C6DBBA", dark: "#3F5D43" },
  { key: "mint", name: "Mint", light: "#BFE3D1", dark: "#365D53" },
  { key: "mist", name: "Mist Blue", light: "#C4D8E8", dark: "#344D66" },
  { key: "lavender", name: "Lavender", light: "#D4CAE8", dark: "#54446B" },
  { key: "rose", name: "Dusty Rose", light: "#E3C8CF", dark: "#65434C" },
  { key: "sand", name: "Warm Sand", light: "#E5D8C3", dark: "#645542" },
  { key: "graphite", name: "Graphite Gray", light: "#D3D7DC", dark: "#3A414A" },
];

/**
 * localStorage key for the chosen accent. MUST be imported, never re-typed:
 * ChatShell used to read the literal `"qc-accent"` while SettingsModule wrote
 * via this constant. They happened to agree, so nothing was broken — but two
 * spellings of one key is a rename away from a silent bug.
 */
export const STORAGE_KEY = "qc-accent";

/** The accent applied when nothing is stored yet. */
export const DEFAULT_ACCENT = "mist";
