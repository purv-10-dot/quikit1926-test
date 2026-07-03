"use client";

import { useQuery } from "@tanstack/react-query";
import { disabledHrefs } from "@/lib/general-modules";

type GeneralSettings = { disabled_modules: string[]; week_start: string };

/** Reads which optional modules are enabled; exposes the nav hrefs to hide. */
export function useEnabledModules() {
  const { data } = useQuery<GeneralSettings>({
    queryKey: ["general-settings"],
    queryFn: async () => {
      const r = await fetch("/api/v1/settings/general");
      if (!r.ok) return { disabled_modules: [], week_start: "Sunday" };
      return (((await r.json()) as { data?: GeneralSettings }).data ?? { disabled_modules: [], week_start: "Sunday" });
    },
    staleTime: 60_000,
    initialData: { disabled_modules: [], week_start: "Sunday" }
  });
  const disabled = data?.disabled_modules ?? [];
  return { disabledModuleKeys: disabled, hiddenHrefs: disabledHrefs(disabled), weekStart: data?.week_start ?? "Sunday" };
}
