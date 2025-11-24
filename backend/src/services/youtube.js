import axios from 'axios';
import OpenAI from 'openai';
import { appConfig } from '../config.js';

const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';
const DEFAULT_SYSTEM_PROMPT = [
  'You are an assistant that maps Spotify tracks to the exact YouTube video that best represents the same song.',
  'You may call the youtubeSearch tool up to the configured limit to inspect results.',
  'Only return a success when you are confident the audio and artist match the Spotify metadata.',
  'If you find only lyric and you exceded your search attempts pick the best lyric video available',
  'When you respond, output valid JSON with the following shape and nothing else:',
  '{',
  '  "status": "success" | "failure",',
  '  "videoId": "YouTube video id or null",',
  '  "reason": "Why you chose the video or why matching failed.",',
  '  "error": "null or a short machine friendly error message"',
  '}',
  'If you cannot find a trustworthy match, respond with status "failure", videoId null, and a concise error summary.'
].join(' ');

let cachedOpenAiClient = null;

function assertYoutubeConfigured() {
  if (!appConfig.youtube.apiKey) {
    throw new Error('YouTube API key missing. Set YOUTUBE_API_KEY.');
  }
}

function getLlmClient() {
  if (!appConfig.ai?.apiKey) {
    throw new Error('AI provider API key missing. Set AI_API_KEY or OPENAI_API_KEY.');
  }
  const provider = (appConfig.ai.provider || 'openai').toLowerCase();
  if (provider !== 'openai') {
    throw new Error(`Unsupported AI provider "${appConfig.ai.provider}". Only "openai" is supported right now.`);
  }
  if (!cachedOpenAiClient) {
    cachedOpenAiClient = new OpenAI({
      apiKey: appConfig.ai.apiKey
    });
  }
  return cachedOpenAiClient;
}

export function buildTrackQuery(track) {
  if (!track) return '';
  const artist = track.artists?.[0] || '';
  return `${artist} ${track.name}`.trim();
}

export async function resolveYoutubeTrack(track, options = {}) {
  if (!track) {
    throw new Error('Spotify track metadata is required');
  }
  const logger = typeof options.onLog === 'function' ? options.onLog : () => {};
  if (!appConfig.ai?.apiKey) {
    const message = 'AI configuration missing. Falling back to simple YouTube search.';
    console.warn(message);
    logger(message);
    return fallbackSimpleSearch(track, logger);
  }
  try {
    return await runAgentWorkflow(track, logger);
  } catch (error) {
    logger(`AI workflow error: ${error.message || 'Unknown error'}`);
    return {
      status: 'failure',
      videoId: null,
      attempts: 0,
      reason: 'LLM workflow failed',
      error: error.message || 'Unknown AI search error'
    };
  }
}

