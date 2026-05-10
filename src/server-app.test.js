import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createRednoteApp } from './server-app.js';

async function startTestApp(t, overrides = {}) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'rednote-app-test-'));
  const appConfigPath = path.join(tmpDir, 'config.json');
  const appStatePath = path.join(tmpDir, 'state.json');
  const silentLog = {
    log() {},
    warn() {},
    error() {},
  };

  const app = await createRednoteApp({
    host: '127.0.0.1',
    port: 0,
    adminToken: '',
    downloadDir: path.join(tmpDir, 'data'),
    appConfigPath,
    appStatePath,
    publicDir: tmpDir,
    skipMigrations: true,
    log: silentLog,
    ...overrides,
  });

  await app.start();

  t.after(async () => {
    await app.stop();
    await rm(tmpDir, { recursive: true, force: true });
  });

  return { origin: app.getOrigin() };
}

test('agent integration endpoints and browser helper are not exposed', async (t) => {
  const { origin } = await startTestApp(t);

  const paths = [
    '/api/integration/template',
    '/api/openclaw/template',
    '/api/openclaw/resolve',
    '/integration-utils.js',
  ];

  for (const pathname of paths) {
    const response = await fetch(`${origin}${pathname}`);
    assert.equal(response.status, 404, pathname);
  }
});

test('GET /api/config no longer exposes agent integration config blocks', async (t) => {
  const { origin } = await startTestApp(t);

  const response = await fetch(`${origin}/api/config`);
  assert.equal(response.status, 200);
  const data = await response.json();

  assert.equal(data.ok, true);
  assert.equal(data.config.openclaw, undefined);
  assert.equal(data.config.hermes, undefined);
});

test('GET /api/diagnostics includes external Douyin downloader status', async (t) => {
  const { origin } = await startTestApp(t, {
    env: {
      DOUYIN_DOWNLOADER_BASE_URL: 'http://127.0.0.1:8000',
      DOUYIN_COOKIE: 'douyin-env-cookie=1',
    },
  });

  const response = await fetch(`${origin}/api/diagnostics`);
  assert.equal(response.status, 200);
  const data = await response.json();

  assert.equal(data.ok, true);
  assert.equal(data.diagnostics.douyin.externalConfigured, true);
  assert.equal(data.diagnostics.douyin.cookieConfigured, true);
  assert.equal(data.diagnostics.douyin.baseUrl, 'http://127.0.0.1:8000');
  assert.equal(typeof data.diagnostics.checks.douyinDownloaderHealth.ok, 'boolean');
});

test('POST /api/resolve returns the existing response shape for a Douyin single video', async (t) => {
  const { origin } = await startTestApp(t, {
    dependencies: {
      resolveNote: async (input, options) => {
        assert.equal(input, 'https://www.douyin.com/video/7321234567890123456');
        assert.equal(options.cookie, 'ttwid=test');
        return {
          resolvedUrl: input,
          noteId: '7321234567890123456',
          title: 'Douyin Video',
          description: 'Douyin Video',
          type: 'video',
          author: { nickname: 'Creator', userId: '123' },
          media: [
            {
              index: 1,
              type: 'video',
              url: 'https://v3.douyinvod.com/video.mp4?watermark=0',
            },
          ],
          warnings: [],
        };
      },
    },
  });

  const response = await fetch(`${origin}/api/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: 'https://www.douyin.com/video/7321234567890123456',
      cookie: 'ttwid=test',
    }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();

  assert.equal(data.ok, true);
  assert.equal(data.note.noteId, '7321234567890123456');
  assert.equal(data.note.type, 'video');
  assert.equal(data.note.media[0].url, 'https://v3.douyinvod.com/video.mp4?watermark=0');
  assert.equal(data.download, undefined);
});

test('POST /api/resolve uses the Douyin-specific cookie field for Douyin inputs', async (t) => {
  const { origin } = await startTestApp(t, {
    dependencies: {
      resolveNote: async (input, options) => {
        assert.equal(input, 'https://www.douyin.com/video/7321234567890123456');
        assert.equal(options.cookie, 'douyin-cookie=1');
        return {
          resolvedUrl: input,
          noteId: '7321234567890123456',
          title: 'Douyin Video',
          description: '',
          type: 'video',
          author: null,
          media: [{ index: 1, type: 'video', url: 'https://v3.douyinvod.com/video.mp4' }],
          warnings: [],
        };
      },
    },
  });

  const response = await fetch(`${origin}/api/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: 'https://www.douyin.com/video/7321234567890123456',
      xhsCookie: 'xhs-cookie=1',
      douyinCookie: 'douyin-cookie=1',
    }),
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
});

