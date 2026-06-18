import { DocEditor } from "../_components/doc-editor";

/**
 * Draft editor route. Opening a template lands here (no doc row exists yet) —
 * the editor seeds from the template and only creates the doc on first save,
 * so picking a template and closing without typing leaves nothing behind.
 * `new` is a static segment so it takes precedence over `[docId]`.
 */
export default function NewDocPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { template?: string; folder?: string };
}) {
  return (
    <DocEditor
      projectId={params.id}
      draftTemplateKey={searchParams.template ?? "blank"}
      draftFolderId={searchParams.folder ?? null}
    />
  );
}
