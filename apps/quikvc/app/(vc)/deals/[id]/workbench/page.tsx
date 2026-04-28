import { redirect } from "next/navigation";

export default function WorkbenchIndex({ params }: { params: { id: string } }) {
  // Default workbench tab → Scorecard
  redirect(`/deals/${params.id}/workbench/scorecard`);
}
