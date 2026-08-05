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

/**
 * The desktop shell's native notification bridge, when running inside Electron.
 * `undefined` in a plain browser tab.
 */
function desktopNotificationBridge() {
  if (typeof window === "undefined") return undefined;
  const show = window.electron?.notifications?.show;
  return typeof show === "function" ? window.electron!.notifications! : undefined;
}

/** Is the Electron native-notification bridge reachable from this renderer? */
export function desktopBridgeAvailable(): boolean {
  return desktopNotificationBridge() !== undefined;
}

export interface OsNotificationInput {
  title: string;
  body?: string;
  /** Coalescing tag (per channel) so repeats replace rather than stack. */
  tag?: string;
  icon?: string;
  /**
   * Channel this alert belongs to, used by the Electron bridge to build its
   * `quikchat://open/<channelId>` deep link. Deliberately separate from `tag`:
   * `tag` falls back to a message id, which must never reach the bridge as a
   * channel id.
   */
  channelId?: string | null;
  /** Invoked when the user clicks the OS notification. Browser path only. */
  onClick?: () => void;
}

/**
 * Fire an OS notification.
 *
 * Inside the Electron shell this delegates to the main process and returns null —
 * only the main process can un-minimize/restore + focus the window on click, and
 * its click handler already sends the `deeplink` IPC that `DesktopBridge` routes
 * into `openChannel`. In a plain browser tab it constructs a `Notification` IFF
 * permission is granted and the API is supported, and returns it (or null).
 *
 * Focus + the server `desktop` flag are checked by the caller (see
 * `shouldFireOsNotification`).
 */
export function fireOsNotification(input: OsNotificationInput): Notification | null {
  // Desktop shell: hand off and stop. Never ALSO construct a browser
  // Notification here — that would surface two native alerts for one event.
  const bridge = desktopNotificationBridge();
  if (bridge) {
    try {
      // Fire-and-forget: `show` is an async ipcRenderer.invoke and this function
      // is sync. `onClick` is not forwarded — a function cannot cross IPC, and
      // the main process's deep link already closes that loop.
      // Wrapped in Promise.resolve so a rejected invoke (no handler registered
      // in the main process) can't surface as an unhandled rejection.
      void Promise.resolve(
        bridge.show({
          title: input.title,
          body: input.body,
          icon: input.icon,
          channelId: input.channelId ?? undefined,
        }),
      ).catch(() => undefined);
    } catch {
      // A broken bridge must not break the in-app feed.
    }
    return null;
  }

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
 * fire an OS notification only when the payload says `desktop` and the app is
 * NOT focused — plus a delivery path that will actually show something.
 *
 * Two independent delivery paths satisfy that last condition:
 *  - the Electron bridge, which fires from the main process and is gated by the
 *    OS rather than by this renderer's `Notification.permission`; or
 *  - browser permission being granted.
 *
 * The bridge is checked separately on purpose. If it were gated behind the
 * renderer's permission read, a shell whose renderer reports anything other than
 * "granted" would silently lose native notifications entirely — with everything
 * downstream (bridge present, IPC wired, click handler correct) still looking
 * healthy, which is near-impossible to debug.
 */
export function shouldFireOsNotification(desktop: boolean): boolean {
  if (!desktop || isAppFocused()) return false;
  return desktopBridgeAvailable() || permissionState() === "granted";
}
