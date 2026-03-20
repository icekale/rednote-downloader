import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const XHS_SHARE_HOSTS = new Set([
  'xhslink.com',
  'www.xhslink.com',
  'xiaohongshu.com',
  'www.xiaohongshu.com',
]);

const TWITTER_SHARE_HOSTS = new Set([
  'x.com',
  'www.x.com',
  'twitter.com',
  'www.twitter.com',
  'mobile.twitter.com',
]);

const MEDIA_HOST_SUFFIXES = [
  '.xhscdn.com',
  '.xiaohongshu.com',
  '.twimg.com',
];

const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.REQUEST_TIMEOUT_MS || '15000', 10);
const DEFAULT_MEDIA_TIMEOUT_MS = Number.parseInt(process.env.MEDIA_REQUEST_TIMEOUT_MS || '30000', 10);
const DEFAULT_TWITTER_TIMEOUT_MS = Number.parseInt(process.env.TWITTER_REQUEST_TIMEOUT_MS || '30000', 10);
const FIXTWITTER_API_BASE = process.env.FXTWITTER_API_BASE || 'https://api.fxtwitter.com';
const TWITTER_API_BASES = [
  FIXTWITTER_API_BASE,
  ...(process.env.TWITTER_FALLBACK_API_BASES || 'https://api.vxtwitter.com')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
].filter((value, index, list) => list.indexOf(value) === index);

export function extractFirstUrl(input) {
  if (typeof input !== 'string') {
    throw new Error('input must be a string');
  }

  const trimmed = input.trim();
  const match = trimmed.match(/https?:\/\/[^\s]+/i);
  if (!match) {
    throw new Error('No URL found in input');
  }

  return match[0].replace(/[)\]}>,.;!?]+$/g, '');
}

export function extractAllUrls(input) {
  if (typeof input !== 'string') {
    throw new Error('input must be a string');
  }

  const matches = input.match(/https?:\/\/[^\s]+/ig) || [];
  const seen = new Set();
  const urls = [];

  for (const rawMatch of matches) {
    const cleaned = rawMatch.replace(/[)\]}>,.;!?]+$/g, '');
    if (!cleaned || seen.has(cleaned)) {
      continue;
    }

    seen.add(cleaned);
    urls.push(cleaned);
  }

  if (!urls.length) {
    throw new Error('No URL found in input');
  }

  return urls;
}

export function sanitizeFileName(input, fallback = 'note') {
  const safe = String(input || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);

  return safe || fallback;
}

export function withWritablePathHint(error, targetPath) {
  if (!error || typeof error !== 'object') {
    return error;
  }

  const code = 'code' in error ? error.code : '';
  if (code !== 'EACCES' && code !== 'EPERM') {
    return error;
  }

  const wrapped = new Error(
    `Unable to write to ${targetPath}. Check the Docker bind mount permissions. `
      + 'For NAS or Unraid deployments, set PUID and PGID to a user that can write to the mapped data directory '
      + '(Unraid commonly uses 99:100 for nobody:users).',
  );

  wrapped.code = code;
  wrapped.cause = error;
  return wrapped;
}

function normalizeNoteText(input) {
  return String(input || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 48);
}

export function deriveNoteFileStem(title, description, fallback = 'note') {
  const normalizedTitle = normalizeNoteText(title);
  const normalizedDescription = normalizeNoteText(description);
  const genericTitle = /^X\s*@/i.test(normalizedTitle) || /^X\s+Post$/i.test(normalizedTitle);
  const candidate = normalizedDescription || (!genericTitle ? normalizedTitle : '') || fallback;
  return sanitizeFileName(candidate, fallback);
}

function isAllowedShareHost(hostname) {
  return XHS_SHARE_HOSTS.has(hostname) || TWITTER_SHARE_HOSTS.has(hostname);
}

function isTwitterShareHost(hostname) {
  return TWITTER_SHARE_HOSTS.has(hostname);
}

