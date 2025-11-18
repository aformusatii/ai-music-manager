import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { appConfig } from '../config.js';
import { bulkUpsertTracks, getTrack, listTracks, removeTrack, setDownloadStatus, upsertTrack } from '../db/tracks.js';
import { downloadManager } from '../services/downloadManager.js';
import { buildTrackQuery, searchYoutubeVideos } from '../services/youtube.js';

export const tracksRouter = express.Router();

tracksRouter.get('/', async (req, res) => {
  const {
    page = 1,
    pageSize = 25,
    sortBy = 'name',
    sortDir = 'asc',
    name,
    artist,
    album,
    status
  } = req.query;
  try {
    const result = await listTracks({
      filters: { name, artist, album, status },
      sortBy,
      sortDir,
      page: Number(page),
      pageSize: Number(pageSize)
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

tracksRouter.get('/:id', async (req, res) => {
  const track = await getTrack(req.params.id);
  if (!track) {
    return res.status(404).json({ error: 'Track not found' });
  }
  res.json(track);
});

tracksRouter.post('/import', async (req, res) => {
  const { tracks } = req.body;
  if (!Array.isArray(tracks) || tracks.length === 0) {
    return res.status(400).json({ error: 'Tracks array is required' });
  }
  try {
    const normalized = tracks.map((track) => ({
      ...track,
      id: track.id || track.spotifyId,
      downloadStatus: track.downloadStatus || 'not_downloaded'
    }));
    const summary = await bulkUpsertTracks(normalized);
    res.json({ message: 'Import complete', summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

tracksRouter.patch('/:id', async (req, res) => {
  try {
    const { track } = await upsertTrack({ ...req.body, id: req.params.id });
    res.json(track);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

tracksRouter.delete('/:id', async (req, res) => {
  try {
    const track = await getTrack(req.params.id);
    if (!track) {
      return res.status(404).json({ error: 'Track not found' });
    }
    const shouldDeleteFile = req.query.deleteFile === 'true';
    if (shouldDeleteFile && track.filePath) {
      await deleteTrackFile(track.filePath);
    }
    await removeTrack(req.params.id);
    res.json({ message: 'Track removed', deletedFile: shouldDeleteFile && Boolean(track.filePath) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function deleteTrackFile(relativePath) {
  try {
    const filename = path.basename(relativePath);
    const fullPath = path.join(appConfig.downloadsDir, filename);
    await fs.unlink(fullPath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn('Failed to remove file', error.message);
    }
  }
}

tracksRouter.post('/:id/download', async (req, res) => {
  const { videoId, query } = req.body || {};
  try {
    const { videoId: resolvedVideoId, jobId } = await enqueueDownload(req.params.id, videoId, query);
    res.json({ message: 'Download started', videoId: resolvedVideoId, jobId });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

tracksRouter.post('/downloads/bulk', async (req, res) => {
  const { trackIds = [] } = req.body || {};
  if (!Array.isArray(trackIds) || trackIds.length === 0) {
    return res.status(400).json({ error: 'trackIds array is required' });
  }
  const results = [];
  for (const id of trackIds) {
    try {
      const { videoId, jobId } = await enqueueDownload(id);
      results.push({ id, status: 'ok', videoId, jobId });
    } catch (error) {
      results.push({ id, status: 'error', error: error.message });
    }
  }
  res.json({ results });
});

async function enqueueDownload(trackId, providedVideoId, providedQuery) {
  const track = await getTrack(trackId);
  if (!track) {
    throw new Error('Track not found');
  }
  let videoId = providedVideoId;
  if (!videoId) {
    const query = providedQuery || buildTrackQuery(track);
    const results = await searchYoutubeVideos(query);
    videoId = results[0]?.videoId;
    if (!videoId) {
      await setDownloadStatus(track.id, 'download_failed', { error: 'No YouTube results' });
      throw new Error('No YouTube results found');
    }
  }
  await setDownloadStatus(track.id, 'download_pending');
  const jobId = downloadManager.enqueue({
    trackId: track.id,
    videoId,
    trackName: track.name,
    artists: track.artists
  });
  return { videoId, jobId };
}
