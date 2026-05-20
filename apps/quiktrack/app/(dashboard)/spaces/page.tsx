import { SpacesGrid } from "./_components/spaces-grid";
import { RequirePerm } from "@/components/shell/require-perm";

export default function SpacesPage() {
  return (
    <RequirePerm resource="Project" action="view">
      <SpacesGrid />
    </RequirePerm>
  );
}
