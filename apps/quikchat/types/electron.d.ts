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

export interface QuikchatElectronApi {
  isElectron: true;
  platform: "win32" | "darwin" | "linux";
  unread: QuikchatElectronUnread;
  deepLinks: QuikchatElectronDeepLinks;

  // Present on the preload but not consumed this session — typed loosely as
  // optional so future work can reach for them without a shape change here.
  badge?: {
    set(count: number): Promise<unknown>;
    clear(): Promise<unknown>;
  };
  notifications?: unknown;
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
