import { nanoid } from 'nanoid';
import { playlistsDb } from './index.js';
import { getTrack } from './tracks.js';

export async function listPlaylists() {
  const playlists = [];
  for await (const [, value] of playlistsDb.iterator()) {
    playlists.push(value);
  }
  return playlists.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export async function getPlaylist(id) {
  try {
    return await playlistsDb.get(id);
  } catch (error) {
    if (error.notFound) return null;
    throw error;
  }
}

export async function createPlaylist({ name, description = '' }) {
  if (!name) throw new Error('Playlist name is required');
  await assertNameUnique(name);
  const now = new Date().toISOString();
  const playlist = {
    id: nanoid(12),
    name,
    description,
    trackIds: [],
    createdAt: now,
    updatedAt: now
  };
  await playlistsDb.put(playlist.id, playlist);
  return playlist;
}

async function assertNameUnique(name, excludeId) {
  for await (const [, value] of playlistsDb.iterator()) {
    if (value.name.toLowerCase() === name.toLowerCase() && value.id !== excludeId) {
      throw new Error('Playlist name must be unique');
    }
  }
}

export async function updatePlaylist(id, changes) {
  const playlist = await getPlaylist(id);
  if (!playlist) throw new Error('Playlist not found');
  if (changes.name && changes.name !== playlist.name) {
    await assertNameUnique(changes.name, id);
  }
  const updated = {
    ...playlist,
    ...changes,
    updatedAt: new Date().toISOString()
  };
  await playlistsDb.put(id, updated);
  return updated;
}

export async function deletePlaylist(id) {
  await playlistsDb.del(id);
}

export async function addTrackToPlaylist(playlistId, trackId) {
  const playlist = await getPlaylist(playlistId);
  if (!playlist) throw new Error('Playlist not found');
  if (playlist.trackIds.includes(trackId)) {
    return playlist;
  }
  const updated = {
    ...playlist,
    trackIds: [...playlist.trackIds, trackId],
    updatedAt: new Date().toISOString()
  };
  await playlistsDb.put(playlistId, updated);
  return updated;
}

export async function removeTrackFromPlaylist(playlistId, trackId) {
  const playlist = await getPlaylist(playlistId);
  if (!playlist) throw new Error('Playlist not found');
  const updated = {
    ...playlist,
    trackIds: playlist.trackIds.filter((id) => id !== trackId),
    updatedAt: new Date().toISOString()
  };
  await playlistsDb.put(playlistId, updated);
  return updated;
}

export async function reorderPlaylist(playlistId, orderedTrackIds) {
  const playlist = await getPlaylist(playlistId);
  if (!playlist) throw new Error('Playlist not found');
  const normalized = orderedTrackIds.filter((id) => playlist.trackIds.includes(id));
  const remainder = playlist.trackIds.filter((id) => !normalized.includes(id));
  const updated = {
    ...playlist,
    trackIds: [...normalized, ...remainder],
    updatedAt: new Date().toISOString()
  };
  await playlistsDb.put(playlistId, updated);
  return updated;
}

export async function getPlaylistWithTracks(id) {
  const playlist = await getPlaylist(id);
  if (!playlist) throw new Error('Playlist not found');
  const tracks = [];
  for (const trackId of playlist.trackIds) {
    const track = await getTrack(trackId);
    if (track) tracks.push(track);
  }
  return { ...playlist, tracks };
}
