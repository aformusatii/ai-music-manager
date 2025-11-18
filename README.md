# Music Manager

Music Manager is a full-stack Node.js + Vue application that lets you search Spotify for artists, import their tracks into a local LevelDB database, manage downloads via YouTube + yt-dlp, organise playlists, and play audio through a built‑in player. The UI favours simple interactions so junior developers can follow along easily.

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

## Configuration

Create a `.env` file at the project root (copy `.env.example`) and fill in your credentials:

```
PORT=4000
SPOTIFY_CLIENT_ID=your-spotify-client-id
SPOTIFY_CLIENT_SECRET=your-spotify-client-secret
YOUTUBE_API_KEY=your-youtube-api-key
DB_PATH=./backend/data/music-db
DOWNLOAD_DIR=./backend/downloads
YTDLP_PATH=yt-dlp
```

- `DB_PATH` points to the Level database folder.
- `DOWNLOAD_DIR` is where yt-dlp stores audio files. Files are exposed under `/downloads/...` for playback.
- `YTDLP_PATH` lets you point to a custom yt-dlp binary if needed.

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
- **Local Library**: Filter, sort, and paginate tracks; toggle column visibility; delete tracks (optionally removing downloaded files); trigger single or bulk YouTube downloads; add to playlists; build ad-hoc playback queues.
- **YouTube Downloads**: Backend resolves the best video via the YouTube Data API, enqueues jobs for yt-dlp, and updates download status (`not_downloaded`, `download_pending`, `download_in_progress`, `downloaded`, `download_failed`).
- **Playlists**: Create/update/delete playlists, avoid duplicate entries, reorder tracks, and detach tracks without deleting from the library.
- **Player**: Simple audio player that can load saved playlists or the ad-hoc queue; includes play/pause/next/previous controls and displays metadata.
- **PWA**: Installable via the included `manifest.webmanifest` and Workbox-powered service worker.

## Notes & Limitations

- The Spotify integration uses the Client Credentials flow, so only public artist/album/track data is available (no user-specific data).
- yt-dlp downloads run sequentially through a tiny in-memory queue. For large batches this may take time; the README and UI call this out.
- The backend is single-user by design and does not include authentication.
- LevelDB data and downloaded files remain on disk until manually removed.

## Troubleshooting

- **Spotify errors**: Double-check the client ID/secret and confirm the app is enabled in the developer dashboard.
- **YouTube errors**: Ensure the API key has the YouTube Data API enabled and the quota is not exceeded. The backend returns helpful messages (e.g., "No YouTube results found").
- **yt-dlp missing**: Install yt-dlp and ensure the binary path matches `YTDLP_PATH`.
- **Reverse proxy usage**: The frontend uses relative URLs for APIs and assets, so you can proxy `/api` to the backend and `/` to the frontend/static bundle.
