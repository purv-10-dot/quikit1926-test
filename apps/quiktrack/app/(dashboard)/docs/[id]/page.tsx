"use client";

import { useEffect, useState } from "react";
import { DocEditor } from "@/app/(dashboard)/spaces/[id]/docs/_components/doc-editor";

/**
 * Standalone doc viewer — opens a single doc by id WITHOUT the project shell or
 * its membership gate. This is the link target for shared docs: an org member
 * who was given doc access (but isn't a project member) can open it here, where
 * access is decided purely by the doc's resolveDocAccess (owner / share /
 * published-project baseline), not by project membership.
 *
 * Project members still open docs from the project's Docs tab as before.
 */
export default function StandaloneDocPage({ params }: { params: { id: string } }) {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "denied">("loading");

  useEffect(() => {
    let alive = true;
    fetch(`/api/docs/${params.id}`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.success && j.data?.projectId) {
          setProjectId(j.data.projectId as string);
          setState("ok");
        } else {
          setState("denied");
        }
      })
      .catch(() => alive && setState("denied"));
    return () => {
      alive = false;
    };
  }, [params.id]);

  if (state === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-500">Loading…</div>
    );
  }
  if (state === "denied" || !projectId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center px-6">
        <p className="text-sm font-medium text-gray-700">Document not found</p>
        <p className="text-xs text-gray-500">
          It may have been deleted, or you don&apos;t have access to it.
        </p>
      </div>
    );
  }
  return <DocEditor projectId={projectId} docId={params.id} standalone />;
}
