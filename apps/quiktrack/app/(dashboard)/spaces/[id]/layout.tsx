"use client";

import { usePathname } from "next/navigation";
import { ProjectHeader } from "./_components/project-header";

export default function SpaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { id: string };
}) {
  const pathname = usePathname();
  const isSettings = pathname?.startsWith(`/spaces/${params.id}/settings`) ?? false;
  // Full-page issue view (/spaces/<id>/work/<issueId>) renders its own
  // breadcrumb, so the project tab bar is suppressed to match the Jira
  // single-issue layout.
  const isWorkItem = pathname?.startsWith(`/spaces/${params.id}/work/`) ?? false;

  if (isSettings || isWorkItem) {
    return <div className="h-full bg-white overflow-y-auto">{children}</div>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-shrink-0 bg-white">
        <ProjectHeader projectId={params.id} />
      </div>
      <div className="flex-1 overflow-y-auto bg-white">{children}</div>
    </div>
  );
}
