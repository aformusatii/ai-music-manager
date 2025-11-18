<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { AlertTriangle, Download, Trash2, ListPlus, PlayCircle } from 'lucide-vue-next'
import ColumnToggleMenu from '../components/ColumnToggleMenu.vue'
import {
  addTrackToPlaylist,
  bulkDownload,
  fetchLocalTracks,
  fetchPlaylists,
  removeTrack,
  triggerDownload
} from '../api/client.js'
import { usePlayerStore } from '../stores/player.js'
import { useRouter } from 'vue-router'

const router = useRouter()
const playerStore = usePlayerStore()

const tracks = ref([])
const total = ref(0)
const loading = ref(false)
const feedback = ref('')
const playlists = ref([])
const selectedPlaylistId = ref('')
const selectedTrackIds = ref(new Set())

const filters = reactive({
  name: '',
  artist: '',
  album: '',
  status: ''
})

const state = reactive({
  page: 1,
  pageSize: 15,
  sortBy: 'name',
  sortDir: 'asc'
})

const columns = [
  { key: 'name', label: 'Track', locked: true },
  { key: 'artists', label: 'Artists' },
  { key: 'album', label: 'Album' },
  { key: 'duration', label: 'Duration' },
  { key: 'spotifyId', label: 'Spotify ID' },
  { key: 'downloadStatus', label: 'Status' },
  { key: 'filePath', label: 'File' }
]

const visibleColumns = ref(columns.filter((col) => col.key !== 'spotifyId').map((c) => c.key))

const statusBadges = {
  not_downloaded: 'secondary',
  download_pending: 'warning',
  download_in_progress: 'info',
  downloaded: 'success',
  download_failed: 'danger'
}

const pageCount = computed(() => Math.ceil(total.value / state.pageSize) || 1)

