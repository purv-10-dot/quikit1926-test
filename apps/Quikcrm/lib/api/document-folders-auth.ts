import { assertModule } from "@/lib/auth/permissions";
import { REF_CONFIG } from "@/lib/services/documents/ref-config";
import type { FolderScope } from "@/lib/services/document-folders/types";
import type { ModuleAction } from "@/types/permission";
import type { SessionUser } from "@/types/permission";

export async function assertFolderModule(
  user: SessionUser,
  scope: FolderScope,
  action: ModuleAction,
): Promise<void> {
  if (scope.refType) {
    const cfg = REF_CONFIG[scope.refType];
    await assertModule(user, cfg.module, action);
    return;
  }
  await assertModule(user, "documents", action);
}