async function runAgentWorkflow(track, logger = () => {}) {
  const client = getLlmClient();
  const systemPrompt = (appConfig.ai.youtubeSearch?.systemPrompt || '').trim() || DEFAULT_SYSTEM_PROMPT;
  const maxAttempts = Math.max(1, Number(appConfig.ai.youtubeSearch?.maxAttempts) || 3);
  const messages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: describeTrackForPrompt(track, maxAttempts) }
  ];
  const tools = [buildYoutubeToolSchema()];
  let searchAttempts = 0;
  let turns = 0;
  const maxTurns = maxAttempts + 3;
  logger(`AI resolver started (max ${maxAttempts} youtubeSearch calls).`);
  while (turns < maxTurns) {
    turns += 1;
    const response = await client.chat.completions.create({
      model: appConfig.ai.model,
      temperature: 1,
      messages,
      tools,
      tool_choice: 'auto'
    });
    const [choice] = response.choices || [];
    if (!choice) {
      throw new Error('AI response did not include any choices');
    }
    const { message } = choice;
    if (message?.tool_calls?.length) {
      messages.push(message);
      for (const toolCall of message.tool_calls) {
        if (toolCall.function?.name !== 'youtubeSearch') {
          continue;
        }
        if (searchAttempts >= maxAttempts) {
          logger(`AI requested youtubeSearch but limit (${maxAttempts}) already reached.`);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              attempt: searchAttempts,
              error: `Search attempt limit (${maxAttempts}) reached`
            })
          });
          continue;
        }
        const args = safeJsonParse(toolCall.function.arguments) || {};
        const query = (args.query || '').trim();
        if (!query) {
          logger('AI attempted youtubeSearch without a query string.');
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({
              attempt: searchAttempts + 1,
              error: 'youtubeSearch requires a non-empty query string',
              results: []
            })
          });
          continue;
        }
        searchAttempts += 1;
        const attemptLabel = `Attempt ${searchAttempts}/${maxAttempts}`;
        logger(`${attemptLabel}: youtubeSearch for "${query}"${describeSearchArgs(args)}.`);
        const searchPayload = await invokeYoutubeSearch({
          query,
          order: args.order,
          maxResults: args.maxResults,
          videoDuration: args.videoDuration,
          publishedAfter: args.publishedAfter,
          channelId: args.channelId
        });
        if (searchPayload.error) {
          logger(`${attemptLabel} error: ${searchPayload.error}`);
        } else {
          const first = searchPayload.results?.[0];
          if (first) {
            logger(`${attemptLabel}: ${searchPayload.results.length} result(s), top "${first.title}" (${first.videoId}).`);
          } else {
            logger(`${attemptLabel}: no results returned.`);
          }
        }
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify({
            attempt: searchAttempts,
            query,
            ...searchPayload
          })
        });
      }
      continue;
    }

    if (message) {
      messages.push(message);
    }
    const structured = safeJsonParse(message?.content);
    if (!structured) {
      logger('AI response could not be parsed as JSON.');
      throw new Error('AI response could not be parsed as JSON');
    }
    const result = normalizeAgentResult(structured, searchAttempts);
    if (result.status === 'success' && !result.videoId) {
      logger('AI returned status=success but no videoId.');
      return {
        status: 'failure',
        videoId: null,
        attempts: searchAttempts,
        reason: result.reason || 'AI omitted the video id',
        error: 'Missing video id in AI result'
      };
    }
    if (result.status === 'success') {
      logger(`AI selected video ${result.videoId}${result.reason ? ` — ${result.reason}` : ''}`);
    } else {
      logger(`AI failed to match track${result.reason ? ` — ${result.reason}` : ''}`);
    }
    return result;
  }

  throw new Error('AI workflow exceeded allowed number of turns');
}

async function fallbackSimpleSearch(track, logger = () => {}) {
  const query = buildTrackQuery(track);
  if (!query) {
    return {
      status: 'failure',
      videoId: null,
      attempts: 0,
      reason: 'Cannot build YouTube query from track metadata',
      error: 'Missing artist or track name'
    };
  }
  logger(`Fallback simple YouTube search for "${query}".`);
  const payload = await invokeYoutubeSearch({ query });
  const [first] = payload.results || [];
  if (!first) {
    logger(`Fallback search found no results. Error: ${payload.error || 'none'}.`);
    return {
      status: 'failure',
      videoId: null,
      attempts: 1,
      reason: `No YouTube results for "${query}"`,
      error: payload.error || 'No YouTube results'
    };
  }
  logger(`Fallback search picked "${first.title}" (${first.videoId}).`);
  return {
    status: 'success',
    videoId: first.videoId,
    attempts: 1,
    reason: `Selected top YouTube hit for "${query}"`,
    error: null,
    details: { title: first.title, channelTitle: first.channelTitle }
  };
}

function buildYoutubeToolSchema() {
  return {
    type: 'function',
    function: {
      name: 'youtubeSearch',
      description: 'Search YouTube for potential matches. Provide precise queries and optional filters to steer the results.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search string that should include artist names, song title, and any disambiguating context.'
          },
          maxResults: {
            type: 'integer',
            minimum: 1,
            maximum: 10,
            description: 'How many candidates to return (default comes from server config).'
          },
          order: {
            type: 'string',
            enum: ['date', 'rating', 'relevance', 'title', 'viewCount'],
            description: 'Change ranking strategy when relevance fails.'
          },
          videoDuration: {
            type: 'string',
            enum: ['any', 'short', 'medium', 'long'],
            description: 'Filter by video duration (YouTube buckets).'
          },
          publishedAfter: {
            type: 'string',
            description: 'ISO8601 timestamp to avoid older uploads when looking for a new release.'
          },
          channelId: {
            type: 'string',
            description: 'Restrict results to a specific channel if needed.'
          }
        },
        required: ['query']
      }
    }
  };
}

