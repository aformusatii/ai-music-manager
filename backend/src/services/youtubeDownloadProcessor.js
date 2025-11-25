import path from 'node:path';
import { spawn } from 'node:child_process';
import { appConfig } from '../config.js';
import { getTrack, setDownloadStatus, upsertTrack, buildYoutubeTrackId } from '../db/tracks.js';
import { sanitizeFilename } from '../utils/file.js';

const YOUTUBE_BASE_URL = 'https://www.youtube.com/watch?v=';
const DEFAULT_SINGLE_ALBUM = 'YouTube Single';

export async function fetchYoutubeInfo(url, options = {}) {
  if (!url) {
    throw new Error('YouTube URL is required');
  }
  const args = ['--dump-single-json', '--skip-download', '--no-warnings'];
  if (options.noPlaylist) {
    args.push('--no-playlist');
  }
  if (options.flatPlaylist) {
    args.push('--flat-playlist');
  }
  args.push(url);
  return runYtDlpJson(args);
}

export function normalizeVideoMetadata(info, context = {}) {
  if (!info) {
    return {
      youtubeVideoId: null,
      youtubeUrl: context.youtubeUrl || null,
      title: 'Unknown Track from YouTube',
      channelName: 'Unknown Artist',
      albumName: context.playlistTitle || DEFAULT_SINGLE_ALBUM,
      durationMs: null,
      uploadDate: null,
      playlistTitle: context.playlistTitle || null,
      description: null,
      tags: [],
      channelId: null
    };
  }
  const videoId = info.id || info.video_id || context.videoId || null;
  const youtubeUrl = info.webpage_url || info.url || context.youtubeUrl || (videoId ? `${YOUTUBE_BASE_URL}${videoId}` : null);
  const playlistTitle = context.playlistTitle || info.playlist_title || info.playlist || null;
  return {
    youtubeVideoId: videoId,
    youtubeUrl,
    title: info.title || info.fulltitle || context.title || 'Unknown Track from YouTube',
    channelName: info.channel || info.uploader || context.channelName || 'Unknown Artist',
    albumName: playlistTitle || DEFAULT_SINGLE_ALBUM,
    durationMs: info.duration ? Math.round(info.duration * 1000) : (info.duration_ms ?? null),
    uploadDate: normalizeUploadDate(info.upload_date || info.release_date || context.uploadDate),
    playlistTitle,
    description: info.description || context.description || null,
    tags: Array.isArray(info.tags) ? info.tags : [],
    channelId: info.channel_id || info.uploader_id || null
  };
}

export function buildTrackPayloadFromMetadata(metadata, options = {}) {
  const artists = Array.isArray(options.artistsOverride)
    ? options.artistsOverride.filter(Boolean)
    : [metadata.channelName || 'Unknown Artist'].filter(Boolean);
  return {
    id: options.trackId || buildYoutubeTrackId(metadata.youtubeVideoId),
    name: metadata.title || options.fallbackTitle || 'Unknown Track from YouTube',
    artists,
    album: metadata.playlistTitle || options.playlistTitle || metadata.albumName || DEFAULT_SINGLE_ALBUM,
    durationMs: metadata.durationMs || null,
    releaseDate: metadata.uploadDate || null,
    youtubeVideoId: metadata.youtubeVideoId,
    youtubeUrl: metadata.youtubeUrl,
    youtubeChannel: metadata.channelName || null,
    youtubeChannelId: metadata.channelId || null,
    youtubeDescription: metadata.description || null,
    youtubeTags: metadata.tags || null,
    playlistName: metadata.playlistTitle || options.playlistTitle || null,
    source: options.source || 'youtube_direct',
    downloadStatus: options.downloadStatus || 'not_downloaded'
  };
}

export async function processYoutubeDownload({ trackId, youtubeVideoId, logger = () => {} }) {
  const track = await getTrack(trackId);
  if (!track) {
    throw new Error('Track not found');
  }
  const videoId = youtubeVideoId || track.youtubeVideoId;
  if (!videoId) {
    throw new Error('Missing YouTube video id for download');
  }
  const youtubeUrl = track.youtubeUrl || `${YOUTUBE_BASE_URL}${videoId}`;
  let metadata = null;
  try {
    const rawInfo = await fetchYoutubeInfo(youtubeUrl, { noPlaylist: true });
    metadata = normalizeVideoMetadata(rawInfo);
  } catch (error) {
    logger(`[metadata] Failed to fetch metadata: ${error.message}`);
  }

  const shouldOverwriteCoreFields = (track.source || 'spotify') === 'youtube_direct';
  const patch = {
    id: track.id,
    youtubeVideoId: videoId,
    youtubeUrl,
    youtubeChannel: metadata?.channelName || track.youtubeChannel || null,
    youtubeChannelId: metadata?.channelId || track.youtubeChannelId || null,
    youtubeDescription: metadata?.description || track.youtubeDescription || null,
    youtubeTags: metadata?.tags?.length ? metadata.tags : track.youtubeTags || null,
    playlistName: metadata?.playlistTitle || track.playlistName || null
  };

  if (metadata && shouldOverwriteCoreFields) {
    patch.name = metadata.title || track.name || 'Unknown Track from YouTube';
    patch.artists = metadata.channelName ? [metadata.channelName] : track.artists || ['Unknown Artist'];
    patch.album = metadata.playlistTitle || track.album || DEFAULT_SINGLE_ALBUM;
    patch.durationMs = metadata.durationMs || track.durationMs || null;
    patch.releaseDate = metadata.uploadDate || track.releaseDate || null;
  }

  await upsertTrack(patch);

  const safeName = sanitizeFilename(`${(track.artists?.[0] || patch.artists?.[0] || 'unknown')}_${track.name || patch.name || track.id}`);
  const filename = `${safeName}_${track.id}.${appConfig.download.audioFormat}`;
  const outputPath = path.join(appConfig.downloadsDir, filename);
  const args = [
    youtubeUrl,
    '-x',
    '--audio-format',
    appConfig.download.audioFormat,
    '-o',
    outputPath
  ];

  await setDownloadStatus(trackId, 'download_in_progress');
  try {
    await runYtDlp(args, (line) => logger(`[yt-dlp] ${line}`));
    const relativePath = path.join('downloads', path.basename(outputPath));
    await setDownloadStatus(trackId, 'downloaded', { filePath: relativePath });
    return { filePath: relativePath, videoId };
  } catch (error) {
    await setDownloadStatus(trackId, 'download_failed', { error: error.message });
    throw error;
  }
}

function normalizeUploadDate(value) {
  if (!value || typeof value !== 'string' || value.length !== 8) return null;
  const year = value.slice(0, 4);
  const month = value.slice(4, 6);
  const day = value.slice(6, 8);
  return `${year}-${month}-${day}`;
}

function runYtDlpJson(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(appConfig.download.ytDlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      reject(new Error(`yt-dlp failed to start: ${error.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        try {
          const parsed = JSON.parse(stdout || '{}');
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Unable to parse yt-dlp output: ${error.message}`));
        }
      } else {
        reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
      }
    });
  });
}

function runYtDlp(args, onLog) {
  return new Promise((resolve, reject) => {
    const child = spawn(appConfig.download.ytDlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (data) => {
      const text = data.trimEnd();
      if (text) onLog?.(text);
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (data) => {
      const text = data.trimEnd();
      if (text) onLog?.(text);
    });
    child.on('error', (error) => {
      reject(new Error(`yt-dlp failed to start: ${error.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`yt-dlp exited with code ${code}`));
      }
    });
  });
}
