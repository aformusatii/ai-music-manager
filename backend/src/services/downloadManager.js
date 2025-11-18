import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { appConfig } from '../config.js';
import { setDownloadStatus, getTrack } from '../db/tracks.js';
import { sanitizeFilename } from '../utils/file.js';

fs.mkdirSync(appConfig.downloadsDir, { recursive: true });

class DownloadManager {
  queue = [];
  running = false;

  enqueue(job) {
    // Keep downloads serialized so yt-dlp does not hammer the host and Level stays consistent.
    this.queue.push(job);
    this.processQueue();
  }

  async processQueue() {
    if (this.running || this.queue.length === 0) {
      return;
    }
    this.running = true;
    const job = this.queue.shift();
    try {
      await this.executeJob(job);
    } catch (error) {
      console.error('Download job failed', error);
    } finally {
      this.running = false;
      if (this.queue.length > 0) {
        setImmediate(() => this.processQueue());
      }
    }
  }

  async executeJob({ trackId, videoId }) {
    const track = await getTrack(trackId);
    if (!track) {
      return;
    }
    if (!videoId) {
      await setDownloadStatus(trackId, 'download_failed', { error: 'Missing YouTube video id' });
      return;
    }
    const safeName = sanitizeFilename(`${track.artists?.[0] || 'unknown'}_${track.name}`);
    const targetFilename = `${safeName}_${trackId}.${appConfig.download.audioFormat}`;
    const outputPath = path.join(appConfig.downloadsDir, targetFilename);
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    await setDownloadStatus(trackId, 'download_in_progress');

    const args = [
      youtubeUrl,
      '-x',
      '--audio-format',
      appConfig.download.audioFormat,
      '-o',
      outputPath
    ];

    try {
      await runYtDlp(args);
      const relativePath = path.join('downloads', path.basename(outputPath));
      await setDownloadStatus(trackId, 'downloaded', { filePath: relativePath });
    } catch (error) {
      await setDownloadStatus(trackId, 'download_failed', { error: error.message });
    }
  }
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(appConfig.download.ytDlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (data) => console.log(`[yt-dlp]: ${data}`));
    child.stderr.on('data', (data) => console.error(`[yt-dlp]: ${data}`));
    child.on('error', (error) => {
      reject(new Error(`yt-dlp failed to start: ${error.message}`));
    });
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`yt-dlp exited with code ${code}`));
      }
    });
  });
}

export const downloadManager = new DownloadManager();