function isAllowedMediaHost(hostname) {
  return MEDIA_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));
}

function ensureAllowedShareUrl(input) {
  const url = input instanceof URL ? input : new URL(input);
  if (!isAllowedShareHost(url.hostname)) {
    throw new Error(`Unsupported host: ${url.hostname}`);
  }
  return url;
}

export function ensureAllowedMediaUrl(input) {
  const url = input instanceof URL ? input : new URL(input);
  if (!isAllowedMediaHost(url.hostname)) {
    throw new Error(`Unsupported media host: ${url.hostname}`);
  }
  return url;
}

function extractTweetIdFromUrl(tweetUrl) {
  const match = tweetUrl.match(/\/status\/(\d+)/);
  return match?.[1] || null;
}

function extractTwitterScreenName(tweetUrl) {
  const match = tweetUrl.pathname.match(/^\/([^/]+)\/status\/\d+/);
  return match?.[1] || null;
}

export function buildFixTwitterApiUrl(input, apiBase = FIXTWITTER_API_BASE) {
  const shareUrl = ensureAllowedShareUrl(input instanceof URL ? input : extractFirstUrl(input));
  const tweetId = extractTweetIdFromUrl(shareUrl.toString());
  if (!tweetId) {
    throw new Error('Unable to extract X/Twitter status ID from URL');
  }

  const screenName = extractTwitterScreenName(shareUrl);
  const root = apiBase.replace(/\/$/, '');
  const path = screenName
    ? `/${encodeURIComponent(screenName)}/status/${tweetId}`
    : `/status/${tweetId}`;

  return `${root}${path}`;
}

export function normalizeTwitterPhotoUrl(input) {
  const url = new URL(input);

  if (url.hostname.endsWith('.twimg.com')) {
    if (url.searchParams.has('format')) {
      url.searchParams.set('name', 'orig');
      return url.toString();
    }

    if (url.pathname.includes('/media/')) {
      url.searchParams.set('name', 'orig');
      return url.toString();
    }
  }

  return url.toString();
}

function pickBestTwitterVideoUrl(video) {
  const mp4Candidates = [
    ...(Array.isArray(video?.formats) ? video.formats : []),
    ...(Array.isArray(video?.variants)
      ? video.variants.map((variant) => ({
          url: variant?.url,
          bitrate: variant?.bitrate,
          container: variant?.content_type?.includes('mp4') ? 'mp4' : variant?.content_type,
        }))
      : []),
  ]
    .filter((item) => item?.url && item?.container === 'mp4')
    .sort((left, right) => (right.bitrate || 0) - (left.bitrate || 0));

  return mp4Candidates[0]?.url || video?.url || null;
}

export function extractTwitterMedia(tweet) {
  const mediaPool = Array.isArray(tweet?.media?.all)
    ? tweet.media.all
    : [
        ...(Array.isArray(tweet?.media?.photos) ? tweet.media.photos : []),
        ...(Array.isArray(tweet?.media?.videos) ? tweet.media.videos : []),
      ];

  return mediaPool
    .map((item, index) => {
      if (!item) {
        return null;
      }

      if (item.type === 'photo') {
        return {
          index: index + 1,
          type: 'image',
          url: normalizeTwitterPhotoUrl(item.url),
          width: item.width || null,
          height: item.height || null,
          altText: item.altText || '',
        };
      }

      if (item.type === 'video' || item.type === 'gif') {
        const url = pickBestTwitterVideoUrl(item);
        if (!url) {
          return null;
        }

        return {
          index: index + 1,
          type: 'video',
          url,
          thumbnailUrl: item.thumbnail_url || '',
          width: item.width || null,
          height: item.height || null,
          duration: item.duration || null,
          fallbackUrls: [
            item.url,
            ...(Array.isArray(item.formats) ? item.formats.map((format) => format?.url) : []),
          ].filter((candidate) => candidate && candidate !== url),
        };
      }

      return null;
    })
    .filter(Boolean);
}

