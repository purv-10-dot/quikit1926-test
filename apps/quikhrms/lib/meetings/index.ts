import { env } from "./env";
import { teamsProvider } from "./teams";
import { googleMeetProvider } from "./google-meet";
import type {
  CreateMeetingInput,
  CreateMeetingResult,
  MeetingProvider,
  MeetingProviderId,
} from "./types";

export type {
  CreateMeetingInput,
  CreateMeetingResult,
  MeetingProvider,
  MeetingProviderId,
} from "./types";

const PROVIDERS: Record<MeetingProviderId, MeetingProvider> = {
  teams: teamsProvider,
  "google-meet": googleMeetProvider,
};

/** Resolve the active provider: explicit arg → MEETING_PROVIDER env → "teams". */
export function getMeetingProvider(id?: MeetingProviderId): MeetingProvider {
  const chosen = id ?? (env("MEETING_PROVIDER") as MeetingProviderId | undefined) ?? "teams";
  return PROVIDERS[chosen] ?? teamsProvider;
}

/**
 * Generate a meeting link without ever throwing — returns null when the
 * provider is unconfigured or the call fails, so interview scheduling always
 * proceeds (the recruiter can still paste a link manually). Failures are
 * logged for diagnosis.
 */
export async function generateMeetingLink(
  input: CreateMeetingInput,
  id?: MeetingProviderId,
): Promise<CreateMeetingResult | null> {
  const provider = getMeetingProvider(id);
  if (!provider.isConfigured()) {
    console.warn(`[meetings] provider "${provider.id}" not configured — skipping link generation`);
    return null;
  }
  try {
    return await provider.createMeeting(input);
  } catch (e) {
    console.error(`[meetings] ${provider.id} createMeeting failed:`, e);
    return null;
  }
}