test('POST /api/resolve falls back to DOUYIN_COOKIE for Douyin inputs', async (t) => {
  const { origin } = await startTestApp(t, {
    env: {
      DOUYIN_COOKIE: 'douyin-env-cookie=1',
    },
    dependencies: {
      resolveNote: async (input, options) => {
        assert.equal(input, 'https://www.douyin.com/video/7321234567890123456');
        assert.equal(options.cookie, 'douyin-env-cookie=1');
        return {
          resolvedUrl: input,
          noteId: '7321234567890123456',
          title: 'Douyin Video',
          description: '',
          type: 'video',
          author: null,
          media: [{ index: 1, type: 'video', url: 'https://v3.douyinvod.com/video.mp4' }],
          warnings: [],
        };
      },
    },
  });

  const response = await fetch(`${origin}/api/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: 'https://www.douyin.com/video/7321234567890123456',
    }),
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
});

test('POST /api/resolve uses the Xiaohongshu-specific cookie field for non-Douyin inputs', async (t) => {
  const { origin } = await startTestApp(t, {
    dependencies: {
      resolveNote: async (input, options) => {
        assert.equal(input, 'https://www.xiaohongshu.com/explore/xhs-note');
        assert.equal(options.cookie, 'xhs-cookie=1');
        return {
          resolvedUrl: input,
          noteId: 'xhs-note',
          title: 'XHS Note',
          description: '',
          type: 'image',
          author: null,
          media: [{ index: 1, type: 'image', url: 'https://ci.xiaohongshu.com/image.jpg' }],
          warnings: [],
        };
      },
    },
  });

  const response = await fetch(`${origin}/api/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: 'https://www.xiaohongshu.com/explore/xhs-note',
      xhsCookie: 'xhs-cookie=1',
      douyinCookie: 'douyin-cookie=1',
    }),
  });

  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.ok, true);
});

test('POST /api/resolve supports mixed batch inputs including Douyin URLs', async (t) => {
  const seen = [];
  const { origin } = await startTestApp(t, {
    dependencies: {
      resolveNote: async (input, options) => {
        seen.push({ input, cookie: options.cookie });
        return {
          resolvedUrl: input,
          noteId: input.includes('douyin') ? '7321234567890123456' : 'xhs-note',
          title: input.includes('douyin') ? 'Douyin Video' : 'XHS Note',
          description: '',
          type: 'video',
          author: null,
          media: [{ index: 1, type: 'video', url: 'https://v3.douyinvod.com/video.mp4' }],
          warnings: [],
        };
      },
    },
  });

  const response = await fetch(`${origin}/api/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: [
        'https://www.xiaohongshu.com/explore/xhs-note',
        'https://www.douyin.com/video/7321234567890123456',
      ].join('\n'),
      xhsCookie: 'xhs-cookie=1',
      douyinCookie: 'douyin-cookie=1',
    }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();

  assert.equal(data.ok, true);
  assert.equal(data.batch, true);
  assert.equal(data.results.length, 2);
  assert.deepEqual(seen, [
    { input: 'https://www.xiaohongshu.com/explore/xhs-note', cookie: 'xhs-cookie=1' },
    { input: 'https://www.douyin.com/video/7321234567890123456', cookie: 'douyin-cookie=1' },
  ]);
});

test('POST /api/resolve delegates Douyin server downloads directly to external downloader when configured', async (t) => {
  const calls = [];
  let resolveCalled = false;
  const { origin } = await startTestApp(t, {
    env: {
      DOUYIN_DOWNLOADER_BASE_URL: 'http://127.0.0.1:8000',
      DOUYIN_DOWNLOADER_POLL_INTERVAL_MS: '1',
      DOUYIN_DOWNLOADER_TIMEOUT_MS: '1000',
    },
    dependencies: {
      resolveNote: async () => {
        resolveCalled = true;
        throw new Error('Node Douyin detail API should not be called for external server downloads');
      },
      downloadDouyinViaExternalService: async ({ input, note, config, cookie }) => {
        calls.push({ input, note, config, cookie });
        return {
          outputDir: 'external:douyin-downloader:job-1',
          external: {
            provider: 'jiji262/douyin-downloader',
            jobId: 'job-1',
            status: 'success',
          },
          note: {
            resolvedUrl: input,
            noteId: 'job-1',
            title: 'Douyin external download',
            description: '',
            type: 'video',
            author: { nickname: '', userId: '' },
            media: [],
            warnings: ['Douyin media was downloaded by the external downloader; preview URLs are not returned by its REST API.'],
          },
          files: [],
        };
      },
    },
  });

  const response = await fetch(`${origin}/api/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: 'https://v.douyin.com/HCp2wHpDaYs/',
      cookie: 'ttwid=test',
      download: true,
    }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();

  assert.equal(data.ok, true);
  assert.equal(resolveCalled, false);
  assert.equal(data.note.noteId, 'job-1');
  assert.equal(data.note.media.length, 0);
  assert.equal(data.download.outputDir, 'external:douyin-downloader:job-1');
  assert.equal(data.download.external.provider, 'jiji262/douyin-downloader');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, 'https://v.douyin.com/HCp2wHpDaYs/');
  assert.equal(calls[0].note, undefined);
  assert.equal(calls[0].config.baseUrl, 'http://127.0.0.1:8000');
  assert.equal(calls[0].cookie, 'ttwid=test');
});

