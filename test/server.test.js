import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, readFile } from 'node:fs/promises';
import { createRednoteApp } from '../src/server-app.js';

const SILENT_LOG = {
  log() {},
  warn() {},
  error() {},
};

async function createTestApp(t, options = {}) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'rednote-server-test-'));
  const app = await createRednoteApp({
    port: 0,
    host: '127.0.0.1',
    downloadDir: path.join(rootDir, 'downloads'),
    appConfigPath: path.join(rootDir, 'config', '.rednote-config.json'),
    appStatePath: path.join(rootDir, 'config', '.rednote-state.json'),
    env: {
      TELEGRAM_ENABLED: 'false',
    },
    log: SILENT_LOG,
    skipMigrations: true,
    ...options,
  });

  await app.start();
  t.after(async () => {
    await app.stop();
  });

  return {
    app,
    origin: app.getOrigin(),
    rootDir,
  };
}

async function requestJson(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };
  const hasJsonBody = options.body && typeof options.body !== 'string';
  if (hasJsonBody) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
    body: hasJsonBody ? JSON.stringify(options.body) : options.body,
  });
  const text = await response.text();

  return {
    response,
    text,
    json: text ? JSON.parse(text) : null,
  };
}

test('admin endpoints require the configured token and only echo allowed CORS origins', async (t) => {
  const { origin } = await createTestApp(t, {
    adminToken: 'secret-token',
    corsAllowedOrigins: ['http://allowed.example'],
  });

  const unauthorized = await requestJson(`${origin}/api/config`);
  assert.equal(unauthorized.response.status, 401);
  assert.equal(unauthorized.json.ok, false);

  const allowed = await requestJson(`${origin}/api/config`, {
    headers: {
      Origin: 'http://allowed.example',
      'X-Admin-Token': 'secret-token',
    },
  });
  assert.equal(allowed.response.status, 200);
  assert.equal(allowed.response.headers.get('access-control-allow-origin'), 'http://allowed.example');
  assert.equal(allowed.json.ok, true);

  const blocked = await requestJson(`${origin}/api/config`, {
    headers: {
      Origin: 'http://blocked.example',
      'X-Admin-Token': 'secret-token',
    },
  });
  assert.equal(blocked.response.status, 200);
  assert.equal(blocked.response.headers.get('access-control-allow-origin'), null);
});

test('config writes persist to disk and return a masked public snapshot', async (t) => {
  const { origin, app } = await createTestApp(t, {
    adminToken: 'secret-token',
  });

  const payload = {
    telegram: {
      enabled: true,
      botToken: '123456:ABCDEF',
      allowedChatIds: '10001,10002',
      deliveryMode: 'preview',
    },
  };

  const result = await requestJson(`${origin}/api/config`, {
    method: 'POST',
    headers: {
      'X-Admin-Token': 'secret-token',
    },
    body: payload,
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.json.ok, true);
  assert.equal(result.json.config.telegram.botTokenSet, true);
  assert.equal(result.json.config.telegram.botTokenMasked, '1234***CDEF');
  assert.equal(result.json.config.telegram.deliveryMode, 'preview');

  const savedConfig = JSON.parse(await readFile(app.settings.appConfigPath, 'utf8'));
  assert.equal(savedConfig.telegram.botToken, '123456:ABCDEF');
  assert.equal(savedConfig.telegram.allowedChatIds, '10001,10002');
});

test('agent integration endpoints are no longer exposed', async (t) => {
  const { origin } = await createTestApp(t);

  const template = await requestJson(`${origin}/api/openclaw/template`);
  assert.equal(template.response.status, 404);
  assert.equal(template.json.ok, false);

  const diagnostics = await requestJson(`${origin}/api/diagnostics`);
  assert.equal(diagnostics.response.status, 200);
  assert.equal(diagnostics.json.diagnostics.openclaw, undefined);
  assert.equal(diagnostics.json.diagnostics.hermes, undefined);
});

test('batch resolve honors the configured concurrency limit and preserves input order', async (t) => {
  let activeResolves = 0;
  let maxActiveResolves = 0;

  const { origin } = await createTestApp(t, {
    batchResolveConcurrency: 2,
    dependencies: {
      async resolveNote(input) {
        activeResolves += 1;
        maxActiveResolves = Math.max(maxActiveResolves, activeResolves);
        await new Promise((resolve) => setTimeout(resolve, input.endsWith('/1') ? 30 : 10));
        activeResolves -= 1;

        return {
          noteId: input.split('/').pop(),
          title: 'Batch Note',
          description: '',
          type: 'normal',
          author: {
            nickname: 'tester',
          },
          media: [],
          warnings: [],
          resolvedUrl: input,
        };
      },
    },
  });

  const input = [
    'https://x.com/demo/status/1',
    'https://x.com/demo/status/2',
    'https://x.com/demo/status/3',
  ].join('\n');
  const result = await requestJson(`${origin}/api/resolve`, {
    method: 'POST',
    body: {
      input,
      download: false,
    },
  });

  assert.equal(result.response.status, 200);
  assert.equal(result.json.batch, true);
  assert.deepEqual(
    result.json.results.map((item) => item.input),
    [
      'https://x.com/demo/status/1',
      'https://x.com/demo/status/2',
      'https://x.com/demo/status/3',
    ],
  );
  assert.equal(maxActiveResolves, 2);
});

test('media proxy falls back to alternate URLs and forwards range headers', async (t) => {
  const seenRanges = [];
  const { origin } = await createTestApp(t, {
    dependencies: {
      async fetchMediaResponse(url, options = {}) {
        if (String(url).includes('primary')) {
          throw new Error('primary failed');
        }

        seenRanges.push(options.headers?.Range || '');
        return {
          url: new URL(String(url)),
          response: new Response('proxied-media', {
            status: 206,
            headers: {
              'Accept-Ranges': 'bytes',
              'Content-Length': '13',
              'Content-Range': 'bytes 0-12/13',
              'Content-Type': 'video/mp4',
            },
          }),
        };
      },
    },
  });

  const response = await fetch(
    `${origin}/api/media?url=${encodeURIComponent('https://video.twimg.com/demo/primary.mp4')}&fallback=${encodeURIComponent('https://video.twimg.com/demo/fallback.mp4')}&filename=${encodeURIComponent('custom.mp4')}&inline=1`,
    {
      headers: {
        Range: 'bytes=0-12',
      },
    },
  );

  assert.equal(response.status, 206);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.match(response.headers.get('content-disposition') || '', /^inline;/);
  assert.match(response.headers.get('content-disposition') || '', /custom\.mp4/);
  assert.equal(response.headers.get('content-type'), 'video/mp4');
  assert.equal(await response.text(), 'proxied-media');
  assert.deepEqual(seenRanges, ['bytes=0-12']);
});

test('shared media filename helper is served as a browser module', async (t) => {
  const { origin } = await createTestApp(t);
  const response = await fetch(`${origin}/media-filenames.js`);
  const text = await response.text();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.match(text, /export function inferMediaFileName/);
});
