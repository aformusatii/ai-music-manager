import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const projectRoot = path.resolve(rootDir, '..');

const envFiles = [
  path.join(projectRoot, '.env'),
  path.join(rootDir, '.env')
];

let envLoaded = false;
for (const envPath of envFiles) {
  if (fs.existsSync(envPath)) {
    loadEnv({ path: envPath, override: envLoaded });
    envLoaded = true;
  }
}

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
    maxResults: Number(process.env.YOUTUBE_MAX_RESULTS || 3),
    directDownloadMaxItems: Number(process.env.YOUTUBE_DIRECT_MAX_ITEMS || 50)
  },
  ai: {
    provider: process.env.AI_PROVIDER || 'openai',
    apiKey: process.env.AI_API_KEY || process.env.OPENAI_API_KEY || '',
    model: process.env.AI_MODEL || 'gpt-4o-mini',
    youtubeSearch: {
      maxAttempts: Number(process.env.AI_YT_MAX_ATTEMPTS || 3),
      systemPrompt: process.env.AI_YT_SYSTEM_PROMPT || ''
    }
  },
  download: {
    ytDlpPath: process.env.YTDLP_PATH || 'yt-dlp',
    audioFormat: process.env.DOWNLOAD_AUDIO_FORMAT || 'm4a',
    maxConcurrentJobs: Number(process.env.DOWNLOAD_MAX_CONCURRENT || 1),
    logFile: process.env.DOWNLOAD_LOG_FILE || path.join(rootDir, 'logs', 'download-jobs.log')
  }
};
