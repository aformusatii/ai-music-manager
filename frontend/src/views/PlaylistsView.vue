<script setup>
import { ref, computed, onMounted } from 'vue'
import { Plus, Trash2, ArrowUp, ArrowDown, Music4 } from 'lucide-vue-next'
import {
  createPlaylist,
  deletePlaylist,
  fetchPlaylistWithTracks,
  fetchPlaylists,
  reorderPlaylist,
  updatePlaylist,
  removeTrackFromPlaylist
} from '../api/client.js'

const playlists = ref([])
const selectedPlaylistId = ref('')
const selectedPlaylist = ref(null)
const message = ref('')

const newPlaylist = ref({ name: '', description: '' })
const editPlaylist = ref({ name: '', description: '' })

const hasSelection = computed(() => Boolean(selectedPlaylistId.value))

async function loadPlaylists() {
  try {
    playlists.value = await fetchPlaylists()
    if (!selectedPlaylistId.value && playlists.value.length) {
      selectPlaylist(playlists.value[0].id)
    }
  } catch (error) {
    message.value = error.response?.data?.error || 'Failed to load playlists.'
  }
}

async function selectPlaylist(id) {
  selectedPlaylistId.value = id
  if (!id) {
    selectedPlaylist.value = null
    return
  }
  try {
    selectedPlaylist.value = await fetchPlaylistWithTracks(id)
    editPlaylist.value = { name: selectedPlaylist.value.name, description: selectedPlaylist.value.description }
  } catch (error) {
    message.value = error.response?.data?.error || 'Failed to load playlist details.'
  }
}

async function savePlaylist() {
  if (!newPlaylist.value.name.trim()) {
    message.value = 'Playlist name is required.'
    return
  }
  try {
    await createPlaylist({
      name: newPlaylist.value.name.trim(),
      description: newPlaylist.value.description.trim()
    })
    newPlaylist.value = { name: '', description: '' }
    await loadPlaylists()
  } catch (error) {
    message.value = error.response?.data?.error || 'Failed to create playlist.'
  }
}

async function updateSelected() {
  if (!selectedPlaylistId.value) return
  try {
    await updatePlaylist(selectedPlaylistId.value, editPlaylist.value)
    message.value = 'Playlist updated.'
    await selectPlaylist(selectedPlaylistId.value)
    await loadPlaylists()
  } catch (error) {
    message.value = error.response?.data?.error || 'Failed to update playlist.'
  }
}

async function removeSelectedPlaylist(id) {
  if (!confirm('Delete playlist? Tracks remain in your library.')) return
  try {
    await deletePlaylist(id)
    message.value = 'Playlist deleted.'
    selectedPlaylistId.value = ''
    selectedPlaylist.value = null
    await loadPlaylists()
  } catch (error) {
    message.value = error.response?.data?.error || 'Failed to delete playlist.'
  }
}

async function moveTrack(trackId, direction) {
  if (!selectedPlaylist.value) return
  const ids = [...selectedPlaylist.value.trackIds]
  const index = ids.indexOf(trackId)
  if (index === -1) return
  const newIndex = direction === 'up' ? index - 1 : index + 1
  if (newIndex < 0 || newIndex >= ids.length) return
  ids.splice(index, 1)
  ids.splice(newIndex, 0, trackId)
  try {
    await reorderPlaylist(selectedPlaylistId.value, ids)
    await selectPlaylist(selectedPlaylistId.value)
  } catch (error) {
    message.value = error.response?.data?.error || 'Failed to reorder tracks.'
  }
}

async function removeTrack(trackId) {
  if (!selectedPlaylist.value) return
  try {
    await removeTrackFromPlaylist(selectedPlaylistId.value, trackId)
    await selectPlaylist(selectedPlaylistId.value)
  } catch (error) {
    message.value = error.response?.data?.error || 'Failed to remove track from playlist.'
  }
}

onMounted(() => {
  loadPlaylists()
})
</script>

