/**
 * Google Meet provider — Google Calendar API with a service account. Port of
 * `GoogleMeetProvider` (`src/meetings/providers/google-meet.provider.ts`).
 *
 * A Meet link is not created directly: you insert a Calendar event with a
 * `conferenceData.createRequest`, and Google mints the Meet room for it. That
 * is why this needs Calendar scope and a real calendar to write to.
 *
 * Env:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL
 *   GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY   (literal \n sequences are unescaped)
 *   GOOGLE_CALENDAR_ID                   (default: "primary")
 *
 * All three are already in `.env.example`. `resolveGoogleMeetProvider` returns
 * null when unset so the caller raises the legacy's "Google Meet is not
 * configured" 400 rather than crashing.
 */
import { google } from 'googleapis';
import { randomUUID } from 'crypto';
import type { CreateMeetingOptions, ProviderMeeting } from './zoom-provider';

export class GoogleMeetProvider {
  private calendarId: string;
  private auth: InstanceType<typeof google.auth.JWT>;

  constructor(serviceAccountEmail: string, privateKey: string, calendarId?: string) {
    this.calendarId = calendarId || 'primary';
    this.auth = new google.auth.JWT({
      email: serviceAccountEmail,
      // Env vars carry "\n" as two literal characters; the JWT signer needs real
      // newlines or it rejects the key.
      key: privateKey.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/calendar'],
    });
  }

  async createMeeting(options: CreateMeetingOptions): Promise<ProviderMeeting> {
    const calendar = google.calendar({ version: 'v3', auth: this.auth });
    const endTime = new Date(options.startTime.getTime() + options.duration * 60000);

    const event = await calendar.events.insert({
      calendarId: this.calendarId,
      // Required — without it Google ignores conferenceData and returns an event
      // with no Meet link.
      conferenceDataVersion: 1,
      requestBody: {
        summary: options.topic,
        start: { dateTime: options.startTime.toISOString(), timeZone: 'UTC' },
        end: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
        conferenceData: {
          createRequest: {
            requestId: randomUUID(),
            conferenceSolutionKey: { type: 'hangoutsMeet' },
          },
        },
      },
    });

    const meetLink =
      event.data.conferenceData?.entryPoints?.find((ep) => ep.entryPointType === 'video')?.uri ||
      event.data.hangoutLink ||
      '';

    if (!meetLink) {
      // The legacy returned an event with an empty joinUrl here, producing a
      // meeting row nobody could join. Fail loudly instead.
      throw new Error('Google Meet link was not created for the calendar event');
    }

    return {
      externalMeetingId: event.data.id || randomUUID(),
      joinUrl: meetLink,
      hostUrl: meetLink,
      password: undefined,
    };
  }

  /** Best-effort — the legacy logged and swallowed failures here. */
  async endMeeting(externalMeetingId: string): Promise<void> {
    try {
      const calendar = google.calendar({ version: 'v3', auth: this.auth });
      await calendar.events.delete({ calendarId: this.calendarId, eventId: externalMeetingId });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[google-meet] failed to delete event ${externalMeetingId}:`, err);
    }
  }
}

/** Null when the service account is not configured — caller raises a 400. */
export function resolveGoogleMeetProvider(): GoogleMeetProvider | null {
  const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_CALENDAR_ID } = process.env;
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) return null;
  return new GoogleMeetProvider(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, GOOGLE_CALENDAR_ID);
}
