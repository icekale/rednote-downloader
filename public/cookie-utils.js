export const COOKIE_STORAGE_KEY = 'rednote-downloader.cookie';

function normalizeLineEndings(text) {
  return String(text || '').replace(/\r\n/g, '\n').trim();
}

function looksLikeJson(text) {
  const normalized = normalizeLineEndings(text);
  return normalized.startsWith('{') || normalized.startsWith('[');
}

function sanitizeCookieValue(text) {
  return String(text || '')
    .replace(/\s*;\s*/g, '; ')
    .replace(/^\s+|\s+$/g, '')
    .replace(/;{2,}/g, ';')
    .replace(/;\s*$/g, '');
}

function uniquePairs(pairs) {
  const map = new Map();

  for (const pair of pairs) {
    if (!pair?.name) {
      continue;
    }
    map.set(pair.name, pair.value ?? '');
  }

  return [...map.entries()].map(([name, value]) => ({ name, value }));
}

function parseCookieHeader(text) {
  const source = sanitizeCookieValue(text);
  const segments = source
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean);

  const pairs = segments
    .map((segment) => {
      const separator = segment.indexOf('=');
      if (separator <= 0) {
        return null;
      }

      return {
        name: segment.slice(0, separator).trim(),
        value: segment.slice(separator + 1).trim(),
      };
    })
    .filter(Boolean);

  return uniquePairs(pairs);
}

function parseNetscapeCookieFile(text) {
  const lines = normalizeLineEndings(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const pairs = [];

  for (const line of lines) {
    if (line.startsWith('#')) {
      continue;
    }

    const parts = line.split('\t');
    if (parts.length < 7) {
      continue;
    }

    const [, , , , , name, value] = parts;
    if (name) {
      pairs.push({ name, value });
    }
  }

  return uniquePairs(pairs);
}

function parseJsonCookieExport(text) {
  const parsed = JSON.parse(text);

  if (Array.isArray(parsed)) {
    const pairs = parsed
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }

        const name = item.name || item.key;
        const value = item.value;
        return name ? { name, value } : null;
      })
      .filter(Boolean);

    return uniquePairs(pairs);
  }

  if (parsed && Array.isArray(parsed.cookies)) {
    return uniquePairs(parsed.cookies.map((item) => ({
      name: item?.name || item?.key,
      value: item?.value,
    })));
  }

  if (parsed && typeof parsed === 'object') {
    return uniquePairs(
      Object.entries(parsed).map(([name, value]) => ({
        name,
        value: typeof value === 'string' ? value : JSON.stringify(value),
      })),
    );
  }

  return [];
}

export function pairsToCookieHeader(pairs) {
  return uniquePairs(pairs)
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
}

export function parseCookieText(text) {
  const normalized = normalizeLineEndings(text);
  if (!normalized) {
    return '';
  }

  let pairs = [];

  if (looksLikeJson(normalized)) {
    pairs = parseJsonCookieExport(normalized);
  } else if (normalized.includes('\t')) {
    pairs = parseNetscapeCookieFile(normalized);
  } else {
    pairs = parseCookieHeader(normalized);
  }

  const header = pairsToCookieHeader(pairs);
  if (header) {
    return header;
  }

  if (normalized.includes('=')) {
    return sanitizeCookieValue(normalized);
  }

  throw new Error('无法识别 Cookie 内容格式');
}
