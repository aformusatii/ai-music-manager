import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { appConfig } from '../config.js';
import { setDownloadStatus, getTrack } from '../db/tracks.js';
import { sanitizeFilename } from '../utils/file.js';

fs.mkdirSync(appConfig.downloadsDir, { recursive: true });

class DownloadManager extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.activeJobs = 0;
    this.nextJobId = 1;
    this.maxConcurrent = Math.max(1, Number(appConfig.download.maxConcurrentJobs) || 1);
    this.jobs = new Map();
    this.jobOrder = [];
    this.maxTrackedJobs = 200;
    this.recentLogs = [];
    this.maxRecentLogs = 300;
    this.logFile = appConfig.download.logFile;
    fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
    this.logStream = fs.createWriteStream(this.logFile, { flags: 'a' });
    this.logStream.on('error', (error) => {
      console.error('Download log stream error', error);
    });
  }

  enqueue(job) {
    const jobId = job.jobId || `job-${this.nextJobId++}`;
    const record = {
      ...job,
      id: jobId,
      status: 'queued',
      enqueuedAt: new Date().toISOString()
    };
    this.queue.push(record);
    this.jobs.set(jobId, record);
    this.jobOrder.push(jobId);
    this.trimJobHistory();
    this.log(jobId, `Enqueued track ${record.trackId}${record.videoId ? ` (video ${record.videoId})` : ''}`);
    this.processQueue();
    return jobId;
  }

  processQueue() {
    if (this.queue.length === 0) {
      return;
    }
    while (this.activeJobs < this.maxConcurrent && this.queue.length > 0) {
      const job = this.queue.shift();
      this.runJob(job).catch((error) => {
        this.log(job.id, `Unexpected job error: ${error.message}`);
      });
    }
  }

  async runJob(job) {
    this.activeJobs += 1;
    job.status = 'running';
    job.startedAt = new Date().toISOString();
    this.log(job.id, 'Starting download');
    try {
      await this.executeJob(job);
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      this.log(job.id, 'Download completed');
    } catch (error) {
      job.status = 'failed';
      job.completedAt = new Date().toISOString();
      job.error = error.message;
      this.log(job.id, `Download failed: ${error.message}`);
    } finally {
      this.activeJobs -= 1;
      this.processQueue();
    }
  }

  async executeJob(job) {
    const { trackId, videoId } = job;
    const track = await getTrack(trackId);
    if (!track) {
      await setDownloadStatus(trackId, 'download_failed', { error: 'Track not found' });
      throw new Error('Track not found');
    }
    if (!videoId) {
      await setDownloadStatus(trackId, 'download_failed', { error: 'Missing YouTube video id' });
      throw new Error('Missing YouTube video id');
    }
    const safeName = sanitizeFilename(`${track.artists?.[0] || 'unknown'}_${track.name}`);
    const targetFilename = `${safeName}_${trackId}.${appConfig.download.audioFormat}`;
    const outputPath = path.join(appConfig.downloadsDir, targetFilename);
    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`;

    job.outputPath = outputPath;
    await setDownloadStatus(trackId, 'download_in_progress');
    this.log(job.id, `Downloading to ${outputPath}`);

    const args = [
      youtubeUrl,
      '-x',
      '--audio-format',
      appConfig.download.audioFormat,
      '-o',
      outputPath
    ];

    try {
      await runYtDlp(args, (line) => this.log(job.id, line));
      const relativePath = path.join('downloads', path.basename(outputPath));
      await setDownloadStatus(trackId, 'downloaded', { filePath: relativePath });
      job.filePath = relativePath;
    } catch (error) {
      await setDownloadStatus(trackId, 'download_failed', { error: error.message });
      throw error;
    }
  }

  log(jobId, message) {
    if (!message) return;
    const time = new Date().toISOString();
    const lines = String(message).split(/\r?\n/).filter((line) => line.trim().length > 0);
    for (const line of lines) {
      const entry = {
        timestamp: time,
        jobId,
        message: line
      };
      const formatted = `${entry.timestamp} [${entry.jobId}] ${entry.message}`;
      this.logStream.write(`${formatted}\n`);
      this.recentLogs.push(entry);
      if (this.recentLogs.length > this.maxRecentLogs) {
        this.recentLogs.shift();
      }
      this.emit('log', entry);
    }
  }

  getJobStats() {
    const jobs = Array.from(this.jobs.values()).sort((a, b) => new Date(b.enqueuedAt) - new Date(a.enqueuedAt));
    return {
      queueLength: this.queue.length,
      activeJobs: this.activeJobs,
      maxConcurrentJobs: this.maxConcurrent,
      jobs
    };
  }

  getRecentLogs() {
    return [...this.recentLogs];
  }

  trimJobHistory() {
    while (this.jobOrder.length > this.maxTrackedJobs) {
      const oldestId = this.jobOrder.shift();
      const job = this.jobs.get(oldestId);
      if (!job) {
        continue;
      }
      if (job.status === 'queued' || job.status === 'running') {
        this.jobOrder.unshift(oldestId);
        break;
      }
      this.jobs.delete(oldestId);
    }
  }
}

function runYtDlp(args, onLog) {
  return new Promise((resolve, reject) => {
    const child = spawn(appConfig.download.ytDlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (data) => {
      const text = data.toString();
      onLog?.(`[stdout] ${text.trimEnd()}`);
    });
    child.stderr.on('data', (data) => {
      const text = data.toString();
      onLog?.(`[stderr] ${text.trimEnd()}`);
    });
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
