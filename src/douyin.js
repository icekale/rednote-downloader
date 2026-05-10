import crypto from 'node:crypto';

const DOUYIN_BASE_URL = 'https://www.douyin.com';
const DEFAULT_DOUYIN_TIMEOUT_MS = Number.parseInt(process.env.DOUYIN_REQUEST_TIMEOUT_MS || '30000', 10);
const DEFAULT_DOUYIN_USER_AGENT = process.env.DOUYIN_USER_AGENT
  || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const DOUYIN_SHARE_HOSTS = new Set([
  'douyin.com',
  'www.douyin.com',
  'v.douyin.com',
  'v.iesdouyin.com',
  'iesdouyin.com',
  'www.iesdouyin.com',
]);

const DOUYIN_SHORT_HOSTS = new Set([
  'v.douyin.com',
  'v.iesdouyin.com',
  'iesdouyin.com',
  'www.iesdouyin.com',
]);

const DETAIL_AID_CANDIDATES = ['6383', '1128'];
const X_BOGUS_CHARACTER = 'Dkdpgh4ZKsQB80/Mfvw36XI1R25-WUAlEi7NLboqYTOPuzmFjJnryx9HVGcaStCe=';
const HEX_TO_INT = Array.from({ length: 128 }, () => null);
for (let index = 0; index <= 9; index += 1) {
  HEX_TO_INT[48 + index] = index;
}
for (let index = 0; index <= 5; index += 1) {
  HEX_TO_INT[97 + index] = index + 10;
}

export function isDouyinShareHost(hostname) {
  return DOUYIN_SHARE_HOSTS.has(String(hostname || '').toLowerCase());
}

export function isDouyinShortHost(hostname) {
  return DOUYIN_SHORT_HOSTS.has(String(hostname || '').toLowerCase());
}

export function isDouyinMediaHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'www.douyin.com'
    || host.endsWith('.douyin.com')
    || host.endsWith('.douyinvod.com')
    || host.endsWith('.douyinpic.com')
    || host.endsWith('.douyinstatic.com')
    || host.endsWith('.byteimg.com')
    || host.endsWith('.bytedance.com')
    || host.endsWith('.bytedanceapi.com');
}

function md5Hex(input) {
  const source = Array.isArray(input) ? Buffer.from(input) : Buffer.from(String(input), 'latin1');
  return crypto.createHash('md5').update(source).digest('hex');
}

function md5StringToArray(value) {
  if (typeof value === 'string' && value.length > 32) {
    return [...value].map((char) => char.charCodeAt(0));
  }

  const result = [];
  for (let index = 0; index < value.length; index += 2) {
    const high = HEX_TO_INT[value.charCodeAt(index)];
    const low = HEX_TO_INT[value.charCodeAt(index + 1)];
    result.push((high << 4) | low);
  }
  return result;
}

function md5Encrypt(urlPath) {
  return md5StringToArray(md5Hex(md5StringToArray(md5Hex(urlPath))));
}

function rc4Encrypt(key, data) {
  const keyBytes = Buffer.from(key, 'latin1');
  const dataBytes = Buffer.from(data, 'latin1');
  const state = Array.from({ length: 256 }, (_, index) => index);
  const encrypted = [];
  let j = 0;

  for (let i = 0; i < 256; i += 1) {
    j = (j + state[i] + keyBytes[i % keyBytes.length]) % 256;
    [state[i], state[j]] = [state[j], state[i]];
  }

  let i = 0;
  j = 0;
  for (const byte of dataBytes) {
    i = (i + 1) % 256;
    j = (j + state[i]) % 256;
    [state[i], state[j]] = [state[j], state[i]];
    encrypted.push(byte ^ state[(state[i] + state[j]) % 256]);
  }

  return encrypted;
}

function xBogusEncodingConversion(values) {
  const [a, b, c, e, d, t, f, r, n, o, i, underscore, x, u, s, l, v, h, p] = values;
  return String.fromCharCode(
    a,
    i,
    b,
    underscore,
    c,
    x,
    e,
    u,
    d,
    s,
    t,
    l,
    f,
    v,
    r,
    h,
    n,
    p,
    o,
  );
}

