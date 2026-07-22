/**
 * Thin wrapper over the browser Notification API. The SERVER already decided
 * whether an OS alert is warranted (the `desktop` flag accounts for mute / snooze
 * / DND / desktopEnabled). The client only adds the two things the server can't
 * know: is the tab focused, and has the user granted permission.
 *
 * A service-worker / Push API path for closed-tab delivery is a future add.
 */

export type NotificationPermissionState = "granted" | "denied" | "default" | "unsupported";

/** Is the Notification API available in this environment? */
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function permissionState(): NotificationPermissionState {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission as NotificationPermissionState;
}

/** Is the document currently focused/visible? */
export function isAppFocused(): boolean {
  if (typeof document === "undefined") return false;
  return document.visibilityState === "visible";
}

/**
 * Request OS-notification permission. MUST be called from a user gesture
 * (button click / toggle) — never on load. Resolves to the resulting state.
 */
export async function requestPermission(): Promise<NotificationPermissionState> {
  if (!notificationsSupported()) return "unsupported";
  try {
    const result = await Notification.requestPermission();
    return result as NotificationPermissionState;
  } catch {
    return permissionState();
  }
}

export interface OsNotificationInput {
  title: string;
  body?: string;
  /** Coalescing tag (per channel) so repeats replace rather than stack. */
  tag?: string;
  icon?: string;
  /** Invoked when the user clicks the OS notification. */
  onClick?: () => void;
}

/**
 * Fire an OS notification IFF permission is granted and the API is supported.
 * Focus + the server `desktop` flag are checked by the caller (see
 * `shouldFireOsNotification`). Returns the Notification or null.
 */
export function fireOsNotification(input: OsNotificationInput): Notification | null {
  if (!notificationsSupported() || Notification.permission !== "granted") return null;
  try {
    const n = new Notification(input.title, {
      body: input.body,
      tag: input.tag,
      icon: input.icon,
    });
    if (input.onClick) {
      n.onclick = () => {
        if (typeof window !== "undefined") window.focus();
        input.onClick?.();
      };
    }
    return n;
  } catch {
    return null;
  }
}

/**
 * The client-side firing rule (the server already gated on mute/snooze/DND):
 * fire an OS notification only when the payload says `desktop`, the tab is NOT
 * focused, and permission is granted.
 */
export function shouldFireOsNotification(desktop: boolean): boolean {
  return desktop && !isAppFocused() && permissionState() === "granted";
}
