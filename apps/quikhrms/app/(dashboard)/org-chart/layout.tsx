// Subtle content down-scale for the People / Org Chart module (see recruit/layout).
export default function OrgChartLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ zoom: 0.9 }}>{children}</div>;
}
