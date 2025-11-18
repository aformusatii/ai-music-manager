<script setup>
import { useRoute } from 'vue-router'
import { Search, Disc, ListMusic, Play } from 'lucide-vue-next'

const route = useRoute()
const navItems = [
  { to: '/spotify', label: 'Spotify Search', icon: Search },
  { to: '/tracks', label: 'Local Tracks', icon: Disc },
  { to: '/playlists', label: 'Playlists', icon: ListMusic },
  { to: '/player', label: 'Player', icon: Play }
]
</script>

<template>
  <nav class="navbar navbar-expand-lg navbar-dark bg-dark">
    <div class="container">
      <RouterLink class="navbar-brand fw-semibold" to="/">Music Manager</RouterLink>
      <button
        class="navbar-toggler"
        type="button"
        data-bs-toggle="collapse"
        data-bs-target="#mainNav"
        aria-controls="mainNav"
        aria-expanded="false"
        aria-label="Toggle navigation"
      >
        <span class="navbar-toggler-icon"></span>
      </button>
      <div class="collapse navbar-collapse" id="mainNav">
        <ul class="navbar-nav ms-auto">
          <li class="nav-item" v-for="item in navItems" :key="item.to">
            <RouterLink :to="item.to" class="nav-link" :class="{ active: route.path === item.to }">
              <component :is="item.icon" class="icon-inline me-2" size="18" />
              {{ item.label }}
            </RouterLink>
          </li>
        </ul>
      </div>
    </div>
  </nav>
</template>