async function invokeYoutubeSearch(options = {}) {
  const query = (options.query || '').trim();
  if (!query) {
    return { results: [], error: 'YouTube query is required' };
  }
  try {
    assertYoutubeConfigured();
  } catch (error) {
    return { results: [], error: error.message };
  }
  const {
    order,
    maxResults,
    videoDuration,
    publishedAfter,
    channelId
  } = options;
  const limit = clamp(Number(maxResults) || appConfig.youtube.maxResults || 3, 1, 10);
  const params = {
    key: appConfig.youtube.apiKey,
    part: 'snippet',
    type: 'video',
    q: query,
    maxResults: limit
  };
  if (order) params.order = order;
  if (videoDuration) params.videoDuration = videoDuration;
  if (publishedAfter) params.publishedAfter = publishedAfter;
  if (channelId) params.channelId = channelId;

  try {
    const { data } = await axios.get(YOUTUBE_SEARCH_URL, { params });
    const items = Array.isArray(data.items) ? data.items : [];
    return {
      results: items.map(formatYoutubeVideo),
      pageInfo: data.pageInfo || null,
      error: null
    };
  } catch (error) {
    const message = error.response?.data?.error?.message || error.response?.statusText || error.message || 'YouTube search failed';
    return {
      results: [],
      error: `YouTube API error: ${message}`
    };
  }
}

function formatYoutubeVideo(item = {}) {
  const snippet = item.snippet || {};
  return {
    videoId: item.id?.videoId || item.id,
    title: snippet.title || '',
    channelTitle: snippet.channelTitle || '',
    publishedAt: snippet.publishedAt || null,
    description: snippet.description || '',
    liveBroadcastContent: snippet.liveBroadcastContent || 'none',
    thumbnails: snippet.thumbnails || {}
  };
}

function describeTrackForPrompt(track, maxAttempts) {
  const payload = {
    title: track.name,
    artists: track.artists || [],
    album: track.album || null,
    releaseDate: track.releaseDate || track.albumReleaseDate || null,
    durationMs: track.durationMs || null,
    explicit: Boolean(track.explicit),
    popularity: track.popularity ?? null,
    trackNumber: track.track_number ?? track.trackNumber ?? null,
    discNumber: track.disc_number ?? track.discNumber ?? null,
    spotifyUrl: track.externalUrl || track.externalUrls?.spotify || track.spotifyUrl || null
  };
  return [
    'Identify a single YouTube video that matches this Spotify track. Avoid lyric videos, live versions, covers, interviews, or uploads from unrelated channels unless explicitly requested:',
    JSON.stringify(payload, null, 2),
    `You may call youtubeSearch up to ${maxAttempts} times.`
  ].join('\n');
}

function normalizeAgentResult(structured, attempts) {
  return {
    status: structured.status === 'success' ? 'success' : 'failure',
    videoId: structured.videoId || null,
    attempts,
    reason: structured.reason || structured.notes || '',
    error: structured.error || null
  };
}

function describeSearchArgs(args = {}) {
  const extras = [];
  if (args.order) extras.push(`order=${args.order}`);
  if (args.maxResults) extras.push(`maxResults=${args.maxResults}`);
  if (args.videoDuration) extras.push(`duration=${args.videoDuration}`);
  if (args.publishedAfter) extras.push(`publishedAfter=${args.publishedAfter}`);
  if (args.channelId) extras.push(`channelId=${args.channelId}`);
  if (extras.length === 0) {
    return '';
  }
  return ` (options: ${extras.join(', ')})`;
}

function safeJsonParse(payload) {
  if (!payload || typeof payload !== 'string') return null;
  const trimmed = payload.trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch (error) {
    const firstBrace = candidate.indexOf('{');
    const lastBrace = candidate.lastIndexOf('}');
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      return null;
    }
    try {
      return JSON.parse(candidate.slice(firstBrace, lastBrace + 1));
    } catch {
      return null;
    }
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
