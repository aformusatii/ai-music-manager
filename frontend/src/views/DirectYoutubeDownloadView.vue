<script setup>
import { ref, computed } from 'vue'
import { AlertCircle, CheckCircle2, Download, ListMusic, Youtube } from 'lucide-vue-next'
import { requestDirectYoutubeDownload } from '../api/client.js'
import { useRouter } from 'vue-router'

const router = useRouter()
const youtubeUrl = ref('')
const isSubmitting = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const result = ref(null)

const classificationLabel = computed(() => {
  if (!result.value?.type) return ''
  return result.value.type === 'playlist' ? 'Playlist detected' : 'Single video detected'
})

const scheduledJobs = computed(() => result.value?.jobs || [])
const failureEntries = computed(() => result.value?.failures || [])

async function submitUrl() {
  if (!youtubeUrl.value.trim()) {
    errorMessage.value = 'Please paste a valid YouTube URL.'
    return
  }
  isSubmitting.value = true
  errorMessage.value = ''
  successMessage.value = ''
  result.value = null
  try {
    const data = await requestDirectYoutubeDownload(youtubeUrl.value.trim())
    result.value = data
    successMessage.value = data.message || 'Download scheduled.'
  } catch (error) {
    errorMessage.value = error.response?.data?.error || 'Failed to schedule download. Check the URL and try again.'
  } finally {
    isSubmitting.value = false
  }
}

function goToTracks() {
  router.push('/tracks')
}
</script>

<template>
  <section>
    <div class="d-flex justify-content-between align-items-center mb-4">
      <div>
        <h1 class="h3 fw-semibold mb-1">Direct YouTube Download</h1>
        <p class="text-muted mb-0">Paste a YouTube video or playlist URL to queue downloads without Spotify metadata.</p>
      </div>
      <button class="btn btn-outline-secondary" @click="goToTracks">
        <ListMusic size="18" class="me-2" />View Local Tracks
      </button>
    </div>

    <div class="card shadow-sm p-3 mb-4">
      <form @submit.prevent="submitUrl" class="row g-3 align-items-end">
        <div class="col-md-10">
          <label class="form-label">YouTube URL</label>
          <input
            v-model="youtubeUrl"
            class="form-control form-control-lg"
            placeholder="https://www.youtube.com/watch?v=..."
            :disabled="isSubmitting"
          />
          <small class="text-muted d-block mt-1">
            Supports playlists and single videos. Jobs run in background using the same yt-dlp processing pipeline.
          </small>
        </div>
        <div class="col-md-2 d-grid">
          <button type="submit" class="btn btn-primary btn-lg" :disabled="isSubmitting">
            <Download size="18" class="me-2" />{{ isSubmitting ? 'Scheduling…' : 'Download' }}
          </button>
        </div>
      </form>
    </div>

    <div v-if="errorMessage" class="alert alert-danger d-flex align-items-center" role="alert">
      <AlertCircle size="18" class="me-2" />
      <span>{{ errorMessage }}</span>
    </div>

    <div v-if="successMessage" class="alert alert-success d-flex align-items-center" role="alert">
      <CheckCircle2 size="18" class="me-2" />
      <span>{{ successMessage }} View status under Local Tracks or Download Jobs.</span>
    </div>

    <div v-if="result" class="card shadow-sm mb-4">
      <div class="card-header bg-light d-flex justify-content-between align-items-center">
        <div class="d-flex align-items-center gap-2">
          <Youtube />
          <div>
            <div class="fw-semibold">{{ classificationLabel }}</div>
            <small class="text-muted">Jobs queued: {{ scheduledJobs.length }}</small>
          </div>
        </div>
      </div>
      <div class="card-body">
        <div v-if="result.type === 'video' && result.video">
          <p class="mb-1"><strong>Title:</strong> {{ result.video.title }}</p>
          <p class="mb-1"><strong>Channel:</strong> {{ result.video.channel }}</p>
          <p class="mb-3"><strong>Duration:</strong> {{ result.video.durationMs ? Math.round(result.video.durationMs / 1000) + 's' : '—' }}</p>
        </div>
        <div v-else-if="result.type === 'playlist' && result.playlist" class="mb-3">
          <p class="mb-1"><strong>Playlist:</strong> {{ result.playlist.title }}</p>
          <p class="mb-0 text-muted">
            ID: {{ result.playlist.id }} · Entries detected: {{ result.playlist.totalEntries }}
          </p>
        </div>

        <div class="table-responsive" v-if="scheduledJobs.length">
          <table class="table table-sm align-middle">
            <thead>
              <tr>
                <th>Track ID</th>
                <th>Video ID</th>
                <th>Job ID</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="job in scheduledJobs" :key="job.jobId">
                <td>{{ job.trackId }}</td>
                <td>{{ job.videoId }}</td>
                <td>{{ job.jobId }}</td>
                <td>
                  <span class="badge" :class="job.reusedExisting ? 'bg-info' : 'bg-success'">
                    {{ job.reusedExisting ? 'Updated existing track' : 'New track' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-if="failureEntries.length" class="alert alert-warning mt-3 mb-0">
          <p class="mb-2 fw-semibold">Some playlist items could not be scheduled:</p>
          <ul class="mb-0">
            <li v-for="failure in failureEntries" :key="failure.videoId || failure.title">
              <strong>{{ failure.title || failure.videoId || 'Unknown item' }}:</strong> {{ failure.error }}
            </li>
          </ul>
        </div>
      </div>
    </div>

    <div class="alert alert-info">
      <p class="mb-1 fw-semibold">Tip</p>
      <p class="mb-0">
        Downloads run in the background. Refresh Local Tracks to see progress, or open the Download Jobs page for live logs.
        Existing tracks with the same YouTube video ID are updated instead of duplicated.
      </p>
    </div>
  </section>
</template>
