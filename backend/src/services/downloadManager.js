import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { appConfig } from '../config.js';
import { setDownloadStatus, getTrack } from '../db/tracks.js';
import { resolveYoutubeTrack } from './youtube.js';
import { processYoutubeDownload } from './youtubeDownloadProcessor.js';

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
    const { trackId } = job;
    const track = await getTrack(trackId);
    if (!track) {
      await setDownloadStatus(trackId, 'download_failed', { error: 'Track not found' });
      throw new Error('Track not found');
    }
    let videoId = job.videoId || track.youtubeVideoId;
    if (!videoId) {
      this.log(job.id, 'Resolving YouTube video via AI workflow');
      const searchResult = await resolveYoutubeTrack(track, {
        onLog: (message) => this.log(job.id, `[ai] ${message}`)
      });
      if (searchResult.status !== 'success' || !searchResult.videoId) {
        const errorMessage = searchResult.error || searchResult.reason || 'Unable to find matching YouTube video';
        await setDownloadStatus(trackId, 'download_failed', { error: errorMessage });
        throw new Error(errorMessage);
      }
      videoId = searchResult.videoId;
      job.videoId = videoId;
      const attemptNote = searchResult.attempts ? ` after ${searchResult.attempts} attempt(s)` : '';
      const reasonNote = searchResult.reason ? ` (${searchResult.reason})` : '';
      this.log(job.id, `Matched YouTube video ${videoId}${attemptNote}${reasonNote}`);
    } else {
      this.log(job.id, `Using provided YouTube video id ${videoId}`);
    }
    job.videoId = videoId;
    const result = await processYoutubeDownload({
      trackId,
      youtubeVideoId: videoId,
      logger: (line) => this.log(job.id, line)
    });
    job.filePath = result.filePath;
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

export const downloadManager = new DownloadManager();
