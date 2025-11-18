import axios from 'axios';
import { appConfig } from '../config.js';

const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_API_URL = 'https://api.spotify.com/v1';

let tokenCache = { token: null, expiresAt: 0 };

function assertSpotifyConfigured() {
  if (!appConfig.spotify.clientId || !appConfig.spotify.clientSecret) {
    throw new Error('Spotify API credentials are missing. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.');
  }
}

async function getAccessToken() {
  if (tokenCache.token && tokenCache.expiresAt > Date.now()) {
    return tokenCache.token;
  }
  assertSpotifyConfigured();
  const creds = Buffer.from(`${appConfig.spotify.clientId}:${appConfig.spotify.clientSecret}`).toString('base64');
  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');

  const { data } = await axios.post(SPOTIFY_AUTH_URL, params, {
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 30) * 1000
  };
  return tokenCache.token;
}

async function spotifyRequest(path, params = {}) {
  const token = await getAccessToken();
  const { data } = await axios.get(`${SPOTIFY_API_URL}${path}`, {
    params,
    headers: { Authorization: `Bearer ${token}` }
  });
  return data;
}

export async function searchArtists(query) {
  if (!query) return [];
  try {
    const data = await spotifyRequest('/search', {
      q: query,
      type: 'artist',
      limit: 10
    });
    return data.artists?.items || [];
  } catch (error) {
    throw normalizeSpotifyError(error);
  }
}

export async function fetchArtistTracks(artistId) {
  if (!artistId) {
    throw new Error('Artist id is required');
  }
  try {
    const albums = await fetchArtistAlbums(artistId);
    const tracks = [];
    for (const album of albums) {
      const albumTracks = await fetchAlbumTracks(album.id);
      albumTracks.forEach((track) => {
        tracks.push(formatTrack(track, album));
      });
    }
    return tracks;
  } catch (error) {
    throw normalizeSpotifyError(error);
  }
}

async function fetchArtistAlbums(artistId) {
  const limit = appConfig.spotify.maxAlbums;
  const albums = [];
  let url = `/artists/${artistId}/albums`;
  let page = 0;

  while (page < limit) {
    const data = await spotifyRequest(url, {
      limit: Math.min(20, limit - page),
      offset: page,
      include_groups: 'album,single,compilation'
    });
    if (!data.items?.length) break;
    for (const album of data.items) {
      if (albums.find((a) => a.id === album.id)) continue;
      albums.push(album);
      if (albums.length >= limit) break;
    }
    if (!data.next || albums.length >= limit) break;
    page += data.items.length;
  }
  return albums;
}

async function fetchAlbumTracks(albumId) {
  const tracks = [];
  let offset = 0;
  const limit = appConfig.spotify.maxTracksPerAlbum;
  while (true) {
    const data = await spotifyRequest(`/albums/${albumId}/tracks`, {
      limit: Math.min(50, limit - offset),
      offset
    });
    tracks.push(...data.items);
    offset += data.items.length;
    if (!data.next || offset >= limit) break;
  }
  return tracks;
}

function formatTrack(track, album) {
  return {
    id: track.id,
    spotifyId: track.id,
    name: track.name,
    artists: track.artists?.map((a) => a.name) || [],
    album: album.name,
    albumId: album.id,
    albumArt: album.images?.[0]?.url || null,
    releaseDate: album.release_date,
    durationMs: track.duration_ms,
    trackNumber: track.track_number,
    discNumber: track.disc_number,
    previewUrl: track.preview_url,
    explicit: track.explicit,
    addedFromSpotifyAt: new Date().toISOString()
  };
}

function normalizeSpotifyError(error) {
  if (error.response) {
    const message = error.response.data?.error?.message || 'Spotify API error';
    return new Error(`${message} (status ${error.response.status})`);
  }
  return new Error('Spotify request failed. Check network and credentials.');
}
