import express from 'express';
import { getTrack } from '../db/tracks.js';
import {
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylist,
  getPlaylistWithTracks,
  listPlaylists,
  removeTrackFromPlaylist,
  reorderPlaylist,
  updatePlaylist
} from '../db/playlists.js';

export const playlistsRouter = express.Router();

playlistsRouter.get('/', async (req, res) => {
  const playlists = await listPlaylists();
  const enriched = await Promise.all(
    playlists.map(async (playlist) => ({
      ...playlist,
      trackCount: playlist.trackIds.length
    }))
  );
  res.json(enriched);
});

playlistsRouter.post('/', async (req, res) => {
  try {
    const playlist = await createPlaylist(req.body);
    res.status(201).json(playlist);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

playlistsRouter.get('/:id', async (req, res) => {
  const playlist = await getPlaylist(req.params.id);
  if (!playlist) {
    return res.status(404).json({ error: 'Playlist not found' });
  }
  res.json(playlist);
});

playlistsRouter.put('/:id', async (req, res) => {
  try {
    const playlist = await updatePlaylist(req.params.id, req.body);
    res.json(playlist);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

playlistsRouter.delete('/:id', async (req, res) => {
  try {
    await deletePlaylist(req.params.id);
    res.json({ message: 'Playlist deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

playlistsRouter.get('/:id/tracks', async (req, res) => {
  try {
    const playlist = await getPlaylistWithTracks(req.params.id);
    res.json(playlist);
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
});

playlistsRouter.post('/:id/tracks', async (req, res) => {
  const { trackId } = req.body;
  if (!trackId) {
    return res.status(400).json({ error: 'trackId is required' });
  }
  const track = await getTrack(trackId);
  if (!track) {
    return res.status(404).json({ error: 'Track not found' });
  }
  try {
    const playlist = await addTrackToPlaylist(req.params.id, trackId);
    res.json(playlist);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

playlistsRouter.delete('/:id/tracks/:trackId', async (req, res) => {
  try {
    const playlist = await removeTrackFromPlaylist(req.params.id, req.params.trackId);
    res.json(playlist);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

playlistsRouter.post('/:id/reorder', async (req, res) => {
  const { trackIds } = req.body || {};
  if (!Array.isArray(trackIds)) {
    return res.status(400).json({ error: 'trackIds array is required' });
  }
  try {
    const playlist = await reorderPlaylist(req.params.id, trackIds);
    res.json(playlist);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
