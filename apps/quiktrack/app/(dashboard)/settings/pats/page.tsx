import { PatsView } from "./_components/pats-view";

// Self-service — any active org member manages their own tokens. No
// <RequirePerm> gate: a PAT can never grant more than its creator's own
// QuikTrack permissions already allow, so there's nothing to protect beyond
// "you're a signed-in member of this org" (already enforced by the layout
// and by /api/org/pats's withOrgAuth).
export default function PatsPage() {
  return <PatsView />;
}
