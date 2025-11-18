<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { Play, Pause, SkipBack, SkipForward, RotateCcw } from 'lucide-vue-next'
import { fetchPlaylistWithTracks, fetchPlaylists } from '../api/client.js'
import { usePlayerStore } from '../stores/player.js'

const playlists = ref([])
const selectedPlaylistId = ref('')
const queue = ref([])
const currentIndex = ref(0)
const audioRef = ref(null)
const isPlaying = ref(false)
const message = ref('')
const playerStore = usePlayerStore()

const currentTrack = computed(() => queue.value[currentIndex.value] || null)

function resolveSrc(track) {
  if (!track?.filePath) return ''
  return `/${track.filePath}`
}

async function loadPlaylists() {
  try {
    playlists.value = await fetchPlaylists()
  } catch (error) {
    message.value = error.response?.data?.error || 'Failed to load playlists.'
  }
}

async function loadPlaylistTracks(id) {
  if (!id) return
  try {
    const playlist = await fetchPlaylistWithTracks(id)
    queue.value = playlist.tracks.filter((track) => track.filePath)
    currentIndex.value = 0
    if (!queue.value.length) {
      message.value = 'Playlist has no downloadable tracks yet.'
    } else {
      message.value = ''
    }
  } catch (error) {
    message.value = error.response?.data?.error || 'Failed to load playlist.'
  }
}

function togglePlay() {
  if (!audioRef.value) return
  if (isPlaying.value) {
    audioRef.value.pause()
  } else {
    audioRef.value.play()
  }
}

function playNext() {
  if (currentIndex.value < queue.value.length - 1) {
    currentIndex.value += 1
    playCurrent()
  }
}

function playPrev() {
  if (currentIndex.value > 0) {
    currentIndex.value -= 1
    playCurrent()
  }
}

async function playCurrent() {
  if (!audioRef.value) return
  await nextTick()
  audioRef.value.load()
  try {
    await audioRef.value.play()
  } catch (error) {
    console.warn('Autoplay failed', error)
  }
}

function loadAdhocQueue() {
  if (!playerStore.queue.length) {
    message.value = 'No ad-hoc queue available. Select tracks on the Local Tracks page.'
    return
  }
  queue.value = playerStore.queue.filter((track) => track.filePath)
  currentIndex.value = playerStore.currentIndex
  message.value = ''
}

function jumpTo(index) {
  currentIndex.value = index
  playCurrent()
}

watch(selectedPlaylistId, (id) => {
  if (id) loadPlaylistTracks(id)
})

watch(queue, (next) => {
  if (!next.length && audioRef.value) {
    audioRef.value.pause()
  }
  isPlaying.value = false
})

watch(currentTrack, (track) => {
  if (!track && audioRef.value) {
    audioRef.value.pause()
  } else if (track) {
    playCurrent()
  }
})

onMounted(() => {
  loadPlaylists()
  if (playerStore.queue.length) {
    loadAdhocQueue()
  }
})
</script>

<template>
  <section>
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 fw-semibold mb-1">Playlist Player</h1>
        <p class="text-muted mb-0">Play full playlists or the ad-hoc queue built on the tracks page.</p>
      </div>
      <button class="btn btn-outline-primary" @click="loadAdhocQueue">
        <RotateCcw size="18" class="me-2" />Load ad-hoc queue
      </button>
    </div>

    <div class="card player-panel p-4 mb-4">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label">Select playlist</label>
          <select class="form-select" v-model="selectedPlaylistId">
            <option value="">Choose…</option>
            <option v-for="playlist in playlists" :value="playlist.id" :key="playlist.id">
              {{ playlist.name }} ({{ playlist.trackCount }})
            </option>
          </select>
        </div>
      </div>

      <div class="text-center mt-4" v-if="currentTrack">
        <p class="text-muted mb-1">Now playing</p>
        <h2 class="h4 fw-semibold">{{ currentTrack.name }}</h2>
        <p class="text-muted">{{ currentTrack.artists?.join(', ') }}</p>
        <audio
          ref="audioRef"
          :src="resolveSrc(currentTrack)"
          controls
          class="w-100"
          @play="isPlaying = true"
          @pause="isPlaying = false"
          @ended="playNext"
        ></audio>
        <div class="d-flex justify-content-center gap-3 mt-3">
          <button class="btn btn-outline-secondary" @click="playPrev" :disabled="currentIndex === 0">
            <SkipBack />
          </button>
          <button class="btn btn-primary" @click="togglePlay" :disabled="!currentTrack">
            <component :is="isPlaying ? Pause : Play" class="me-2" />
            {{ isPlaying ? 'Pause' : 'Play' }}
          </button>
          <button class="btn btn-outline-secondary" @click="playNext" :disabled="currentIndex >= queue.length - 1">
            <SkipForward />
          </button>
        </div>
      </div>
      <p v-else class="text-muted text-center mb-0">Select a playlist or load the ad-hoc queue.</p>
    </div>

    <div class="card p-3 shadow-sm" v-if="queue.length">
      <h2 class="h6 fw-semibold mb-3">Queue</h2>
      <ol class="list-group list-group-numbered">
        <li
          v-for="(track, index) in queue"
          :key="track.id"
          class="list-group-item d-flex justify-content-between align-items-center"
          :class="{ active: index === currentIndex }"
        >
          <span>
            <strong>{{ track.name }}</strong>
            <small class="d-block text-muted">{{ track.artists?.join(', ') }}</small>
          </span>
          <button class="btn btn-sm btn-outline-primary" @click="jumpTo(index)">
            Play
          </button>
        </li>
      </ol>
    </div>

    <p v-if="message" class="text-danger fw-semibold mt-3">{{ message }}</p>
  </section>
</template>
