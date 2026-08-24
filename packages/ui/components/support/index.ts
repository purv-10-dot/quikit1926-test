/**
 * Contact Support widget — the floating launcher every QuikIT app mounts, plus
 * the Settings → Support Status table.
 *
 * Exposed on the `@quikit/ui/support` subpath rather than the `@quikit/ui`
 * barrel: these components import `@quikit/shared/supportContent`, and keeping
 * them off the barrel means an app that never mounts support doesn't pull the
 * per-app guide/KB data into its bundle.
 */

export { SupportLauncher, type SupportLauncherProps } from "./support-launcher";
export { SupportPanel, type SupportPanelProps } from "./support-panel";
export { SupportStatusTab, type SupportStatusTabProps } from "./support-status-tab";
export { SupportMenu } from "./support-menu";
export { SupportGuide } from "./support-guide";
export { SupportRequestForm } from "./support-request-form";
export {
  SupportAttachmentPicker,
  formatBytes,
  type PickedFile,
} from "./support-attachment-picker";
export type { SupportView } from "./types";
export {
  useDraggableFab,
  getAnchoredPanelStyle,
  FAB_SIZE_PX,
  SUPPORT_FAB_STORAGE_KEY,
  type FabPosition,
  type FabAnchor,
  type DraggableFab,
  type UseDraggableFabOptions,
  type AnchoredPanelStyle,
} from "./use-draggable-fab";
