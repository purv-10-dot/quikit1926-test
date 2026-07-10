import type { CreateMeetingInput, CreateMeetingResult, MeetingProvider } from "./types";

/**
 * Google Meet provider — placeholder for a later phase.
 *
 * When implemented this will create a Google Calendar event with
 * `conferenceData.createRequest` (Calendar API `events.insert`) and return the
 * Meet `hangoutLink`. The interface matches Teams exactly, so wiring it up is a
 * drop-in: implement the two methods below and register it in `index.ts`.
 *
 * Expected env (not yet required): GOOGLE_MEET_CLIENT_EMAIL,
 * GOOGLE_MEET_PRIVATE_KEY, GOOGLE_MEET_ORGANIZER_EMAIL (domain-wide delegation).
 */
export const googleMeetProvider: MeetingProvider = {
  id: "google-meet",

  isConfigured() {
    return false;
  },

  async createMeeting(_input: CreateMeetingInput): Promise<CreateMeetingResult> {
    throw new Error("Google Meet provider is not implemented yet");
  },
};