function xBogusCalculation(a, b, c) {
  const packed = ((a & 255) << 16) | ((b & 255) << 8) | (c & 255);
  return X_BOGUS_CHARACTER[(packed & 16515072) >> 18]
    + X_BOGUS_CHARACTER[(packed & 258048) >> 12]
    + X_BOGUS_CHARACTER[(packed & 4032) >> 6]
    + X_BOGUS_CHARACTER[packed & 63];
}

// Minimal Node port of jiji262/douyin-downloader's X-Bogus signer (MIT License).
export function generateXBogus(url, options = {}) {
  const userAgent = options.userAgent || DEFAULT_DOUYIN_USER_AGENT;
  const now = Number.isInteger(options.now) ? options.now : Math.floor(Date.now() / 1000);
  const uaEncrypted = rc4Encrypt('\x00\x01\x0c', userAgent);
  const uaBase64 = Buffer.from(uaEncrypted).toString('base64');
  const uaMd5Array = md5StringToArray(md5Hex(uaBase64));
  const emptyMd5Array = md5StringToArray(md5Hex(md5StringToArray('d41d8cd98f00b204e9800998ecf8427e')));
  const urlMd5Array = md5Encrypt(url);
  const ct = 536919696;
  const values = [
    64,
    0,
    1,
    12,
    urlMd5Array[14],
    urlMd5Array[15],
    emptyMd5Array[14],
    emptyMd5Array[15],
    uaMd5Array[14],
    uaMd5Array[15],
    (now >> 24) & 255,
    (now >> 16) & 255,
    (now >> 8) & 255,
    now & 255,
    (ct >> 24) & 255,
    (ct >> 16) & 255,
    (ct >> 8) & 255,
    ct & 255,
  ];

  const checksum = values.reduce((acc, value) => acc ^ value, values[0]);
  values.push(checksum);

  const odd = [];
  const even = [];
  for (let index = 0; index < values.length; index += 2) {
    odd.push(values[index]);
    if (index + 1 < values.length) {
      even.push(values[index + 1]);
    }
  }

  const garbledPayload = xBogusEncodingConversion([...odd, ...even]);
  const garbled = [
    2,
    255,
    ...rc4Encrypt('ÿ', garbledPayload),
  ];

  let xBogus = '';
  for (let index = 0; index < garbled.length; index += 3) {
    xBogus += xBogusCalculation(garbled[index], garbled[index + 1], garbled[index + 2]);
  }

  return {
    signedUrl: `${url}&X-Bogus=${xBogus}`,
    xBogus,
    userAgent,
  };
}

function buildQuery(params) {
  return new URLSearchParams(params).toString();
}

function buildDefaultQuery(options = {}) {
  return {
    device_platform: 'webapp',
    aid: options.aid || '6383',
    channel: 'channel_pc_web',
    update_version_code: '170400',
    pc_client_type: '1',
    version_code: '290100',
    version_name: '29.1.0',
    cookie_enabled: 'true',
    screen_width: '1920',
    screen_height: '1080',
    browser_language: 'zh-CN',
    browser_platform: 'Win32',
    browser_name: 'Chrome',
    browser_version: '131.0.0.0',
    browser_online: 'true',
    engine_name: 'Blink',
    engine_version: '131.0.0.0',
    os_name: 'Windows',
    os_version: '10',
    cpu_core_num: '12',
    device_memory: '8',
    platform: 'PC',
    downlink: '10',
    effective_type: '4g',
    round_trip_time: '100',
    msToken: options.msToken || '',
  };
}

function buildSignedDouyinUrl(path, params, options = {}) {
  const unsignedUrl = `${DOUYIN_BASE_URL}${path}?${buildQuery(params)}`;
  return generateXBogus(unsignedUrl, options);
}

export function buildDouyinAwemeDetailUrl(awemeId, options = {}) {
  const params = {
    ...buildDefaultQuery(options),
    aweme_id: awemeId,
    aid: options.aid || '6383',
  };
  return buildSignedDouyinUrl('/aweme/v1/web/aweme/detail/', params, options);
}

function buildDouyinPlayUrl(videoId, options = {}) {
  const params = {
    video_id: videoId,
    ratio: '1080p',
    line: '0',
    is_play_url: '1',
    watermark: '0',
    source: 'PackSourceEnum_PUBLISH',
  };
  return buildSignedDouyinUrl('/aweme/v1/play/', params, options);
}

