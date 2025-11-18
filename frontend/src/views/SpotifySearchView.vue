<script setup>
import { ref, computed } from 'vue'
import { AlertCircle } from 'lucide-vue-next'
import ColumnToggleMenu from '../components/ColumnToggleMenu.vue'
import { fetchArtistTracks, fetchSpotifyArtists, importTracks } from '../api/client.js'

const query = ref('')
const artists = ref([])
const tracks = ref([])
const artistError = ref('')
const trackError = ref('')
const isSearching = ref(false)
const isLoadingTracks = ref(false)
const selectedArtist = ref(null)
const selectedTrackIds = ref(new Set())
const importMessage = ref('')

const columns = [
  { key: 'name', label: 'Track', locked: true },
  { key: 'artists', label: 'Artists' },
  { key: 'album', label: 'Album' },
  { key: 'duration', label: 'Duration' },
  { key: 'releaseDate', label: 'Release Date' },
  { key: 'spotifyId', label: 'Spotify ID' }
]

const visibleColumns = ref(columns.filter((col) => ['name', 'artists', 'album', 'duration'].includes(col.key)).map((c) => c.key))

const visibleTracks = computed(() => tracks.value)

function formatDuration(ms) {
  if (!ms) return '—'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

async function searchSpotify() {
  if (!query.value.trim()) {
    artistError.value = 'Please enter an artist name.'
    return
  }
  artistError.value = ''
  selectedArtist.value = null
  tracks.value = []
  selectedTrackIds.value = new Set()
  isSearching.value = true
  importMessage.value = ''
  try {
    artists.value = await fetchSpotifyArtists(query.value.trim())
    if (!artists.value.length) {
      artistError.value = 'No artists found. Try another search.'
    }
  } catch (error) {
    artistError.value = error.response?.data?.error || 'Spotify search failed. Check credentials or network.'
  } finally {
    isSearching.value = false
  }
}

async function loadTracks(artist) {
  selectedArtist.value = artist
  tracks.value = []
  selectedTrackIds.value = new Set()
  trackError.value = ''
  importMessage.value = ''
  isLoadingTracks.value = true
  try {
    tracks.value = await fetchArtistTracks(artist.id)
  } catch (error) {
    trackError.value = error.response?.data?.error || 'Failed to load tracks for artist.'
  } finally {
    isLoadingTracks.value = false
  }
}

function toggleSelection(trackId) {
  const next = new Set(selectedTrackIds.value)
  if (next.has(trackId)) {
    next.delete(trackId)
  } else {
    next.add(trackId)
  }
  selectedTrackIds.value = next
}

function toggleSelectAll() {
  if (selectedTrackIds.value.size === tracks.value.length) {
    selectedTrackIds.value = new Set()
  } else {
    selectedTrackIds.value = new Set(tracks.value.map((track) => track.id))
  }
}

const allVisibleSelected = computed(() => tracks.value.length > 0 && selectedTrackIds.value.size === tracks.value.length)

async function importSelected() {
  if (!selectedTrackIds.value.size) return
  importMessage.value = ''
  try {
    const payload = tracks.value.filter((track) => selectedTrackIds.value.has(track.id))
    const { data } = await importTracks(payload)
    importMessage.value = `${data.summary.added} tracks added, ${data.summary.updated} updated.`
  } catch (error) {
    importMessage.value = error.response?.data?.error || 'Import failed.'
  }
}
</script>

<template>
  <section>
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 fw-semibold mb-1">Spotify Search</h1>
        <p class="text-muted mb-0">Find artists, preview their albums, and import tracks into your library.</p>
      </div>
    </div>

    <form class="card p-3 shadow-sm mb-4" @submit.prevent="searchSpotify">
      <div class="row g-3 align-items-end">
        <div class="col-md-8">
          <label for="artistQuery" class="form-label">Artist name</label>
          <input id="artistQuery" v-model="query" class="form-control" placeholder="e.g. Daft Punk" />
        </div>
        <div class="col-md-4 d-flex gap-2">
          <button type="submit" class="btn btn-primary w-100" :disabled="isSearching">
            {{ isSearching ? 'Searching…' : 'Search Spotify' }}
          </button>
        </div>
      </div>
      <p v-if="artistError" class="text-danger mt-2">{{ artistError }}</p>
    </form>

    <div v-if="artists.length" class="mb-4">
      <h2 class="h5 fw-semibold mb-3">Artists</h2>
      <div class="row g-3">
        <div class="col-md-4" v-for="artist in artists" :key="artist.id">
          <div class="card h-100 shadow-sm">
            <div class="card-body">
              <h3 class="h6 fw-semibold">{{ artist.name }}</h3>
              <p class="text-muted small mb-3">Followers: {{ artist.followers?.total?.toLocaleString() || '—' }}</p>
              <button class="btn btn-outline-primary btn-sm" @click="loadTracks(artist)">
                View albums & tracks
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-if="selectedArtist" class="card shadow-sm p-3">
      <div class="d-flex flex-wrap justify-content-between mb-3">
        <div>
          <h2 class="h5 fw-semibold mb-1">Tracks by {{ selectedArtist.name }}</h2>
          <p class="text-muted small mb-0">
            Showing {{ tracks.length }} tracks (server may limit very large catalogs).
          </p>
        </div>
        <div class="d-flex gap-2">
          <ColumnToggleMenu v-model="visibleColumns" :columns="columns" />
          <button class="btn btn-outline-secondary" @click="toggleSelectAll" :disabled="!tracks.length">
            {{ allVisibleSelected ? 'Clear selection' : 'Select all shown' }}
          </button>
          <button class="btn btn-success" :disabled="!selectedTrackIds.size" @click="importSelected">
            Add selected to local library
          </button>
        </div>
      </div>

      <div v-if="trackError" class="alert alert-danger d-flex align-items-center" role="alert">
        <AlertCircle class="me-2" size="18" />
        <span>{{ trackError }}</span>
      </div>

      <div class="table-responsive" v-if="tracks.length">
        <table class="table table-hover align-middle">
          <thead>
            <tr>
              <th scope="col" style="width: 40px">
                <input type="checkbox" class="form-check-input" :checked="allVisibleSelected" @change="toggleSelectAll" />
              </th>
              <th v-for="column in columns" :key="column.key" v-show="visibleColumns.includes(column.key)">
                {{ column.label }}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="track in visibleTracks" :key="track.id">
              <td>
                <input
                  type="checkbox"
                  class="form-check-input"
                  :checked="selectedTrackIds.has(track.id)"
                  @change="toggleSelection(track.id)"
                />
              </td>
              <td v-if="visibleColumns.includes('name')">
                <div class="fw-semibold">{{ track.name }}</div>
              </td>
              <td v-if="visibleColumns.includes('artists')">{{ track.artists?.join(', ') }}</td>
              <td v-if="visibleColumns.includes('album')">
                <div class="small">{{ track.album }}</div>
                <div class="text-muted small">Disc {{ track.discNumber }} · Track {{ track.trackNumber }}</div>
              </td>
              <td v-if="visibleColumns.includes('duration')">{{ formatDuration(track.durationMs) }}</td>
              <td v-if="visibleColumns.includes('releaseDate')">{{ track.releaseDate || '—' }}</td>
              <td v-if="visibleColumns.includes('spotifyId')">
                <span class="small text-muted">{{ track.spotifyId }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="text-muted" v-if="!isLoadingTracks">No tracks available for this artist in the selected range.</p>
      <p v-if="isLoadingTracks" class="text-muted">Loading tracks…</p>
      <p v-if="importMessage" class="text-success fw-semibold mt-3">{{ importMessage }}</p>
    </div>
  </section>
</template>
