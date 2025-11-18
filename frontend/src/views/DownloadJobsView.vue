<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { Activity, RefreshCcw } from 'lucide-vue-next'
import { fetchDownloadJobs } from '../api/client'

const stats = ref({ queueLength: 0, activeJobs: 0, maxConcurrentJobs: 0, jobs: [] })
const loading = ref(false)
const error = ref('')
const logs = ref([])
const logContainer = ref(null)
const maxLogEntries = 300
let pollTimer
let eventSource

const apiBase = (import.meta.env.VITE_API_BASE || '/api').replace(/\/+$/, '')

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function statusVariant(status) {
  switch (status) {
    case 'running':
      return 'info'
    case 'completed':
      return 'success'
    case 'failed':
      return 'danger'
    case 'queued':
    default:
      return 'secondary'
  }
}

async function loadStats() {
  loading.value = true
  try {
    stats.value = await fetchDownloadJobs()
    error.value = ''
  } catch (err) {
    error.value = err.response?.data?.error || err.message || 'Failed to load download jobs.'
  } finally {
    loading.value = false
  }
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(loadStats, 5000)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = undefined
  }
}

function startLogStream() {
  stopLogStream()
  const url = `${apiBase}/downloads/logs/stream`
  eventSource = new EventSource(url)
  eventSource.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data)
      logs.value.push(payload)
      if (logs.value.length > maxLogEntries) {
        logs.value.shift()
      }
      nextTick(() => {
        if (logContainer.value) {
          logContainer.value.scrollTop = logContainer.value.scrollHeight
        }
      })
    } catch (parseError) {
      console.warn('Failed to parse log entry', parseError)
    }
  }
  eventSource.onerror = () => {
    stopLogStream()
    setTimeout(startLogStream, 3000)
  }
}

function stopLogStream() {
  if (eventSource) {
    eventSource.close()
    eventSource = undefined
  }
}

onMounted(() => {
  loadStats()
  startPolling()
  startLogStream()
})

onUnmounted(() => {
  stopPolling()
  stopLogStream()
})
</script>

<template>
  <section>
    <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
      <div>
        <h1 class="h3 fw-semibold mb-1">Download Jobs</h1>
        <p class="text-muted mb-0">Monitor yt-dlp concurrency, job history, and aggregated logs in real time.</p>
      </div>
      <button class="btn btn-outline-secondary d-flex align-items-center" :disabled="loading" @click="loadStats">
        <RefreshCcw size="16" class="me-2" />
        Refresh
      </button>
    </div>

    <div v-if="error" class="alert alert-danger" role="alert">
      {{ error }}
    </div>

    <div class="row g-3 mb-4">
      <div class="col-md-4">
        <div class="card shadow-sm p-3 h-100">
          <div class="d-flex align-items-center">
            <Activity size="28" class="text-primary me-3" />
            <div>
              <div class="text-muted text-uppercase small">Active Jobs</div>
              <div class="h4 mb-0">{{ stats.activeJobs }}</div>
            </div>
          </div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card shadow-sm p-3 h-100">
          <div class="text-muted text-uppercase small">Queued Jobs</div>
          <div class="h4 mb-0">{{ stats.queueLength }}</div>
        </div>
      </div>
      <div class="col-md-4">
        <div class="card shadow-sm p-3 h-100">
          <div class="text-muted text-uppercase small">Max Parallel Downloads</div>
          <div class="h4 mb-0">{{ stats.maxConcurrentJobs }}</div>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-lg-6">
        <div class="card shadow-sm">
          <div class="card-header d-flex justify-content-between align-items-center">
            <span class="fw-semibold">Recent Jobs</span>
            <span class="text-muted small">Showing {{ stats.jobs?.length || 0 }} tracked jobs</span>
          </div>
          <div class="table-responsive">
            <table class="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th>Job</th>
                  <th>Track</th>
                  <th>Status</th>
                  <th>Queued</th>
                  <th>Finished</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!stats.jobs?.length">
                  <td colspan="5" class="text-center text-muted py-4">No jobs recorded yet.</td>
                </tr>
                <tr v-for="job in stats.jobs" :key="job.id">
                  <td class="font-monospace small">{{ job.id }}</td>
                  <td>
                    <div class="fw-semibold small">{{ job.trackName || job.trackId }}</div>
                    <div class="text-muted small">{{ job.artists?.join(', ') }}</div>
                  </td>
                  <td>
                    <span class="badge" :class="`bg-${statusVariant(job.status)}`">{{ job.status }}</span>
                  </td>
                  <td class="small text-muted">{{ formatDate(job.enqueuedAt) }}</td>
                  <td class="small text-muted">{{ formatDate(job.completedAt || job.startedAt) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="col-lg-6">
        <div class="card shadow-sm h-100">
          <div class="card-header fw-semibold">Live Logs</div>
          <div ref="logContainer" class="log-container">
            <div v-if="logs.length" class="log-entries">
              <div
                v-for="(entry, index) in logs"
                :key="`${entry.timestamp}-${index}`"
                class="log-entry"
              >
                <span class="log-timestamp">{{ entry.timestamp }}</span>
                <span class="log-job">[{{ entry.jobId }}]</span>
                <span class="log-message">{{ entry.message }}</span>
              </div>
            </div>
            <p v-else class="text-muted mb-0">Waiting for log entries…</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.log-container {
  min-height: 320px;
  max-height: 480px;
  overflow-y: auto;
  background-color: #0f172a;
  color: #e2e8f0;
  padding: 1rem;
  font-family: 'JetBrains Mono', 'SFMono-Regular', 'Consolas', monospace;
  border-bottom-left-radius: 0.5rem;
  border-bottom-right-radius: 0.5rem;
}

.log-entries {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.log-entry {
  display: grid;
  grid-template-columns: auto auto 1fr;
  gap: 0.5rem;
  font-size: 0.85rem;
  line-height: 1.4;
  padding: 0.2rem 0.25rem;
  background-color: rgba(148, 163, 184, 0.08);
  border-radius: 0.3rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.log-timestamp {
  color: #cbd5f5;
  font-variant-numeric: tabular-nums;
}

.log-job {
  color: #fbbf24;
  font-weight: 600;
}

.log-message {
  color: #f8fafc;
  overflow-wrap: anywhere;
}
</style>