test('POST /api/resolve can submit Douyin external downloads without Node detail resolution', async (t) => {
  let resolveCalled = false;
  const { origin } = await startTestApp(t, {
    env: {
      DOUYIN_DOWNLOADER_BASE_URL: 'http://127.0.0.1:8000',
      DOUYIN_DOWNLOADER_POLL_INTERVAL_MS: '1',
      DOUYIN_DOWNLOADER_TIMEOUT_MS: '1000',
    },
    dependencies: {
      resolveNote: async () => {
        resolveCalled = true;
        throw new Error('Node Douyin detail API should not be called for external server downloads');
      },
      downloadDouyinViaExternalService: async ({ input, note }) => ({
        outputDir: 'external:douyin-downloader:job-direct',
        external: {
          provider: 'jiji262/douyin-downloader',
          jobId: 'job-direct',
          status: 'success',
        },
        note: {
          resolvedUrl: input,
          noteId: 'job-direct',
          title: 'Douyin external download',
          description: '',
          type: 'video',
          author: { nickname: '', userId: '' },
          media: [],
          warnings: ['Douyin media was downloaded by the external downloader; preview URLs are not returned by its REST API.'],
        },
        files: note?.media || [],
      }),
    },
  });

  const response = await fetch(`${origin}/api/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: 'https://v.douyin.com/HCp2wHpDaYs/',
      download: true,
    }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();

  assert.equal(data.ok, true);
  assert.equal(resolveCalled, false);
  assert.equal(data.note.noteId, 'job-direct');
  assert.equal(data.note.media.length, 0);
  assert.equal(data.download.external.jobId, 'job-direct');
});

test('POST /api/resolve uses external Douyin downloader even without explicit download flag', async (t) => {
  let resolveCalled = false;
  const { origin } = await startTestApp(t, {
    env: {
      DOUYIN_DOWNLOADER_BASE_URL: 'http://127.0.0.1:8000',
      DOUYIN_DOWNLOADER_POLL_INTERVAL_MS: '1',
      DOUYIN_DOWNLOADER_TIMEOUT_MS: '1000',
    },
    dependencies: {
      resolveNote: async () => {
        resolveCalled = true;
        throw new Error('Node Douyin detail API should not be called when external downloader is configured');
      },
      downloadDouyinViaExternalService: async ({ input }) => ({
        outputDir: 'external:douyin-downloader:job-auto',
        external: {
          provider: 'jiji262/douyin-downloader',
          jobId: 'job-auto',
          status: 'success',
        },
        note: {
          resolvedUrl: input,
          noteId: 'job-auto',
          title: 'Douyin external download',
          description: '',
          type: 'video',
          author: { nickname: '', userId: '' },
          media: [],
          warnings: ['Douyin media was downloaded by the external downloader; preview URLs are not returned by its REST API.'],
        },
        files: [],
      }),
    },
  });

  const response = await fetch(`${origin}/api/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: '复制打开抖音 https://v.douyin.com/HCp2wHpDaYs/ 看视频',
    }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();

  assert.equal(data.ok, true);
  assert.equal(resolveCalled, false);
  assert.equal(data.download.external.jobId, 'job-auto');
});

test('GET /api/media can proxy an allowed local Douyin file', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'rednote-local-media-test-'));
  const mediaPath = path.join(tmpDir, 'Downloaded', 'creator', 'video.mp4');
  await mkdir(path.dirname(mediaPath), { recursive: true });
  await writeFile(mediaPath, 'fake mp4 bytes', 'utf8');

  const { origin } = await startTestApp(t, {
    env: {
      DOUYIN_DOWNLOADER_OUTPUT_DIR: path.join(tmpDir, 'Downloaded'),
    },
  });

  const response = await fetch(`${origin}/api/media?${new URLSearchParams({
    path: mediaPath,
    filename: 'video.mp4',
    inline: '1',
  })}`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'fake mp4 bytes');
  assert.match(response.headers.get('content-disposition'), /inline/);
});

test('GET /api/media rejects local files outside allowed roots', async (t) => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'rednote-local-media-test-'));
  const allowedDir = path.join(tmpDir, 'Downloaded');
  const outsidePath = path.join(tmpDir, 'outside.mp4');
  await mkdir(allowedDir, { recursive: true });
  await writeFile(outsidePath, 'nope', 'utf8');

  const { origin } = await startTestApp(t, {
    env: {
      DOUYIN_DOWNLOADER_OUTPUT_DIR: allowedDir,
    },
  });

  const response = await fetch(`${origin}/api/media?${new URLSearchParams({
    path: outsidePath,
    filename: 'outside.mp4',
  })}`);
  assert.equal(response.status, 502);
  const data = await response.json();
  assert.match(data.error, /Unsupported local media path/);
});
