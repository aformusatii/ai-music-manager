# Music Manager

Music Manager is a full-stack Node.js + Vue application that lets you search Spotify for artists, import their tracks into a local LevelDB database, manage downloads via YouTube + yt-dlp, organise playlists, and play audio through a built‑in player.

## Tech Stack

- **Backend**: Node.js (ESM), Express, Level, Axios, helmet, cors, morgan
- **Frontend**: Vue 3, Vite, Pinia, Vue Router, Bootstrap 5, Google Font (Inter), Lucide icons
- **Storage**: LevelDB JSON sublevels (`backend/data/music-db`)
- **Downloads**: `yt-dlp` invoked from the backend, files served from `backend/downloads`
- **PWA**: `vite-plugin-pwa` + `manifest.webmanifest`

## Prerequisites

1. **Node.js 20 (latest LTS)** and npm.
2. **yt-dlp** installed on the server path (used for audio downloads). Example install:
   ```bash
   pip install -U yt-dlp  # or follow https://github.com/yt-dlp/yt-dlp
   ```
3. **Spotify API credentials** (Client ID + Client Secret).
   - Visit [https://developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and create an app.
   - Grab the **Client ID** and **Client Secret**.
   - The app uses the **Client Credentials** OAuth flow, so no redirect URI is required for the implemented endpoints.
4. **YouTube Data API key**.
   - Create a Google Cloud project → enable the *YouTube Data API v3*.
   - Create an API key under *APIs & Services → Credentials*.
   - Restrict the key if desired (HTTP referrers or IPs).
5. **OpenAI / LLM credentials** (used for the AI-assisted YouTube resolver).
   - Create an API key at [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys).
   - The backend currently targets the Chat Completions API; any `gpt-4o`/`gpt-4o-mini` compatible model works.
   - Keep the key private—store it only inside the project `.env` file (see configuration below).
   - Optional: customise behaviour with `AI_YT_SYSTEM_PROMPT` or lower the number of tool calls via `AI_YT_MAX_ATTEMPTS`.

## Configuration

Create a `.env` file at the project root (copy `.env.example`) and fill in your credentials (the backend loads this root file even when started from the `backend` workspace):

```
PORT=4000
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
YOUTUBE_API_KEY=your-youtube-api-key
DB_PATH=./backend/data/music-db
DOWNLOAD_DIR=./backend/downloads
YTDLP_PATH=yt-dlp
DOWNLOAD_MAX_CONCURRENT=3
DOWNLOAD_LOG_FILE=./backend/logs/download-jobs.log
AI_PROVIDER=openai
AI_API_KEY=your-openai-api-key
AI_MODEL=gpt-4o-mini
AI_YT_MAX_ATTEMPTS=3
AI_YT_SYSTEM_PROMPT=
YOUTUBE_DIRECT_MAX_ITEMS=50
```

- `DB_PATH` points to the Level database folder.
- `DOWNLOAD_DIR` is where yt-dlp stores audio files. Files are exposed under `/downloads/...` for playback.
- `YTDLP_PATH` lets you point to a custom yt-dlp binary if needed.
- `DOWNLOAD_MAX_CONCURRENT` controls how many yt-dlp jobs can run in parallel (defaults to `1`).
- `DOWNLOAD_LOG_FILE` stores the aggregated download job log that also powers the live log stream in the UI.
- `AI_PROVIDER`, `AI_API_KEY`, and `AI_MODEL` configure the LLM that drives the multi-attempt YouTube search (currently OpenAI only).
- `AI_YT_MAX_ATTEMPTS` caps how many tool-driven searches the agent will execute per track (defaults to `3`).
- `AI_YT_SYSTEM_PROMPT` lets you override the default system instructions that steer the YouTube search agent.
- `YOUTUBE_DIRECT_MAX_ITEMS` caps how many entries from a single playlist/Mix URL are enqueued when using the Direct YouTube Download page (defaults to `50`).

## Installation

From the repository root:

```bash
npm install --workspaces  # installs backend + frontend dependencies
```

## Running in Development

Start both backend and frontend together (uses `concurrently` under the hood):

```bash
npm run dev
```

This launches:

- Express API on `PORT` (default `4000`)
- Vite dev server on `5173` with a reverse proxy so `/api/*` and `/downloads/*` calls hit the Express server over the same origin.

You can still run just the UI via `npm run dev:frontend` if needed.

The backend listens on `PORT` (default `4000`). The frontend dev server runs on `5173` and proxies API calls to `/api/*` (relative URLs are used so it works behind a reverse proxy).

## Production Build

```bash
npm run build            # builds the Vue app (PWA ready)
PORT=4000 npm run start  # serves API + built frontend + downloads
```

`npm run start` serves the `frontend/dist` folder statically from Express and keeps all API routes under `/api/*` plus `/downloads/*` for audio files.

## Major Features

- **Spotify Search**: Search artists, browse their albums/tracks, toggle visible columns, select tracks, and import them into the local database without duplicates.
- **Local Library**: Filter, sort, and paginate tracks; toggle column visibility (including a Source column to distinguish Spotify vs Direct YouTube imports); delete tracks (optionally removing downloaded files); trigger single or bulk YouTube downloads; add to playlists; build ad-hoc playback queues.
- **Direct YouTube Download**: Paste any YouTube video or playlist/Mix URL to enqueue downloads without going through Spotify. The backend deduplicates by video ID, uses the same processing pipeline as Spotify-origin tracks, and respects the `YOUTUBE_DIRECT_MAX_ITEMS` cap for huge playlists.
- **YouTube Downloads**: Backend now resolves the best video through an AI-guided workflow that calls the YouTube Data API as a tool, then enqueues yt-dlp jobs and updates download status (`not_downloaded`, `download_pending`, `download_in_progress`, `downloaded`, `download_failed`). Parallelism is configurable, and a dedicated *Download Jobs* view surfaces live stats plus aggregated yt-dlp logs.
- **Playlists**: Create/update/delete playlists, avoid duplicate entries, reorder tracks, and detach tracks without deleting from the library.
- **Player**: Simple audio player that can load saved playlists or the ad-hoc queue; includes play/pause/next/previous controls and displays metadata.
- **PWA**: Installable via the included `manifest.webmanifest` and Workbox-powered service worker.

## Notes & Limitations

- The Spotify integration uses the Client Credentials flow, so only public artist/album/track data is available (no user-specific data).
- yt-dlp downloads use an in-memory queue with configurable parallelism. Increase `DOWNLOAD_MAX_CONCURRENT` for faster bulk imports, but keep host/network limits in mind.
- Direct playlist/Mix submissions only enqueue the first `YOUTUBE_DIRECT_MAX_ITEMS` entries to avoid runaway queues; raise this env var if you need to import more than 50 at once.
- The backend is single-user by design and does not include authentication.
- LevelDB data and downloaded files remain on disk until manually removed.

## Troubleshooting

- **Spotify errors**: Double-check the client ID/secret and confirm the app is enabled in the developer dashboard.
- **YouTube errors**: Ensure the API key has the YouTube Data API enabled and the quota is not exceeded. The backend returns helpful messages (e.g., "No YouTube results found").
- **AI errors**: When the agent cannot run (missing key, provider mismatch, or model issues) the backend falls back to a simple YouTube search but will mark the track as failed if no match is found. Check `AI_*` settings and logs for details.
- **yt-dlp missing**: Install yt-dlp and ensure the binary path matches `YTDLP_PATH`.
- **Reverse proxy usage**: The frontend uses relative URLs for APIs and assets, so you can proxy `/api` to the backend and `/` to the frontend/static bundle.