<template>
  <section>
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 fw-semibold mb-1">Playlists</h1>
        <p class="text-muted mb-0">Group tracks, reorder them, and prepare queues for the player.</p>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-lg-4">
        <div class="card playlist-card p-3 mb-4">
          <h2 class="h5 fw-semibold mb-3">Create playlist</h2>
          <div class="mb-3">
            <label class="form-label">Name</label>
            <input class="form-control" v-model="newPlaylist.name" placeholder="Chill vibes" />
          </div>
          <div class="mb-3">
            <label class="form-label">Description</label>
            <textarea class="form-control" rows="2" v-model="newPlaylist.description" placeholder="Optional notes"></textarea>
          </div>
          <button class="btn btn-primary w-100" @click="savePlaylist">
            <Plus class="me-2" size="18" />Create
          </button>
        </div>

        <div class="list-group shadow-sm">
          <button
            v-for="playlist in playlists"
            :key="playlist.id"
            class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
            :class="{ active: playlist.id === selectedPlaylistId }"
            @click="selectPlaylist(playlist.id)"
          >
            <span>
              <strong>{{ playlist.name }}</strong>
              <small class="d-block text-muted">{{ playlist.trackCount }} tracks</small>
            </span>
            <button class="btn btn-sm btn-outline-danger" @click.stop="removeSelectedPlaylist(playlist.id)">
              <Trash2 size="16" />
            </button>
          </button>
        </div>
      </div>

      <div class="col-lg-8" v-if="selectedPlaylist">
        <div class="card player-panel p-4">
          <div class="d-flex justify-content-between align-items-start mb-3">
            <div>
              <h2 class="h4 mb-1">{{ selectedPlaylist.name }}</h2>
              <p class="text-muted mb-0">{{ selectedPlaylist.description || 'No description yet.' }}</p>
            </div>
            <button class="btn btn-outline-danger" @click="removeSelectedPlaylist(selectedPlaylist.id)">
              <Trash2 size="18" class="me-2" />Delete
            </button>
          </div>

          <div class="row g-3 mb-4">
            <div class="col-md-6">
              <label class="form-label">Playlist name</label>
              <input class="form-control" v-model="editPlaylist.name" />
            </div>
            <div class="col-md-6">
              <label class="form-label">Description</label>
              <input class="form-control" v-model="editPlaylist.description" />
            </div>
            <div class="col-12">
              <button class="btn btn-primary" @click="updateSelected">Save changes</button>
            </div>
          </div>

          <div v-if="selectedPlaylist.tracks.length" class="table-responsive">
            <table class="table align-middle">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Track</th>
                  <th>Artist</th>
                  <th>Album</th>
                  <th>Download</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(track, index) in selectedPlaylist.tracks" :key="track.id">
                  <td>{{ index + 1 }}</td>
                  <td>{{ track.name }}</td>
                  <td>{{ track.artists?.join(', ') }}</td>
                  <td>{{ track.album }}</td>
                  <td>
                    <span class="badge" :class="track.filePath ? 'bg-success' : 'bg-secondary'">
                      {{ track.filePath ? 'Ready' : 'Missing' }}
                    </span>
                  </td>
                  <td class="text-end">
                    <div class="btn-group btn-group-sm">
                      <button class="btn btn-outline-secondary" @click="moveTrack(track.id, 'up')">
                        <ArrowUp size="16" />
                      </button>
                      <button class="btn btn-outline-secondary" @click="moveTrack(track.id, 'down')">
                        <ArrowDown size="16" />
                      </button>
                      <button class="btn btn-outline-danger" @click="removeTrack(track.id)">
                        <Trash2 size="16" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <p v-else class="text-muted">No tracks in this playlist yet. Use the Local Tracks page to add some.</p>
        </div>
      </div>
      <div class="col-lg-8" v-else>
        <div class="alert alert-info d-flex align-items-center">
          <Music4 size="18" class="me-2" />
          <span>Select a playlist to view its tracks.</span>
        </div>
      </div>
    </div>

    <p v-if="message" class="text-success fw-semibold mt-3">{{ message }}</p>
  </section>
</template>
