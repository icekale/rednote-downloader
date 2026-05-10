import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { inferMediaFileName, sanitizeFileName } from './shared/media-filenames.js';

const DEFAULT_EXTERNAL_DOUYIN_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_EXTERNAL_DOUYIN_POLL_INTERVAL_MS = 1500;
const TERMINAL_STATUSES = new Set(['success', 'failed']);

export function buildExternalDouyinConfig(env = process.env) {
  const internalEnabled = normalizeBoolean(env.DOUYIN_INTERNAL_DOWNLOADER_ENABLED, false);
  const downloadDir = normalizePath(env.DOWNLOAD_DIR) || '/data/downloads';
  const baseUrl = normalizeBaseUrl(env.DOUYIN_DOWNLOADER_BASE_URL)
    || (internalEnabled ? 'http://127.0.0.1:8000' : '');
  return {
    baseUrl,
    outputDir: normalizePath(env.DOUYIN_DOWNLOADER_OUTPUT_DIR)
      || (internalEnabled ? path.join(downloadDir, 'douyin') : ''),
    timeoutMs: normalizePositiveInt(
      env.DOUYIN_DOWNLOADER_TIMEOUT_MS,
      DEFAULT_EXTERNAL_DOUYIN_TIMEOUT_MS,
    ),
    pollIntervalMs: normalizePositiveInt(
      env.DOUYIN_DOWNLOADER_POLL_INTERVAL_MS,
      DEFAULT_EXTERNAL_DOUYIN_POLL_INTERVAL_MS,
    ),
  };
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function isExternalDouyinConfigured(config = buildExternalDouyinConfig()) {
  return Boolean(normalizeBaseUrl(config.baseUrl));
}

export async function downloadDouyinViaExternalService({
  input,
  note,
  config = buildExternalDouyinConfig(),
  cookie = '',
  fetchImpl = fetch,
} = {}) {
  const baseUrl = normalizeBaseUrl(config.baseUrl);
  if (!baseUrl) {
    throw new Error(
      'External Douyin downloader is not configured. Set DOUYIN_DOWNLOADER_BASE_URL to a running jiji262/douyin-downloader REST service.',
    );
  }

  const startedAt = Date.now();
  const job = await submitExternalDouyinJob({
    baseUrl,
    input,
    cookie,
    fetchImpl,
    timeoutMs: remainingTimeout(startedAt, config.timeoutMs),
  });
  const finalJob = await pollExternalDouyinJob({
    baseUrl,
    jobId: job.job_id,
    fetchImpl,
    startedAt,
    timeoutMs: config.timeoutMs,
    pollIntervalMs: config.pollIntervalMs,
  });

  if (String(finalJob.status || '').toLowerCase() !== 'success') {
    const reason = buildExternalFailureReason(finalJob);
    throw new Error(`External Douyin downloader job failed: ${reason}`);
  }

  const manifestMedia = await readLatestDouyinManifestMedia(config.outputDir).catch(() => null);

  return buildExternalDownloadResult({
    note,
    job: finalJob,
    outputDir: config.outputDir,
    manifestMedia,
  });
}

async function submitExternalDouyinJob({ baseUrl, input, cookie, fetchImpl, timeoutMs }) {
  const body = {
    url: input,
    ...(cookie ? { cookie } : {}),
  };
  const response = await fetchImpl(`${baseUrl}/api/v1/download`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const payload = await readJsonResponse(response, 'submit Douyin download job');

  if (!payload?.job_id) {
    throw new Error('External Douyin downloader did not return a job_id');
  }

  return payload;
}

async function pollExternalDouyinJob({
  baseUrl,
  jobId,
  fetchImpl,
  startedAt,
  timeoutMs,
  pollIntervalMs,
}) {
  let lastJob = null;

  while (Date.now() - startedAt <= timeoutMs) {
    const response = await fetchImpl(`${baseUrl}/api/v1/jobs/${encodeURIComponent(jobId)}`, {
      headers: {
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(remainingTimeout(startedAt, timeoutMs)),
    });
    const payload = await readJsonResponse(response, `poll Douyin download job ${jobId}`);
    lastJob = payload;

    const status = String(payload?.status || '').toLowerCase();
    if (TERMINAL_STATUSES.has(status)) {
      return payload;
    }

    await sleep(pollIntervalMs);
  }

  const status = lastJob?.status ? ` Last status: ${lastJob.status}.` : '';
  throw new Error(`External Douyin downloader timed out after ${timeoutMs}ms.${status}`);
}

async function readJsonResponse(response, action) {
  const text = await response.text();
  let payload = null;
  if (text) {
    payload = JSON.parse(text);
  }

  if (!response.ok) {
    const reason = payload?.detail || payload?.error || text || response.statusText;
    throw new Error(`External Douyin downloader failed to ${action}: ${response.status} ${reason}`);
  }

  return payload;
}

export async function readLatestDouyinManifestMedia(outputDir) {
  const root = normalizePath(outputDir);
  if (!root) {
    return null;
  }

  const manifestPath = path.join(root, 'download_manifest.jsonl');
  const raw = await readFile(manifestPath, 'utf8');
  const records = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const record = records.at(-1);

  if (!record || typeof record !== 'object') {
    return null;
  }

  const filePaths = Array.isArray(record.file_paths) ? record.file_paths : [];
  const fileNames = Array.isArray(record.file_names) ? record.file_names : [];
  const files = filePaths.map((relativePath, index) => {
    if (!relativePath || typeof relativePath !== 'string') {
      return null;
    }

    const absolutePath = path.resolve(root, relativePath);
    return {
      index: index + 1,
      type: inferManifestMediaType(record, absolutePath),
      url: '',
      localPath: absolutePath,
      fileName: fileNames[index] || path.basename(absolutePath),
      fallbackUrls: [],
    };
  }).filter(Boolean);

  return {
    note: {
      resolvedUrl: '',
      noteId: String(record.aweme_id || 'douyin'),
      title: record.desc || `Douyin ${record.aweme_id || ''}`.trim(),
      description: record.desc || '',
      type: record.media_type === 'gallery' ? 'normal' : 'video',
      author: {
        nickname: record.author_name || '',
        userId: '',
      },
      media: files,
      warnings: [],
    },
    files,
    record,
  };
}

function buildExternalDownloadResult({ note, job, outputDir, manifestMedia }) {
  const media = Array.isArray(manifestMedia?.files) && manifestMedia.files.length
    ? manifestMedia.files
    : Array.isArray(note?.media) ? note.media : [];
  const files = media.map((item, index) => {
    const baseName = sanitizeFileName(
      `${note?.title || 'douyin-video'}_${note?.noteId || job.job_id}`,
      'douyin-video',
    );
    const fileName = inferMediaFileName(item, null, index, {
      baseName,
      extension: item?.type === 'image' ? 'jpg' : 'mp4',
      totalItems: media.length || 1,
      fallbackBaseName: 'douyin-video',
    });

    return {
      ...item,
      fileName,
      externalJobId: job.job_id,
      externalStatus: job.status,
    };
  });

  return {
    outputDir: outputDir || `external:douyin-downloader:${job.job_id}`,
    external: {
      provider: 'jiji262/douyin-downloader',
      jobId: job.job_id,
      status: job.status,
      total: normalizeCount(job.total),
      success: normalizeCount(job.success),
      failed: normalizeCount(job.failed),
      skipped: normalizeCount(job.skipped),
      url: job.url || note?.resolvedUrl || '',
    },
    note: manifestMedia?.note || null,
    files,
  };
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim();
  return raw.replace(/\/+$/, '');
}

function normalizePath(value) {
  const raw = String(value || '').trim();
  return raw ? path.resolve(raw) : '';
}

function inferManifestMediaType(record, filePath) {
  if (record?.media_type === 'gallery') {
    return 'image';
  }

  const extension = path.extname(filePath).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)) {
    return 'image';
  }

  return 'video';
}

function buildExternalFailureReason(job) {
  if (job?.error) {
    return job.error;
  }

  const counters = ['total', 'success', 'failed', 'skipped']
    .filter((key) => key in (job || {}))
    .map((key) => `${key}=${normalizeCount(job[key])}`);
  return [
    `status=${job?.status || 'unknown'}`,
    ...counters,
  ].join(', ');
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeCount(value) {
  const parsed = Number.parseInt(value || '0', 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function remainingTimeout(startedAt, timeoutMs) {
  return Math.max(1, timeoutMs - (Date.now() - startedAt));
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function inferExternalDouyinOutputPath(downloadDir, jobId) {
  if (!downloadDir || !jobId) {
    return '';
  }

  return path.join(downloadDir, `douyin-downloader-${jobId}`);
}
