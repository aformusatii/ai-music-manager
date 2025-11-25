import express from 'express';
import { appConfig } from '../config.js';
import { downloadManager } from '../services/downloadManager.js';
import {
  fetchYoutubeInfo,
  normalizeVideoMetadata,
  buildTrackPayloadFromMetadata
} from '../services/youtubeDownloadProcessor.js';
import { findTrackByYoutubeVideoId, setDownloadStatus, upsertTrack } from '../db/tracks.js';

export const youtubeRouter = express.Router();

youtubeRouter.post('/direct-download', async (req, res) => {
  const { url } = req.body || {};
  if (!isYoutubeUrl(url)) {
    return res.status(400).json({ error: 'A valid YouTube video or playlist URL is required.' });
  }
  try {
    const info = await fetchYoutubeInfo(url, { flatPlaylist: true });
    if (isPlaylistPayload(info)) {
      const result = await handlePlaylist(info);
      return res.json({
        message: 'Playlist download scheduled.',
        type: 'playlist',
        ...result
      });
    }
    const result = await handleVideo(info);
    return res.json({
      message: 'Video download scheduled.',
      type: 'video',
      ...result
    });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Unable to inspect YouTube URL.' });
  }
});

function isYoutubeUrl(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    const parsed = new URL(value);
    return /youtu\.?be/.test(parsed.hostname);
  } catch {
    return false;
  }
}

function isPlaylistPayload(info) {
  return info?._type === 'playlist' && Array.isArray(info.entries);
}

async function handleVideo(rawInfo) {
  const metadata = normalizeVideoMetadata(rawInfo, { youtubeUrl: rawInfo?.webpage_url });
  if (!metadata.youtubeVideoId) {
    throw new Error('Unable to determine the YouTube video id for the provided URL.');
  }
  const job = await ensureTrackAndEnqueue(metadata);
  return {
    video: {
      id: metadata.youtubeVideoId,
      title: metadata.title,
      channel: metadata.channelName,
      durationMs: metadata.durationMs
    },
    jobs: [job]
  };
}

async function handlePlaylist(info) {
  const playlistTitle = info.title || 'YouTube Playlist';
  const entries = Array.isArray(info.entries) ? info.entries : [];
  const maxItems = Math.max(1, Number(appConfig.youtube.directDownloadMaxItems) || 50);
  const limitedEntries = entries.slice(0, maxItems);
  const jobs = [];
  const failures = [];

  for (const entry of limitedEntries) {
    try {
      const metadata = normalizeVideoMetadata(entry, {
        playlistTitle,
        youtubeUrl: entry.url,
        videoId: entry.id,
        title: entry.title,
        channelName: entry.channel
      });
      if (!metadata.youtubeVideoId) {
        throw new Error('Entry did not include a video id.');
      }
      const job = await ensureTrackAndEnqueue(metadata, { playlistTitle });
      jobs.push(job);
    } catch (error) {
      failures.push({
        videoId: entry?.id || null,
        title: entry?.title || null,
        error: error.message || 'Failed to schedule entry'
      });
    }
  }

  return {
    playlist: {
      id: info.id,
      title: playlistTitle,
      totalEntries: entries.length,
      processedEntries: limitedEntries.length,
      skippedEntries: Math.max(0, entries.length - limitedEntries.length)
    },
    jobs,
    failures
  };
}

async function ensureTrackAndEnqueue(metadata, options = {}) {
  const existing = await findTrackByYoutubeVideoId(metadata.youtubeVideoId);
  const payload = buildTrackPayloadFromMetadata(metadata, {
    trackId: existing?.id,
    playlistTitle: options.playlistTitle,
    source: 'youtube_direct'
  });
  const { track } = await upsertTrack({
    ...existing,
    ...payload,
    id: existing?.id || payload.id,
    source: 'youtube_direct'
  });
  await setDownloadStatus(track.id, 'download_pending');
  const jobId = downloadManager.enqueue({
    trackId: track.id,
    videoId: metadata.youtubeVideoId,
    trackName: track.name,
    artists: track.artists
  });
  return {
    jobId,
    trackId: track.id,
    videoId: metadata.youtubeVideoId,
    reusedExisting: Boolean(existing)
  };
}
