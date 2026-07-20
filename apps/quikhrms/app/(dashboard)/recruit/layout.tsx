// Subtle content down-scale for the Recruit module — shrinks every page's text
// (including fixed-px sizes) a touch for a more compact, premium density.
// Scoped here so it applies to all /recruit/* pages without per-element edits.
export default function RecruitLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ zoom: 0.9 }}>{children}</div>;
}
