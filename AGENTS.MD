# Agent Activity Log

## Codex Persona & Guardrails
- You are an experienced node js developer with more than 15 years of experience.
- You know all the latest frontend and backend techologies used with node js.
- You are writing simple easily maintainable code which favours simplicity over generalization. 
- The code you will write will be given to junior developers who are new to programing, therfore the constructions you will use will be SIMPLE!
- You are going to comment the code where it is more difficult.

## Tech stack:
- You will use the following tech stack while building the app.
    * Node.js: **latest LTS**
    * Package manager: **npm**
    * Module format: **ESM** across backend and frontend
    * Frontend: **Vue 3**, **Vite**
    * Styling: **Bootstrap 5**, **Google Fonts: Inter (400/500/600)**, **Lucide** icons
    * Backend: **Express** (ESM), **helmet**, **cors**, **morgan** (logging), **Level** (JSON), **Axios** (for outbound calls if needed)
    * PWA: **Workbox** service worker + **manifest.webmanifest** (installable)

## Product Snapshot
- Full-stack music manager that discovers artists via Spotify, imports tracks into a LevelDB library, downloads audio via YouTube/yt-dlp, and exposes playlists plus an in-browser player.
- Backend serves JSON APIs (`/api/*`) and static downloads, proxies YouTube download jobs, and can host the built frontend from `frontend/dist`.
- Frontend is a Vue 3 SPA with pages for Spotify search, local track curation, playlist CRUD, audio playback (with ad-hoc queues), and download job monitoring.

## Repository Layout & Key Modules
- `backend/src/server.js`: Express app wiring middleware, API routers, downloads static serving, and SPA fallback when `frontend/dist` exists.
- `backend/src/config.js`: Loads `.env` via `dotenv`, defines directories/ports, Spotify & YouTube quotas, and yt-dlp concurrency/log paths.
- `backend/src/db/*.js`: Level sublevels for `tracks` and `playlists`, providing CRUD helpers plus pagination/filter logic.
- `backend/src/services`: Integrations for Spotify REST, YouTube Data API search helpers, and the `DownloadManager` class that wraps yt-dlp job orchestration.
- `frontend/src`: Vue entry (`main.js`), router, Pinia store, shared components (navbar, column toggling), feature views, and REST client functions hitting `/api`.
- `prompt.md`, `functional-requirements.md`, `README.md`: Source of product expectations, persona constraints, and developer setup.

## Functional Areas & Files
### Spotify artist discovery & import
- **Functionality:** Search artists, inspect their albums/tracks through Spotify APIs, and selectively import normalized track metadata into the local library.
- **Files:** `backend/src/services/spotify.js`, `backend/src/routes/spotify.js`, `frontend/src/api/client.js` (Spotify methods), `frontend/src/views/SpotifySearchView.vue`, `frontend/src/components/ColumnToggleMenu.vue` (column chooser used here).

### Local track library management
- **Functionality:** Store imported tracks in LevelDB, filter/sort/paginate, edit/delete entries, queue downloads, and add tracks to playlists or ad-hoc player queues.
- **Files:** `backend/src/db/tracks.js` (list/upsert/filter), `backend/src/routes/tracks.js` (REST endpoints, import, deletions, download enqueue/bulk), `backend/src/utils/file.js` (filename sanitizing), `frontend/src/views/LocalTracksView.vue`, `frontend/src/api/client.js` (tracks CRUD/download calls), `frontend/src/stores/player.js` (ad-hoc queue state).

### Download orchestration & monitoring
- **Functionality:** Resolve YouTube video IDs, enqueue yt-dlp jobs with concurrency limits, persist status/logs, expose telemetry, and provide SSE-based live log streaming.
- **Files:** `backend/src/services/downloadManager.js` (EventEmitter-based `DownloadManager` class wrapping yt-dlp child processes, logging, and DB status updates), `backend/src/routes/downloads.js` (job stats + SSE log streaming), `backend/src/services/youtube.js` (search + query builder), `frontend/src/views/DownloadJobsView.vue` (stats dashboard + EventSource logs), `frontend/src/api/client.js` (download endpoints).

### Playlist CRUD & playback
- **Functionality:** Create/update/delete playlists with unique names, reorder contained tracks, materialize playlists with track objects, and play downloaded audio through the browser or ad-hoc queues.
- **Files:** `backend/src/db/playlists.js`, `backend/src/routes/playlists.js`, `frontend/src/views/PlaylistsView.vue`, `frontend/src/views/PlayerView.vue`, `frontend/src/stores/player.js` (queue navigation), `frontend/src/api/client.js` (playlist calls).

### PWA shell, routing, and shared UI
- **Functionality:** Provide the SPA scaffold, responsive navigation, route-based document titles, service-worker registration, and Bootstrap-styled shared components.
- **Files:** `frontend/src/main.js`, `frontend/src/App.vue`, `frontend/src/components/AppNavbar.vue`, `frontend/src/router/index.js`, `frontend/src/style.css`, `frontend/public/manifest.webmanifest`, `vite.config.js` (PWA + proxy config).

## Key Classes, Stores, and Patterns
- `backend/src/services/downloadManager.js`: Defines the `DownloadManager` EventEmitter class with queueing, concurrency control, job history trimming, and log streaming (both persisted to disk and emitted via SSE).
- `frontend/src/stores/player.js`: Pinia store holding `queue`, `currentIndex`, and navigation helpers so Local Tracks and Player views stay in sync.
- `frontend/src/components/ColumnToggleMenu.vue`: Reusable dropdown that guards against hiding locked columns; used anywhere tabular data needs quick column visibility toggles.

## Operational Notes & Recent Changes
- Root `npm run dev` runs both backend and frontend concurrently; Vite proxies `/api` + `/downloads` to Express so the SPA and API share an origin during development.
- Backend ensures download/log/data directories exist before use, so yt-dlp, SSE logs, and LevelDB all have persistent storage under `backend/`.
- Previous iterations already scaffolded the project, wired download + playlist flows, and added PWA assets—future work should extend within this structure rather than replacing it.
- YouTube search + selection is now centralized in `backend/src/services/youtube.js`, which drives an OpenAI chat workflow that can call a `youtubeSearch` tool up to `AI_YT_MAX_ATTEMPTS` times before returning a structured `{status, videoId, reason, error}` response (falls back to a simple query when AI credentials are missing).
- Download jobs always start in the async `DownloadManager` queue; if no `videoId` is provided, the job throttling automatically runs the AI resolver, logs its reasoning, and only then spawns yt-dlp—routes never hit YouTube directly anymore.
- `.env`/.`config.js` now include `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`, `AI_YT_MAX_ATTEMPTS`, and `AI_YT_SYSTEM_PROMPT` so future work should read those settings instead of hardcoding LLM behaviour.
