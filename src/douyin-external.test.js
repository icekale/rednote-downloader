import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { test } from 'node:test';

import {
  buildExternalDouyinConfig,
  downloadDouyinViaExternalService,
  isExternalDouyinConfigured,
  readLatestDouyinManifestMedia,
} from './douyin-external.js';

test('detects external Douyin downloader REST configuration', () => {
  assert.equal(isExternalDouyinConfigured({}), false);
  assert.equal(isExternalDouyinConfigured({ baseUrl: 'http://127.0.0.1:8000' }), true);
  assert.equal(isExternalDouyinConfigured({ baseUrl: ' http://127.0.0.1:8000/ ' }), true);
});

test('builds external Douyin downloader config from environment', () => {
  const config = buildExternalDouyinConfig({
    DOUYIN_DOWNLOADER_BASE_URL: ' http://127.0.0.1:8000/ ',
    DOUYIN_DOWNLOADER_OUTPUT_DIR: ' /tmp/douyin-output ',
    DOUYIN_DOWNLOADER_POLL_INTERVAL_MS: '25',
    DOUYIN_DOWNLOADER_TIMEOUT_MS: '5000',
  });

  assert.equal(config.baseUrl, 'http://127.0.0.1:8000');
  assert.equal(config.outputDir, '/tmp/douyin-output');
  assert.equal(config.pollIntervalMs, 25);
  assert.equal(config.timeoutMs, 5000);
});

test('builds internal Douyin downloader defaults when bundled mode is enabled', () => {
  const config = buildExternalDouyinConfig({
    DOWNLOAD_DIR: '/data/downloads',
    DOUYIN_INTERNAL_DOWNLOADER_ENABLED: 'true',
  });

  assert.equal(config.baseUrl, 'http://127.0.0.1:8000');
  assert.equal(config.outputDir, '/data/downloads/douyin');
});

test('does not configure bundled Douyin downloader when disabled', () => {
  const config = buildExternalDouyinConfig({
    DOWNLOAD_DIR: '/data/downloads',
    DOUYIN_INTERNAL_DOWNLOADER_ENABLED: 'false',
  });

  assert.equal(config.baseUrl, '');
  assert.equal(config.outputDir, '');
});

test('prefers explicit external Douyin downloader settings over bundled defaults', () => {
  const config = buildExternalDouyinConfig({
    DOWNLOAD_DIR: '/data/downloads',
    DOUYIN_INTERNAL_DOWNLOADER_ENABLED: 'true',
    DOUYIN_DOWNLOADER_BASE_URL: 'http://192.168.1.10:8000',
    DOUYIN_DOWNLOADER_OUTPUT_DIR: '/mnt/douyin',
  });

  assert.equal(config.baseUrl, 'http://192.168.1.10:8000');
  assert.equal(config.outputDir, '/mnt/douyin');
});

