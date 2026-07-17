import { APP_ID } from "./constants";
import type { AppRegistryEntry } from "./types";

/**
 * QuikChat's entry in the platform module registry. At merge this is merged
 * into the monorepo's central registry so QuikChat appears alongside quikscale,
 * quiktrack, quikcrm. The `icon` is a placeholder key for now.
 */
export const quikchatModule: AppRegistryEntry = {
  id: APP_ID,
  label: "QuikChat",
  icon: "message-circle",
  modules: [
    { id: "channels", label: "Channels" },
    { id: "dms", label: "Direct Messages" },
    { id: "notifications", label: "Notifications" },
  ],
};

export const moduleRegistry: Record<string, AppRegistryEntry> = {
  [APP_ID]: quikchatModule,
};
