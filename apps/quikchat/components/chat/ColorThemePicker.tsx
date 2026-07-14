/**
 * Accent color themes. Each has a light + dark page/frame color; the rest of the
 * theme (own-bubble tint, active states) derives from these via CSS
 * `[data-accent]` rules in theme.css. Selection persists to localStorage and is
 * applied by setting `data-accent` on <html>.
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

export const STORAGE_KEY = "qc-accent";
