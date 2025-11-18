import express from 'express';
import { downloadManager } from '../services/downloadManager.js';

export const downloadsRouter = express.Router();

downloadsRouter.get('/jobs', (req, res) => {
  res.json(downloadManager.getJobStats());
});

downloadsRouter.get('/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEntry = (entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };

  downloadManager.getRecentLogs().forEach(sendEntry);

  const listener = (entry) => sendEntry(entry);
  downloadManager.on('log', listener);

  const heartbeat = setInterval(() => {
    res.write(': keep-alive\n\n');
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    downloadManager.off('log', listener);
  });
});
