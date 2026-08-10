/**
 * Ambient declaration for the native API the QuikChat desktop shell (separate
 * `quikchat-desktop/` Electron repo) exposes on `window.electron` via its preload.
 *
 * Present ONLY inside the Electron shell — `undefined` in a normal browser. The
 * web app must treat every member as optional and gate on `isElectron`.
 *
 * This is the web-side type only; the shell owns the real implementation. Keep it
 * in sync with the preload, but never add runtime here — this stays a pure `.d.ts`.
 */

interface QuikchatElectronUnread {
  set(count: number): Promise<unknown>;
}

interface QuikchatElectronDeepLinks {
  /** Subscribe to `quikchat://…` deep links. Returns an unsubscribe fn. */
  onUrl(cb: (url: string) => void): () => void;
}

interface QuikchatElectronNotifications {
  /**
   * Fire a real OS notification from the MAIN process. Only the main process can
   * un-minimize/restore + focus the window on click, which a renderer-side
   * `new Notification()` cannot do.
   *
   * The main process's own click handler sends a `deeplink` IPC message —
   * `quikchat://open/<channelId>` when `channelId` is given, or `url` verbatim —
   * which `DesktopBridge` already listens for. There is deliberately no click
   * callback here: a function cannot cross the IPC boundary.
   *
   * Resolves `false` when the OS reports notifications unsupported.
   */
  show(opts: {
    title: string;
    body?: string;
    icon?: string;
    channelId?: string;
    url?: string;
  }): Promise<boolean>;
  /** The shell always resolves "granted" — real delivery is gated by the OS. */
  requestPermission(): Promise<string>;
}

export interface QuikchatElectronApi {
  isElectron: true;
  platform: "win32" | "darwin" | "linux";
  unread: QuikchatElectronUnread;
  deepLinks: QuikchatElectronDeepLinks;
  /** Optional like everything else here: gate on it, never assume it exists. */
  notifications?: QuikchatElectronNotifications;

  // Present on the preload but not consumed this session — typed loosely as
  // optional so future work can reach for them without a shape change here.
  badge?: {
    set(count: number): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  window?: unknown;
  shell?: unknown;
  updater?: unknown;
  store?: unknown;
  log?: unknown;
  getAppVersion?(): Promise<string> | string;
}

declare global {
  interface Window {
    electron?: QuikchatElectronApi;
  }
}

export {};
