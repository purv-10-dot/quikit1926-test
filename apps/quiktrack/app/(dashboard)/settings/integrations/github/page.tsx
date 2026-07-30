"use client";

import { RequirePerm } from "@/components/shell/require-perm";
import { GithubIntegrationView } from "./_components/github-integration-view";

// Org-level GitHub integration settings. Admin-only — connecting a GitHub org
// and managing linked repos is an org-level action. The page re-enforces via
// <RequirePerm adminOnly> so a direct URL hit by a non-admin is rejected too.
export default function GithubIntegrationPage() {
  return (
    <RequirePerm adminOnly>
      <GithubIntegrationView />
    </RequirePerm>
  );
}
