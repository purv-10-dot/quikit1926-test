import { DocEditor } from "../_components/doc-editor";

export default function DocEditorPage({
  params,
}: {
  params: { id: string; docId: string };
}) {
  return <DocEditor projectId={params.id} docId={params.docId} />;
}
