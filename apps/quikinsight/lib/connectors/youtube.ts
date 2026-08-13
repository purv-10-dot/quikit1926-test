import { google } from "googleapis";
import type {
  YouTubeVideo,
  YouTubeAnalytics,
  YouTubeChannelStats,
  YouTubeData,
} from "@/lib/types";

function getOAuthClient() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
  );
  oauth2Client.setCredentials({
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
  });
  return oauth2Client;
}

export async function getYouTubeChannelStats(): Promise<YouTubeChannelStats> {
  const youtube = google.youtube({ version: "v3", auth: getOAuthClient() });

  const response = await youtube.channels.list({
    part: ["statistics", "snippet"],
    id: [process.env.YOUTUBE_CHANNEL_ID!],
  });

  const stats = response.data.items?.[0]?.statistics;
  return {
    subscribers: Number(stats?.subscriberCount ?? 0),
    totalViews:  Number(stats?.viewCount ?? 0),
    videoCount:  Number(stats?.videoCount ?? 0),
  };
}

export async function getYouTubeAnalytics(): Promise<YouTubeAnalytics> {
  const youtubeAnalytics = google.youtubeAnalytics({
    version: "v2",
    auth: getOAuthClient(),
  });

  const endDate   = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  const prevEndDate   = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];
  const prevStartDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  const [current, previous] = await Promise.all([
    youtubeAnalytics.reports.query({
      ids:      "channel==MINE",
      startDate,
      endDate,
      metrics:  "views,estimatedMinutesWatched,averageViewDuration,subscribersGained,likes,comments",
    }),
    youtubeAnalytics.reports.query({
      ids:      "channel==MINE",
      startDate: prevStartDate,
      endDate:   prevEndDate,
      metrics:   "views,estimatedMinutesWatched,subscribersGained",
    }),
  ]);

  const curRow  = (current.data.rows  as number[][] | null | undefined)?.[0] ?? [];
  const prevRow = (previous.data.rows as number[][] | null | undefined)?.[0] ?? [];

  const [views = 0, watchMins = 0, avgDuration = 0, subsGained = 0, likes = 0, comments = 0] = curRow;
  const [prevViews = 0] = prevRow;

  const viewsDelta = prevViews > 0
    ? Math.round(((Number(views) - Number(prevViews)) / Number(prevViews)) * 100)
    : 0;

  return {
    views:                   Number(views),
    watchMinutes:            Number(watchMins),
    avgViewDurationSeconds:  Number(avgDuration),
    subscribersGained:       Number(subsGained),
    likes:                   Number(likes),
    comments:                Number(comments),
    viewsDeltaPercent:       viewsDelta,
  };
}

export async function getTopYouTubeVideos(): Promise<YouTubeVideo[]> {
  const youtube = google.youtube({ version: "v3", auth: getOAuthClient() });
  const youtubeAnalytics = google.youtubeAnalytics({
    version: "v2",
    auth: getOAuthClient(),
  });

  const endDate   = new Date().toISOString().split("T")[0];
  const startDate = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000)
    .toISOString().split("T")[0];

  const analyticsResponse = await youtubeAnalytics.reports.query({
    ids:        "channel==MINE",
    startDate,
    endDate,
    metrics:    "views,estimatedMinutesWatched,averageViewDuration,likes",
    dimensions: "video",
    sort:       "-views",
    maxResults: 5,
  });

  const rows = (analyticsResponse.data.rows as (string | number)[][] | null | undefined) ?? [];
  const videoIds = rows.map((row) => row[0] as string).filter(Boolean);

  if (videoIds.length === 0) return [];

  const videoDetails = await youtube.videos.list({
    part: ["snippet", "statistics"],
    id:   videoIds,
  });

  return (videoDetails.data.items ?? []).map((video, i) => {
    const analyticsRow = rows[i] ?? [];
    return {
      id:           video.id ?? "",
      title:        video.snippet?.title ?? "",
      thumbnail:    video.snippet?.thumbnails?.medium?.url ?? "",
      publishedAt:  video.snippet?.publishedAt ?? "",
      views:        Number(analyticsRow[1] ?? video.statistics?.viewCount ?? 0),
      watchMinutes: Number(analyticsRow[2] ?? 0),
      likes:        Number(video.statistics?.likeCount ?? 0),
      comments:     Number(video.statistics?.commentCount ?? 0),
    };
  });
}

export async function getAllYouTubeData(): Promise<Omit<YouTubeData, "source" | "reason">> {
  const [channelStats, analytics, topVideos] = await Promise.all([
    getYouTubeChannelStats(),
    getYouTubeAnalytics(),
    getTopYouTubeVideos(),
  ]);
  return { channelStats, analytics, topVideos, dailyTrend: [], trafficSources: [] };
}
