import express from 'express';
import { fetchArtistTracks, searchArtists } from '../services/spotify.js';

export const spotifyRouter = express.Router();

spotifyRouter.get('/search', async (req, res) => {
  const { query } = req.query;
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }
  try {
    const artists = await searchArtists(query);
    res.json({ artists });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

spotifyRouter.get('/artist/:id/tracks', async (req, res) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ error: 'Artist id is required' });
  }
  try {
    const tracks = await fetchArtistTracks(id);
    res.json({ tracks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
