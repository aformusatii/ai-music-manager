import { tracksDb } from './index.js';

const DEFAULT_STATUS = 'not_downloaded';

export async function listTracks(options = {}) {
  const {
    filters = {},
    sortBy = 'name',
    sortDir = 'asc',
    page = 1,
    pageSize = 25
  } = options;

  const all = [];
  for await (const [, value] of tracksDb.iterator()) {
    all.push(value);
  }

  const filtered = all.filter((track) => matchFilters(track, filters));
  const sorted = filtered.sort((a, b) => compareBy(a, b, sortBy, sortDir));

  const total = sorted.length;
  const start = (page - 1) * pageSize;
  const pageItems = sorted.slice(start, start + pageSize);

  return { items: pageItems, total };
}

function matchFilters(track, filters) {
  const {
    name,
    artist,
    album,
    status
  } = filters;

  if (name && !track.name.toLowerCase().includes(name.toLowerCase())) {
    return false;
  }
  if (artist && !track.artists?.join(', ').toLowerCase().includes(artist.toLowerCase())) {
    return false;
  }
  if (album && !(track.album || '').toLowerCase().includes(album.toLowerCase())) {
    return false;
  }
  if (status && track.downloadStatus !== status) {
    return false;
  }
  return true;
}

function compareBy(a, b, field, dir) {
  const direction = dir === 'desc' ? -1 : 1;
  const valueA = getComparable(a, field);
  const valueB = getComparable(b, field);

  if (valueA < valueB) return -1 * direction;
  if (valueA > valueB) return 1 * direction;
  return 0;
}

function getComparable(track, field) {
  switch (field) {
    case 'artist':
    case 'artists':
      return track.artists?.join(', ')?.toLowerCase() || '';
    case 'album':
      return (track.album || '').toLowerCase();
    case 'duration':
      return track.durationMs || 0;
    case 'status':
    case 'downloadStatus':
      return track.downloadStatus || DEFAULT_STATUS;
    default:
      return (track.name || '').toLowerCase();
  }
}

export async function getTrack(id) {
  try {
    return await tracksDb.get(id);
  } catch (error) {
    if (error.notFound) return null;
    throw error;
  }
}

export async function removeTrack(id) {
  await tracksDb.del(id);
}

export async function upsertTrack(track) {
  const id = track.id || track.spotifyId;
  if (!id) {
    throw new Error('Track must include an id or spotifyId');
  }
  const existing = await getTrack(id);
  const payload = {
    ...existing,
    ...track,
    id,
    downloadStatus: track.downloadStatus || existing?.downloadStatus || DEFAULT_STATUS,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await tracksDb.put(id, payload);
  return { track: payload, existed: Boolean(existing) };
}

export async function bulkUpsertTracks(tracks) {
  const results = {
    added: 0,
    updated: 0
  };
  for (const track of tracks) {
    const { existed } = await upsertTrack(track);
    if (existed) {
      results.updated += 1;
    } else {
      results.added += 1;
    }
  }
  return results;
}

export async function setDownloadStatus(id, status, extra = {}) {
  const track = await getTrack(id);
  if (!track) throw new Error('Track not found');
  const updated = {
    ...track,
    downloadStatus: status,
    lastDownloadError: extra.error || null,
    filePath: extra.filePath ?? track.filePath ?? null,
    updatedAt: new Date().toISOString()
  };
  await tracksDb.put(id, updated);
  return updated;
}