test('reads the latest downloaded Douyin media from manifest', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'douyin-manifest-test-'));
  try {
    const mediaPath = path.join(tmpDir, 'Creator', 'Video 123', 'video.mp4');
    const manifestPath = path.join(tmpDir, 'download_manifest.jsonl');
    const staleRecord = {
      recorded_at: '2026-05-10T17:00:00',
      aweme_id: '111',
      desc: 'Old video',
      author_name: 'Old',
      media_type: 'video',
      file_names: ['old.mp4'],
      file_paths: ['Old/old.mp4'],
    };
    const latestRecord = {
      recorded_at: '2026-05-10T17:46:22',
      date: '2026-05-04',
      aweme_id: '7635800175809760552',
      author_name: 'Creator',
      desc: 'A downloaded Douyin video',
      media_type: 'video',
      file_names: ['video.mp4'],
      file_paths: ['Creator/Video 123/video.mp4'],
    };

    await writeFile(manifestPath, `${JSON.stringify(staleRecord)}\n${JSON.stringify(latestRecord)}\n`, 'utf8');
    await mkdir(path.dirname(mediaPath), { recursive: true });
    await writeFile(mediaPath, 'fake mp4', 'utf8');

    const media = await readLatestDouyinManifestMedia(tmpDir);

    assert.equal(media.note.noteId, '7635800175809760552');
    assert.equal(media.note.title, 'A downloaded Douyin video');
    assert.equal(media.note.author.nickname, 'Creator');
    assert.equal(media.files.length, 1);
    assert.equal(media.files[0].type, 'video');
    assert.equal(media.files[0].url, '');
    assert.equal(media.files[0].localPath, mediaPath);
    assert.equal(media.files[0].fileName, 'video.mp4');
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('submits and polls upstream Douyin downloader REST job', async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({
      url: url.toString(),
      method: options.method || 'GET',
      body: options.body || '',
    });

    if (url.toString() === 'http://127.0.0.1:8000/api/v1/download') {
      assert.equal(options.method, 'POST');
      assert.deepEqual(JSON.parse(options.body), {
        url: 'https://v.douyin.com/HCp2wHpDaYs/',
        cookie: 'ttwid=test',
      });
      return jsonResponse({
        job_id: 'job-1',
        status: 'pending',
        url: 'https://v.douyin.com/HCp2wHpDaYs/',
      });
    }

    if (url.toString() === 'http://127.0.0.1:8000/api/v1/jobs/job-1') {
      return jsonResponse({
        job_id: 'job-1',
        url: 'https://v.douyin.com/HCp2wHpDaYs/',
        status: calls.length < 3 ? 'running' : 'success',
        total: 1,
        success: calls.length < 3 ? 0 : 1,
        failed: 0,
        skipped: 0,
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await downloadDouyinViaExternalService({
    input: 'https://v.douyin.com/HCp2wHpDaYs/',
    note: {
      noteId: '7635800175809760552',
      title: 'Douyin Video',
      description: '',
      media: [{ index: 1, type: 'video', url: 'https://v3.douyinvod.com/video.mp4' }],
    },
    config: {
      baseUrl: 'http://127.0.0.1:8000',
      outputDir: '',
      pollIntervalMs: 1,
      timeoutMs: 1000,
    },
    cookie: 'ttwid=test',
    fetchImpl,
  });

  assert.equal(result.outputDir, 'external:douyin-downloader:job-1');
  assert.equal(result.external.provider, 'jiji262/douyin-downloader');
  assert.equal(result.external.jobId, 'job-1');
  assert.equal(result.external.status, 'success');
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].externalJobId, 'job-1');
  assert.equal(result.files[0].fileName, 'Douyin Video_7635800175809760552.mp4');
  assert.equal(calls.length, 3);
});

test('supports direct external download without a pre-resolved note', async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'douyin-direct-test-'));
  const fetchImpl = async (url) => {
    if (url.toString().endsWith('/api/v1/download')) {
      return jsonResponse({
        job_id: 'job-direct',
        status: 'pending',
        url: 'https://v.douyin.com/HCp2wHpDaYs/',
      });
    }

    if (url.toString().endsWith('/api/v1/jobs/job-direct')) {
      return jsonResponse({
        job_id: 'job-direct',
        url: 'https://v.douyin.com/HCp2wHpDaYs/',
        status: 'success',
        total: 1,
        success: 1,
        failed: 0,
        skipped: 0,
      });
    }

    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const mediaPath = path.join(tmpDir, 'Creator', 'Video 123', 'video.mp4');
    await mkdir(path.dirname(mediaPath), { recursive: true });
    await writeFile(
      path.join(tmpDir, 'download_manifest.jsonl'),
      `${JSON.stringify({
        recorded_at: '2026-05-10T17:46:22',
        aweme_id: '7635800175809760552',
        author_name: 'Creator',
        desc: 'A downloaded Douyin video',
        media_type: 'video',
        file_names: ['video.mp4'],
        file_paths: ['Creator/Video 123/video.mp4'],
      })}\n`,
      'utf8',
    );
    await writeFile(mediaPath, 'fake mp4', 'utf8');

    const result = await downloadDouyinViaExternalService({
      input: 'https://v.douyin.com/HCp2wHpDaYs/',
      config: { baseUrl: 'http://127.0.0.1:8000', outputDir: tmpDir, pollIntervalMs: 1, timeoutMs: 1000 },
      fetchImpl,
    });

    assert.equal(result.external.jobId, 'job-direct');
    assert.equal(result.outputDir, tmpDir);
    assert.equal(result.note.noteId, '7635800175809760552');
    assert.equal(result.files.length, 1);
    assert.equal(result.files[0].localPath, mediaPath);
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
});

test('reports upstream Douyin downloader job failure clearly', async () => {
  const fetchImpl = async (url, options = {}) => {
    if (url.toString().endsWith('/api/v1/download')) {
      return jsonResponse({ job_id: 'job-2', status: 'pending', url: 'https://www.douyin.com/video/1' });
    }

    if (url.toString().endsWith('/api/v1/jobs/job-2')) {
      return jsonResponse({
        job_id: 'job-2',
        status: 'failed',
        error: 'RuntimeError: Failed to resolve short URL',
        total: 1,
        success: 0,
        failed: 1,
        skipped: 0,
      });
    }

    throw new Error(`Unexpected ${options.method || 'GET'} ${url}`);
  };

  await assert.rejects(
    () => downloadDouyinViaExternalService({
      input: 'https://www.douyin.com/video/1',
      note: { noteId: '1', title: 'Douyin 1', media: [] },
      config: { baseUrl: 'http://127.0.0.1:8000', pollIntervalMs: 1, timeoutMs: 1000 },
      fetchImpl,
    }),
    /External Douyin downloader job failed: RuntimeError: Failed to resolve short URL/,
  );
});

test('reports upstream Douyin downloader failed counts when no error message is available', async () => {
  const fetchImpl = async (url) => {
    if (url.toString().endsWith('/api/v1/download')) {
      return jsonResponse({ job_id: 'job-3', status: 'pending', url: 'https://www.douyin.com/video/1' });
    }

    if (url.toString().endsWith('/api/v1/jobs/job-3')) {
      return jsonResponse({
        job_id: 'job-3',
        status: 'failed',
        error: null,
        total: 1,
        success: 0,
        failed: 1,
        skipped: 0,
      });
    }

    throw new Error(`Unexpected ${url}`);
  };

  await assert.rejects(
    () => downloadDouyinViaExternalService({
      input: 'https://www.douyin.com/video/1',
      note: { noteId: '1', title: 'Douyin 1', media: [] },
      config: { baseUrl: 'http://127.0.0.1:8000', pollIntervalMs: 1, timeoutMs: 1000 },
      fetchImpl,
    }),
    /External Douyin downloader job failed: status=failed, total=1, success=0, failed=1, skipped=0/,
  );
});

function jsonResponse(payload, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers,
  });
}
