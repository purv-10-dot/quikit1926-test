// People module — subtle 0.9 content scale, matching Recruit (see recruit/layout).
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ zoom: 0.9 }}>{children}</div>;
}