export function parseTweetFromApiPayload(payload, fallbackUrl = '') {
  const tweet = payload?.tweet || (
    payload?.tweetID
      ? {
          id: payload.tweetID,
          url: payload.tweetURL || fallbackUrl,
          text: payload.text || '',
          author: {
            id: '',
            name: payload.user_name || payload.user_screen_name || '',
            screen_name: payload.user_screen_name || '',
          },
          media: {
            all: Array.isArray(payload.media_extended)
              ? payload.media_extended.map((item) => ({
                  type: item?.type === 'image' ? 'photo' : item?.type,
                  url: item?.url,
                  thumbnail_url: item?.thumbnail_url || '',
                  width: item?.size?.width || null,
                  height: item?.size?.height || null,
                  duration: typeof item?.duration_millis === 'number' ? item.duration_millis / 1000 : null,
                }))
              : [],
          },
        }
      : payload
  );
  if (!tweet || typeof tweet !== 'object') {
    throw new Error('Unable to parse X/Twitter API payload');
  }

  const media = extractTwitterMedia(tweet);
  if (media.length === 0) {
    throw new Error('No downloadable media found in X/Twitter post');
  }

  return {
    noteId: tweet.id || extractTweetIdFromUrl(fallbackUrl) || null,
    title: tweet.author?.screen_name ? `X @${tweet.author.screen_name}` : 'X Post',
    description: String(tweet.text || '').trim(),
    type: media.some((item) => item.type === 'video') ? 'video' : 'normal',
    author: {
      nickname: tweet.author?.name || tweet.author?.screen_name || '',
      userId: tweet.author?.id || '',
    },
    media,
  };
}

function buildHeaders(target, cookie) {
  const hostname = target
    ? (target instanceof URL ? target.hostname : new URL(target).hostname)
    : 'www.xiaohongshu.com';
  const referer = hostname.endsWith('.twimg.com') || isTwitterShareHost(hostname)
    ? 'https://x.com/'
    : 'https://www.xiaohongshu.com/';

  return {
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: referer,
    'User-Agent': process.env.XHS_USER_AGENT || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    ...(cookie && !hostname.endsWith('.twimg.com') && !isTwitterShareHost(hostname) ? { Cookie: cookie } : {}),
  };
}

function extractRedirectUrlFromHtml(html, currentUrl) {
  const patterns = [
    /window\.location(?:\.href)?\s*=\s*['"]([^'"]+)['"]/i,
    /window\.location\.replace\(\s*['"]([^'"]+)['"]\s*\)/i,
    /content=['"][^'"]*url=([^'"]+)['"]/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return new URL(match[1], currentUrl).toString();
    }
  }

  return null;
}

function cleanInitialStateJson(raw) {
  return raw
    .trim()
    .replace(/;+\s*$/, '')
    .replace(/\bundefined\b/g, 'null');
}

export function extractInitialState(html) {
  const match = html.match(/window\.__INITIAL_STATE__\s*=\s*(.*?)<\/script>/s);
  if (!match?.[1]) {
    throw new Error('Unable to extract window.__INITIAL_STATE__');
  }

  return JSON.parse(cleanInitialStateJson(match[1]));
}

function extractNoteIdFromUrl(noteUrl) {
  const match = noteUrl.match(/\/(?:explore|discovery\/item)\/([^/?]+)/);
  return match?.[1] || null;
}

function pickFirstObjectValue(value) {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const first = Object.values(value)[0];
  return first && typeof first === 'object' ? first : null;
}

