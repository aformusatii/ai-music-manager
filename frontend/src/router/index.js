import { createRouter, createWebHistory } from 'vue-router'

const SpotifySearchView = () => import('../views/SpotifySearchView.vue')
const LocalTracksView = () => import('../views/LocalTracksView.vue')
const PlaylistsView = () => import('../views/PlaylistsView.vue')
const PlayerView = () => import('../views/PlayerView.vue')
const DownloadJobsView = () => import('../views/DownloadJobsView.vue')

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: '/spotify' },
    { path: '/spotify', component: SpotifySearchView, meta: { title: 'Spotify Search' } },
    { path: '/tracks', component: LocalTracksView, meta: { title: 'Local Tracks' } },
    { path: '/playlists', component: PlaylistsView, meta: { title: 'Playlists' } },
    { path: '/player', component: PlayerView, meta: { title: 'Player' } },
    { path: '/downloads/jobs', component: DownloadJobsView, meta: { title: 'Download Jobs' } }
  ]
})

router.afterEach((to) => {
  if (to.meta?.title) {
    document.title = `${to.meta.title} · Music Manager`
  }
})

export default router
