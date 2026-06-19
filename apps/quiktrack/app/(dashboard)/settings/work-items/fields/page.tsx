"use client";

import { RequirePerm } from "@/components/shell/require-perm";
import { CustomFieldsManager } from "@/components/custom-fields/custom-fields-manager";

export default function GlobalFieldsPage() {
  return (
    <RequirePerm adminOnly>
      <CustomFieldsManager scope="global" />
    </RequirePerm>
  );
}