export function getNoteData(state, noteUrl) {
  const noteData = state?.noteData?.data?.noteData;
  if (noteData) {
    return noteData;
  }

  const detailMap = state?.note?.noteDetailMap || state?.note?.detailMap;
  if (!detailMap) {
    return null;
  }

  const noteId = extractNoteIdFromUrl(noteUrl);
  if (noteId && detailMap[noteId]) {
    return detailMap[noteId].note || detailMap[noteId];
  }

  const firstEntry = pickFirstObjectValue(detailMap);
  return firstEntry?.note || firstEntry || null;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeImageUrl(url) {
  return typeof url === 'string' ? url.replace(/^http:\/\//i, 'https://') : null;
}

export function deriveOriginalImageUrl(url) {
  const normalized = normalizeImageUrl(url);
  if (!normalized) {
    return null;
  }

  const match = normalized.match(/https?:\/\/sns-webpic[^/]*\.xhscdn\.com\/\d+\/[0-9a-z]+\/([^!?]+)(?:!.*)?$/i);
  if (!match?.[1]) {
    return null;
  }

  return `https://ci.xiaohongshu.com/${match[1]}`;
}

function scoreImageCandidate(url) {
  const lower = url.toLowerCase();
  let score = 0;

  if (lower.includes('ci.xiaohongshu.com')) score += 100;
  if (lower.includes('original') || lower.includes('origin')) score += 50;
  if (lower.includes('wm')) score -= 200;
  if (lower.includes('prv') || lower.includes('preview')) score -= 30;
  if (lower.includes('dft')) score += 20;

  return score;
}

function collectImageCandidates(image) {
  const rawCandidates = [
    image?.urlDefault,
    image?.url,
    ...(Array.isArray(image?.infoList) ? image.infoList.map((item) => item?.url) : []),
    ...(Array.isArray(image?.urlInfoList) ? image.urlInfoList.map((item) => item?.url) : []),
  ];

  const normalized = unique(rawCandidates.map(normalizeImageUrl));
  const derived = unique(normalized.map(deriveOriginalImageUrl));
  return unique([...derived, ...normalized]);
}

export function extractImages(note) {
  const images = Array.isArray(note?.imageList) ? note.imageList : [];

  return images
    .map((image, index) => {
      const candidates = collectImageCandidates(image);
      const url = [...candidates].sort((a, b) => scoreImageCandidate(b) - scoreImageCandidate(a))[0];
      if (!url) {
        return null;
      }

      return {
        index: index + 1,
        type: 'image',
        url,
        fallbackUrls: candidates.filter((candidate) => candidate !== url),
      };
    })
    .filter(Boolean);
}

function scoreVideoCandidate(url) {
  const lower = url.toLowerCase();
  let score = 0;

  if (lower.includes('sns-video-bd.xhscdn.com')) score += 100;
  if (lower.endsWith('.mp4')) score += 50;
  if (lower.includes('h265')) score += 10;
  if (lower.endsWith('.m3u8')) score -= 20;

  return score;
}

export function extractVideo(note) {
  const originKey = note?.video?.consumer?.originVideoKey;
  const stream = note?.video?.media?.stream || {};
  const candidates = unique([
    originKey ? `https://sns-video-bd.xhscdn.com/${originKey}` : null,
    ...(Array.isArray(stream.h265) ? stream.h265.map((item) => item?.masterUrl || item?.backupUrl || item?.url) : []),
    ...(Array.isArray(stream.h264) ? stream.h264.map((item) => item?.masterUrl || item?.backupUrl || item?.url) : []),
  ]);

  const url = [...candidates].sort((a, b) => scoreVideoCandidate(b) - scoreVideoCandidate(a))[0];
  if (!url) {
    return null;
  }

  return {
    index: 1,
    type: 'video',
    url,
    fallbackUrls: candidates.filter((candidate) => candidate !== url),
  };
}

function extractHtmlTitle(html) {
  const match = html.match(/<title>(.*?)<\/title>/is);
  if (!match?.[1]) {
    return null;
  }

  return match[1].replace(/\s*-\s*小红书\s*$/u, '').trim();
}

function inferNoteType(note) {
  if (note?.type) {
    return note.type;
  }

  return note?.video ? 'video' : 'normal';
}

export function parseNoteFromHtml(html, noteUrl) {
  const state = extractInitialState(html);
  const note = getNoteData(state, noteUrl);

  if (!note) {
    throw new Error('Unable to locate note data in page state');
  }

  const type = inferNoteType(note);
  const media = type === 'video'
    ? [extractVideo(note)].filter(Boolean)
    : extractImages(note);

  if (media.length === 0) {
    throw new Error('No downloadable media found in note data');
  }

  return {
    noteId: note.noteId || extractNoteIdFromUrl(noteUrl),
    title: note.title || extractHtmlTitle(html) || 'Untitled RedNote Note',
    description: note.desc || '',
    type,
    author: {
      nickname: note.user?.nickname || note.author?.nickname || '',
      userId: note.user?.userId || note.author?.userId || '',
    },
    media,
  };
}

export async function fetchNotePage(input, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const headers = buildHeaders('https://www.xiaohongshu.com/', options.cookie || process.env.XHS_COOKIE);
  let current = ensureAllowedShareUrl(extractFirstUrl(input));

  for (let hop = 0; hop < 8; hop += 1) {
    const response = await fetch(current, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Redirect without location from ${current}`);
      }

      current = ensureAllowedShareUrl(new URL(location, current));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch note page: ${response.status}`);
    }

    const html = await response.text();
    const redirectUrl = extractRedirectUrlFromHtml(html, current);

    if (redirectUrl && redirectUrl !== current.toString()) {
      current = ensureAllowedShareUrl(redirectUrl);
      continue;
    }

    if (/captcha|验证|访问受限/i.test(html) && !html.includes('__INITIAL_STATE__')) {
      throw new Error('Xiaohongshu returned a verification or anti-bot page');
    }

    return {
      resolvedUrl: current.toString(),
      html,
    };
  }

  throw new Error('Too many redirects while resolving note URL');
}

async function fetchTweetData(input, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TWITTER_TIMEOUT_MS;
  const shareUrl = ensureAllowedShareUrl(extractFirstUrl(input));
  const apiBases = options.apiBase
    ? [options.apiBase]
    : TWITTER_API_BASES;
  const errors = [];

  for (const apiBase of apiBases) {
    const apiUrl = buildFixTwitterApiUrl(shareUrl, apiBase);

    try {
      const response = await fetch(apiUrl, {
        headers: buildHeaders(apiUrl),
        signal: AbortSignal.timeout(timeoutMs),
      });

      const payload = await response.json().catch(() => null);
      const success = response.ok && payload && (
        (payload.code === 200 && payload.tweet)
        || payload.tweetID
      );

      if (!success) {
        const reason = payload?.message || `X/Twitter resolve failed (${response.status})`;
        errors.push(`${new URL(apiBase).hostname}: ${reason}`);
        continue;
      }

      return {
        resolvedUrl: payload.tweet?.url || payload.tweetURL || shareUrl.toString(),
        payload,
      };
    } catch (error) {
      const label = new URL(apiBase).hostname;
      const reason = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`${label}: ${reason}`);
    }
  }

  throw new Error(errors[0] || 'X/Twitter resolve failed');
}

