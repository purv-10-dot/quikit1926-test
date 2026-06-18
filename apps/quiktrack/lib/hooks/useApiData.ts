"use client";

/**
 * Thin React Query wrapper over the app's `{ success, data }` API envelope.
 *
 * Why this exists: most of the issue / work-item view fetched data with raw
 * `fetch()` inside `useEffect`. That has two costs — (1) identical requests
 * fired from sibling components don't share a result (e.g. project members
 * loaded twice), and (2) React 18 StrictMode double-invokes effects in dev so
 * every such fetch ran twice. Routing reads through React Query fixes both:
 * concurrent same-key requests collapse into one in-flight call, and results
 * are cached for `staleTime`, so re-opening a panel is instant.
 *
 * Use this for GET reads. Mutations stay as plain `fetch` + `invalidateQueries`.
 */
import { useQuery } from "@tanstack/react-query";

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface UseApiDataOptions<T> {
  /** Cache lifetime before a background refetch. Defaults to 60s. */
  staleTime?: number;
  /** Map the raw `data` payload into the shape the caller wants (e.g. unwrap
   *  `{ members: [...] }` into the array). Runs only on success. */
  select?: (data: unknown) => T;
}

/**
 * Fetch a `{ success, data }` endpoint and return the unwrapped `data`.
 * Pass `url = null` to keep the query disabled until inputs are ready.
 */
export function useApiData<T>(
  queryKey: readonly unknown[],
  url: string | null,
  options: UseApiDataOptions<T> = {},
) {
  return useQuery<T>({
    queryKey,
    enabled: url !== null,
    staleTime: options.staleTime ?? 60_000,
    queryFn: async () => {
      const res = await fetch(url as string);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as ApiEnvelope<unknown>;
      if (!json.success) throw new Error(json.error ?? "Request failed");
      return options.select ? options.select(json.data) : (json.data as T);
    },
  });
}