function formatDuration(ms) {
  if (!ms) return '—'
  const minutes = Math.floor(ms / 60000)
  const seconds = Math.round((ms % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

async function loadTracks() {
  loading.value = true
  feedback.value = ''
  try {
    const { items, total: count } = await fetchLocalTracks({
      page: state.page,
      pageSize: state.pageSize,
      sortBy: state.sortBy,
      sortDir: state.sortDir,
      ...filters
    })
    tracks.value = items
    total.value = count
    selectedTrackIds.value = new Set()
  } catch (error) {
    feedback.value = error.response?.data?.error || 'Failed to load local tracks.'
  } finally {
    loading.value = false
  }
}

async function loadPlaylists() {
  try {
    playlists.value = await fetchPlaylists()
    if (!selectedPlaylistId.value && playlists.value.length) {
      selectedPlaylistId.value = playlists.value[0].id
    }
  } catch (error) {
    console.warn('Failed to load playlists', error)
  }
}

function applyFilters() {
  state.page = 1
  loadTracks()
}

function changePage(delta) {
  const next = state.page + delta
  if (next >= 1 && next <= pageCount.value) {
    state.page = next
    loadTracks()
  }
}

function toggleSelection(id) {
  const next = new Set(selectedTrackIds.value)
  if (next.has(id)) {
    next.delete(id)
  } else {
    next.add(id)
  }
  selectedTrackIds.value = next
}

function toggleAll() {
  if (selectedTrackIds.value.size === tracks.value.length) {
    selectedTrackIds.value = new Set()
  } else {
    selectedTrackIds.value = new Set(tracks.value.map((track) => track.id))
  }
}

async function deleteTrack(id) {
  if (!confirm('Delete track from library? You can optionally remove the file as well.')) return
  const deleteFile = confirm('Delete the downloaded file too? Choose OK to delete file.')
  try {
    await removeTrack(id, { deleteFile })
    feedback.value = 'Track removed.'
    loadTracks()
  } catch (error) {
    feedback.value = error.response?.data?.error || 'Failed to delete track.'
  }
}

async function addToPlaylist(trackId) {
  if (!selectedPlaylistId.value) {
    feedback.value = 'Please choose a playlist first.'
    return
  }
  try {
    await addTrackToPlaylist(selectedPlaylistId.value, trackId)
    feedback.value = 'Track added to playlist.'
    loadPlaylists()
  } catch (error) {
    feedback.value = error.response?.data?.error || 'Failed to update playlist.'
  }
}

async function downloadTrack(trackId) {
  try {
    await triggerDownload(trackId)
    feedback.value = 'Download enqueued.'
    loadTracks()
  } catch (error) {
    feedback.value = error.response?.data?.error || 'Failed to start download.'
  }
}

async function downloadMissing() {
  const pendingIds = tracks.value.filter((track) => track.downloadStatus !== 'downloaded').map((track) => track.id)
  if (!pendingIds.length) {
    feedback.value = 'No pending tracks in current list.'
    return
  }
  try {
    await bulkDownload(pendingIds)
    feedback.value = 'Bulk download started.'
    loadTracks()
  } catch (error) {
    feedback.value = error.response?.data?.error || 'Bulk download failed.'
  }
}

function playSelected() {
  const selected = tracks.value.filter((track) => selectedTrackIds.value.has(track.id))
  if (!selected.length) return
  const playable = selected.filter((track) => track.filePath)
  if (!playable.length) {
    feedback.value = 'None of the selected tracks have local files yet.'
    return
  }
  playerStore.setQueue(playable)
  router.push('/player')
}

onMounted(() => {
  loadTracks()
  loadPlaylists()
})
</script>

<template>
  <section>
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 fw-semibold mb-1">Local Tracks</h1>
        <p class="text-muted mb-0">Filter, sort, download, and build playlists with your saved tracks.</p>
      </div>
      <div class="d-flex gap-2">
        <ColumnToggleMenu v-model="visibleColumns" :columns="columns" />
        <button class="btn btn-outline-primary" @click="downloadMissing" :disabled="!tracks.length">
          <Download size="18" class="me-2" />Download missing
        </button>
        <button class="btn btn-success" @click="playSelected" :disabled="!selectedTrackIds.size">
          <PlayCircle size="18" class="me-2" />Play selected
        </button>
      </div>
    </div>

    <div class="card shadow-sm p-3 mb-4">
      <div class="row g-3">
        <div class="col-md-3"><input class="form-control" placeholder="Track name" v-model="filters.name" @keyup.enter="applyFilters" /></div>
        <div class="col-md-3"><input class="form-control" placeholder="Artist" v-model="filters.artist" @keyup.enter="applyFilters" /></div>
        <div class="col-md-3"><input class="form-control" placeholder="Album" v-model="filters.album" @keyup.enter="applyFilters" /></div>
        <div class="col-md-2">
          <select class="form-select" v-model="filters.status" @change="applyFilters">
            <option value="">Any status</option>
            <option value="not_downloaded">Not Downloaded</option>
            <option value="download_pending">Pending</option>
            <option value="download_in_progress">In Progress</option>
            <option value="downloaded">Downloaded</option>
            <option value="download_failed">Failed</option>
          </select>
        </div>
        <div class="col-md-1 d-grid">
          <button class="btn btn-primary" @click="applyFilters">Filter</button>
        </div>
      </div>
      <div class="row g-3 mt-3">
        <div class="col-md-4">
          <label class="form-label small text-muted">Sort By</label>
          <select class="form-select" v-model="state.sortBy" @change="loadTracks">
            <option value="name">Track</option>
            <option value="artist">Artist</option>
            <option value="album">Album</option>
            <option value="duration">Duration</option>
            <option value="status">Status</option>
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small text-muted">Direction</label>
          <select class="form-select" v-model="state.sortDir" @change="loadTracks">
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </div>
        <div class="col-md-2">
          <label class="form-label small text-muted">Per page</label>
          <select class="form-select" v-model.number="state.pageSize" @change="loadTracks">
            <option :value="10">10</option>
            <option :value="15">15</option>
            <option :value="25">25</option>
            <option :value="50">50</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label small text-muted">Playlist target</label>
          <select class="form-select" v-model="selectedPlaylistId">
            <option value="">Select playlist</option>
            <option v-for="playlist in playlists" :key="playlist.id" :value="playlist.id">
              {{ playlist.name }} ({{ playlist.trackCount }})
            </option>
          </select>
        </div>
      </div>
    </div>

    <div v-if="feedback" class="alert alert-info d-flex align-items-center" role="alert">
      <AlertTriangle class="me-2" size="18" />
      <span>{{ feedback }}</span>
    </div>

    <div v-if="tracks.length" class="table-responsive">
      <table class="table table-striped align-middle">
        <thead>
          <tr>
            <th scope="col">
              <input type="checkbox" class="form-check-input" :checked="selectedTrackIds.size === tracks.length" @change="toggleAll" />
            </th>
            <th v-for="column in columns" :key="column.key" v-show="visibleColumns.includes(column.key)">
              {{ column.label }}
            </th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="track in tracks" :key="track.id">
            <td>
              <input type="checkbox" class="form-check-input" :checked="selectedTrackIds.has(track.id)" @change="toggleSelection(track.id)" />
            </td>
            <td v-if="visibleColumns.includes('name')">
              <div class="fw-semibold">{{ track.name }}</div>
            </td>
            <td v-if="visibleColumns.includes('artists')">{{ track.artists?.join(', ') }}</td>
            <td v-if="visibleColumns.includes('album')">{{ track.album }}</td>
            <td v-if="visibleColumns.includes('duration')">{{ formatDuration(track.durationMs) }}</td>
            <td v-if="visibleColumns.includes('spotifyId')"><small class="text-muted">{{ track.spotifyId }}</small></td>
            <td v-if="visibleColumns.includes('downloadStatus')">
              <span class="badge" :class="`bg-${statusBadges[track.downloadStatus] || 'secondary'}`">
                {{ track.downloadStatus?.replace('_', ' ') || 'not_downloaded' }}
              </span>
            </td>
            <td v-if="visibleColumns.includes('filePath')">
              <a v-if="track.filePath" :href="`/${track.filePath}`" target="_blank">Download file</a>
              <span v-else class="text-muted">—</span>
            </td>
            <td>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-success" @click="downloadTrack(track.id)" :disabled="track.downloadStatus === 'download_in_progress'">
                  <Download size="16" />
                </button>
                <button class="btn btn-outline-primary" @click="addToPlaylist(track.id)" :disabled="!selectedPlaylistId">
                  <ListPlus size="16" />
                </button>
                <button class="btn btn-outline-danger" @click="deleteTrack(track.id)">
                  <Trash2 size="16" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="text-center text-muted">No tracks stored yet. Import some from Spotify to get started.</p>

    <div class="d-flex justify-content-between align-items-center mt-3">
      <small class="text-muted">Showing page {{ state.page }} of {{ pageCount }}</small>
      <div class="btn-group">
        <button class="btn btn-outline-secondary" :disabled="state.page === 1" @click="changePage(-1)">Previous</button>
        <button class="btn btn-outline-secondary" :disabled="state.page === pageCount" @click="changePage(1)">Next</button>
      </div>
    </div>
  </section>
</template>