export function extractDouyinAwemeId(input) {
  const value = String(input || '');
  const videoMatch = value.match(/\/video\/(\d{15,25})(?:[/?#]|$)/);
  if (videoMatch?.[1]) {
    return videoMatch[1];
  }

  const modalMatch = value.match(/[?&]modal_id=(\d{15,25})(?:&|$)/);
  return modalMatch?.[1] || null;
}

function normalizeInputUrl(input) {
  const value = String(input || '').trim();
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  if (/^(?:v\.)?(?:ies)?douyin\.com\//i.test(value)) {
    return `https://${value}`;
  }
  return value;
}

export function ensureDouyinShareUrl(input) {
  const url = input instanceof URL ? input : new URL(normalizeInputUrl(input));
  if (!isDouyinShareHost(url.hostname)) {
    throw new Error(`Unsupported Douyin host: ${url.hostname}`);
  }
  return url;
}

export async function resolveDouyinShareUrl(input, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_DOUYIN_TIMEOUT_MS;
  let current = ensureDouyinShareUrl(input);

  for (let hop = 0; hop < 8; hop += 1) {
    if (!isDouyinShortHost(current.hostname) && extractDouyinAwemeId(current.toString())) {
      return current;
    }

    const response = await fetchImpl(current, {
      headers: buildDouyinHeaders(current, options.cookie, options.userAgent),
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`Douyin redirect without location from ${current}`);
      }
      current = ensureDouyinShareUrl(new URL(location, current));
      continue;
    }

    if (!response.ok) {
      throw new Error(`Failed to resolve Douyin share URL: ${response.status}`);
    }

    const html = await response.text();
    const redirectMatch = html.match(/(?:location\.href|location\.replace)\s*(?:=|\()\s*['"]([^'"]+)['"]/i);
    if (redirectMatch?.[1]) {
      current = ensureDouyinShareUrl(new URL(redirectMatch[1], current));
      continue;
    }

    if (extractDouyinAwemeId(current.toString())) {
      return current;
    }

    break;
  }

  throw new Error('Unable to resolve Douyin single video URL');
}

function collectUrls(source) {
  if (Array.isArray(source)) {
    return source.filter((item) => typeof item === 'string' && item);
  }
  if (source && typeof source === 'object') {
    const list = source.url_list || source.urlList;
    if (Array.isArray(list)) {
      return list.filter((item) => typeof item === 'string' && item);
    }
  }
  if (typeof source === 'string' && source) {
    return [source];
  }
  return [];
}

function firstUrl(source) {
  return collectUrls(source)[0] || '';
}

function isWatermarkedUrl(url) {
  const normalized = String(url || '').toLowerCase();
  return [
    'tplv-dy-water',
    'dy-water',
    'owner_watermark',
    'watermark_image',
    'watermark=1',
    'playwm',
  ].some((hint) => normalized.includes(hint));
}

function candidateFromUrl(url) {
  if (!url) {
    return null;
  }
  return {
    url,
    watermarked: isWatermarkedUrl(url),
  };
}

function pickHighestQualityPlayAddr(video = {}) {
  const bitRates = Array.isArray(video?.bit_rate) ? video.bit_rate : [];
  let best = null;
  let bestScore = -1;

  for (const entry of bitRates) {
    const playAddr = entry?.play_addr;
    if (!playAddr || typeof playAddr !== 'object') {
      continue;
    }

    const bitrate = Number.parseInt(entry.bit_rate || '0', 10) || 0;
    const width = Number.parseInt(playAddr.width || entry.width || '0', 10) || 0;
    const score = (bitrate * 10_000) + width;
    if (score > bestScore) {
      best = playAddr;
      bestScore = score;
    }
  }

  return best;
}

function pickCandidateFromSources(sources) {
  const candidates = [];
  for (const source of sources) {
    for (const url of collectUrls(source)) {
      candidates.push(candidateFromUrl(url));
    }
  }

  const valid = candidates.filter(Boolean);
  return valid.find((item) => !item.watermarked) || valid[0] || null;
}

export function pickDouyinVideoCandidate(video = {}, options = {}) {
  const preferred = pickCandidateFromSources([
    pickHighestQualityPlayAddr(video),
    video.play_addr,
  ]);

  if (preferred && !preferred.watermarked) {
    return preferred;
  }

  const uri = video?.play_addr?.uri || video?.vid || video?.download_addr?.uri;
  if (uri) {
    const { signedUrl, userAgent } = buildDouyinPlayUrl(uri, options);
    return {
      url: signedUrl,
      watermarked: false,
      headers: {
        'User-Agent': userAgent,
      },
    };
  }

  return preferred;
}

function pickCoverUrl(video = {}) {
  return firstUrl(video.cover)
    || firstUrl(video.origin_cover)
    || firstUrl(video.dynamic_cover)
    || '';
}

function buildWarning(candidate) {
  return candidate?.watermarked
    ? ['Only a likely watermarked Douyin video URL was available; downloaded media may still contain a visible watermark.']
    : [];
}

export function parseDouyinAwemeDetail(payload, resolvedUrl, options = {}) {
  const aweme = payload?.aweme_detail || payload?.awemeDetail || payload;
  if (!aweme || typeof aweme !== 'object') {
    throw new Error('Douyin detail response did not include aweme_detail');
  }

  const awemeId = aweme.aweme_id || extractDouyinAwemeId(resolvedUrl);
  if (!awemeId) {
    throw new Error('Unable to extract Douyin aweme_id');
  }

  if (aweme.image_post_info || aweme.images || aweme.image_list) {
    throw new Error('Only Douyin single video posts are supported in this version');
  }

  const candidate = pickDouyinVideoCandidate(aweme.video || {}, options);
  if (!candidate?.url) {
    throw new Error('No downloadable Douyin video URL found');
  }

  const description = String(aweme.desc || '').trim();
  const author = aweme.author && typeof aweme.author === 'object' ? aweme.author : {};
  const media = {
    index: 1,
    type: 'video',
    url: candidate.url,
    thumbnailUrl: pickCoverUrl(aweme.video || {}),
    fallbackUrls: [],
  };

  if (candidate.headers) {
    media.headers = candidate.headers;
  }

  return {
    noteId: String(awemeId),
    title: description || `Douyin ${awemeId}`,
    description,
    type: 'video',
    author: {
      nickname: author.nickname || author.short_id || '',
      userId: author.uid || author.sec_uid || '',
    },
    media: [media],
    warnings: buildWarning(candidate),
  };
}

export function buildDouyinHeaders(target, cookie, userAgent = DEFAULT_DOUYIN_USER_AGENT) {
  const url = target instanceof URL ? target : new URL(target);
  return {
    Accept: url.pathname.includes('/aweme/v1/')
      ? 'application/json,text/plain,*/*'
      : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
    Referer: 'https://www.douyin.com/',
    Origin: 'https://www.douyin.com',
    'User-Agent': userAgent,
    ...(cookie ? { Cookie: cookie } : {}),
  };
}

async function fetchDouyinDetail(awemeId, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_DOUYIN_TIMEOUT_MS;
  const errors = [];

  for (const aid of DETAIL_AID_CANDIDATES) {
    const signed = buildDouyinAwemeDetailUrl(awemeId, { ...options, aid });

    try {
      const response = await fetchImpl(signed.signedUrl, {
        headers: buildDouyinHeaders(signed.signedUrl, options.cookie, signed.userAgent),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        errors.push(`Douyin detail request failed (${response.status})`);
        continue;
      }
      if (payload?.aweme_detail) {
        return {
          payload,
          signedUrl: signed.signedUrl,
        };
      }
      const reason = payload?.filter_detail?.filter_reason || payload?.status_msg || 'missing aweme_detail';
      errors.push(`Douyin detail response rejected (${reason})`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors[0] || 'Douyin detail request failed');
}

export async function resolveDouyinNote(input, options = {}) {
  const resolvedUrl = await resolveDouyinShareUrl(input, options);
  const awemeId = extractDouyinAwemeId(resolvedUrl.toString());
  if (!awemeId) {
    throw new Error('Unable to extract Douyin aweme_id from the single video URL');
  }

  const { payload } = await fetchDouyinDetail(awemeId, options);
  const parsed = parseDouyinAwemeDetail(payload, resolvedUrl.toString(), options);

  return {
    resolvedUrl: resolvedUrl.toString(),
    ...parsed,
  };
}