function inferExtension(url, contentType, fallback) {
  const lowerContentType = String(contentType || '').toLowerCase();
  const pathname = new URL(url).pathname.toLowerCase();

  const known = [
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/heic', 'heic'],
    ['video/mp4', 'mp4'],
    ['application/vnd.apple.mpegurl', 'm3u8'],
    ['application/x-mpegurl', 'm3u8'],
  ];

  for (const [type, extension] of known) {
    if (lowerContentType.includes(type)) {
      return extension;
    }
  }

  const extensionMatch = pathname.match(/\.([a-z0-9]{2,5})$/i);
  if (extensionMatch?.[1]) {
    return extensionMatch[1];
  }

  return fallback;
}

function buildDownloadedMediaFileName(item, baseName, extension, sequenceNumber, totalItems) {
  if (item.type === 'video' && totalItems <= 1) {
    return `${baseName}.${extension}`;
  }

  return `${baseName}_${String(sequenceNumber).padStart(2, '0')}.${extension}`;
}

async function downloadOneMedia(item, outputDir, baseName, cookie, timeoutMs, sequenceNumber, totalItems) {
  const candidates = [
    item.url,
    ...(Array.isArray(item.fallbackUrls) ? item.fallbackUrls : []),
  ].filter(Boolean);
  const uniqueCandidates = [...new Set(candidates)];
  const errors = [];
  let resolved = null;

  for (const candidate of uniqueCandidates) {
    try {
      resolved = await fetchMediaResponse(candidate, {
        cookie,
        timeoutMs,
      });
      break;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!resolved) {
    throw new Error(errors[0] || 'Failed to download media');
  }

  const { url, response } = resolved;

  const extension = inferExtension(url.toString(), response.headers.get('content-type'), item.type === 'video' ? 'mp4' : 'jpg');
  const fileName = buildDownloadedMediaFileName(item, baseName, extension, sequenceNumber, totalItems);
  const absolutePath = path.join(outputDir, fileName);

  try {
    await pipeline(Readable.fromWeb(response.body), createWriteStream(absolutePath));
  } catch (error) {
    throw withWritablePathHint(error, absolutePath);
  }

  return {
    ...item,
    url: url.toString(),
    fileName,
    absolutePath,
  };
}

export async function fetchMediaResponse(input, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_MEDIA_TIMEOUT_MS;
  const cookie = options.cookie || process.env.XHS_COOKIE;
  const extraHeaders = options.headers && typeof options.headers === 'object' ? options.headers : {};
  const url = ensureAllowedMediaUrl(input);
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort(new Error(`Media request timed out after ${timeoutMs}ms`));
  }, timeoutMs);

  let response;
  try {
    response = await fetch(url, {
      headers: {
        ...buildHeaders(url, cookie),
        ...extraHeaders,
      },
      redirect: 'follow',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download media: ${response.status} ${url}`);
  }

  return {
    url,
    response,
  };
}

export async function downloadMedia(media, noteTitle, noteId, downloadDir, options = {}) {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const cookie = options.cookie || process.env.XHS_COOKIE;
  const fileStem = deriveNoteFileStem(noteTitle, options.noteDescription, noteId || 'note');
  const safeDirName = sanitizeFileName(`${fileStem}_${noteId || 'unknown'}`);
  const outputDir = path.join(downloadDir, safeDirName);

  try {
    await mkdir(outputDir, { recursive: true });
  } catch (error) {
    throw withWritablePathHint(error, outputDir);
  }

  const baseName = fileStem;
  const results = [];

  for (const [itemIndex, item] of media.entries()) {
    const explicitIndex = Number(item?.index);
    const sequenceNumber = Number.isInteger(explicitIndex) && explicitIndex > 0
      ? explicitIndex
      : itemIndex + 1;
    results.push(await downloadOneMedia(item, outputDir, baseName, cookie, timeoutMs, sequenceNumber, media.length));
  }

  return {
    outputDir,
    files: results,
  };
}

export async function resolveNote(input, options = {}) {
  const shareUrl = ensureAllowedShareUrl(extractFirstUrl(input));

  if (isTwitterShareHost(shareUrl.hostname)) {
    const { resolvedUrl, payload } = await fetchTweetData(input, options);
    const parsed = parseTweetFromApiPayload(payload, resolvedUrl);

    return {
      resolvedUrl,
      ...parsed,
      warnings: [],
    };
  }

  const { resolvedUrl, html } = await fetchNotePage(input, options);
  const parsed = parseNoteFromHtml(html, resolvedUrl);
  const warnings = [];

  if (parsed.media.some((item) => item.type === 'video' && item.url.endsWith('.m3u8'))) {
    warnings.push('Video URL resolved to an HLS playlist (.m3u8); this service will save the playlist as-is unless Xiaohongshu exposes a direct mp4 URL.');
  }

  return {
    resolvedUrl,
    ...parsed,
    warnings,
  };
}
