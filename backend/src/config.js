import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

loadEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

export const appConfig = {
  port: Number(process.env.PORT || 4000),
  dbPath: process.env.DB_PATH || path.join(rootDir, 'data', 'music-db'),
  downloadsDir: process.env.DOWNLOAD_DIR || path.join(rootDir, 'downloads'),
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
    maxAlbums: Number(process.env.SPOTIFY_MAX_ALBUMS || 10),
    maxTracksPerAlbum: Number(process.env.SPOTIFY_MAX_TRACKS_PER_ALBUM || 50)
  },
  youtube: {
    apiKey: process.env.YOUTUBE_API_KEY || '',
    maxResults: Number(process.env.YOUTUBE_MAX_RESULTS || 3)
  },
  download: {
    ytDlpPath: process.env.YTDLP_PATH || 'yt-dlp',
    audioFormat: process.env.DOWNLOAD_AUDIO_FORMAT || 'm4a'
  }
};
