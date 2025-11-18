import fs from 'node:fs';
import path from 'node:path';
import { Level } from 'level';
import { appConfig } from '../config.js';

fs.mkdirSync(path.dirname(appConfig.dbPath), { recursive: true });

export const db = new Level(appConfig.dbPath, { valueEncoding: 'json' });
export const tracksDb = db.sublevel('tracks', { valueEncoding: 'json' });
export const playlistsDb = db.sublevel('playlists', { valueEncoding: 'json' });
