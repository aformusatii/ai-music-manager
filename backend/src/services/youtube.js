import axios from 'axios';
import { appConfig } from '../config.js';

const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

function assertYoutubeConfigured() {
  if (!appConfig.youtube.apiKey) {
    throw new Error('YouTube API key missing. Set YOUTUBE_API_KEY.');
  }
}

export async function searchYoutubeVideos(query) {
  if (!query) return [];
  assertYoutubeConfigured();
  try {
    const { data } = await axios.get(YOUTUBE_SEARCH_URL, {
      params: {
        key: appConfig.youtube.apiKey,
        part: 'snippet',
        q: query,
        maxResults: appConfig.youtube.maxResults,
        type: 'video'
      }
    });
    return (data.items || []).map((item) => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || null
    }));
  } catch (error) {
    if (error.response) {
      throw new Error(`YouTube API error: ${error.response.data?.error?.message || error.response.statusText}`);
    }
    throw new Error('YouTube search failed. Check API key or network.');
  }
}

export function buildTrackQuery(track) {
  if (!track) return '';
  const artist = track.artists?.[0] || '';
  return `${artist} ${track.name}`.trim();
}
