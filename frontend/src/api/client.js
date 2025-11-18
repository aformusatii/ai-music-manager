import axios from 'axios'

const baseURL = import.meta.env.VITE_API_BASE || '/api'

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' }
})

export async function fetchSpotifyArtists(query) {
  const { data } = await api.get('/spotify/search', { params: { query } })
  return data.artists
}

export async function fetchArtistTracks(artistId) {
  const { data } = await api.get(`/spotify/artist/${artistId}/tracks`)
  return data.tracks
}

export async function importTracks(tracks) {
  return api.post('/tracks/import', { tracks })
}

export async function fetchLocalTracks(params) {
  const { data } = await api.get('/tracks', { params })
  return data
}

export async function removeTrack(id, options = {}) {
  return api.delete(`/tracks/${id}`, { params: options })
}

export async function triggerDownload(id, payload = {}) {
  return api.post(`/tracks/${id}/download`, payload)
}

export async function bulkDownload(trackIds) {
  return api.post('/tracks/downloads/bulk', { trackIds })
}

export async function fetchDownloadJobs() {
  const { data } = await api.get('/downloads/jobs')
  return data
}

export async function fetchPlaylists() {
  const { data } = await api.get('/playlists')
  return data
}

export async function createPlaylist(payload) {
  const { data } = await api.post('/playlists', payload)
  return data
}

export async function updatePlaylist(id, payload) {
  const { data } = await api.put(`/playlists/${id}`, payload)
  return data
}

export async function deletePlaylist(id) {
  return api.delete(`/playlists/${id}`)
}

export async function fetchPlaylistWithTracks(id) {
  const { data } = await api.get(`/playlists/${id}/tracks`)
  return data
}

export async function addTrackToPlaylist(id, trackId) {
  const { data } = await api.post(`/playlists/${id}/tracks`, { trackId })
  return data
}

export async function removeTrackFromPlaylist(id, trackId) {
  const { data } = await api.delete(`/playlists/${id}/tracks/${trackId}`)
  return data
}

export async function reorderPlaylist(id, trackIds) {
  const { data } = await api.post(`/playlists/${id}/reorder`, { trackIds })
  return data
}
