import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import {
  getAppConfigPath,
  getAppStatePath,
  getPublicConfig,
  looksLikeLegacyDownloadEntry,
  mergeAppConfig,
  migrateLegacyAppFiles,
  migrateLegacyDownloadEntries,
  normalizeEnvBoolean,
  sanitizeAppConfig,
  sanitizeAppState,
} from '../src/config.js';

test('sanitizeAppConfig applies defaults and trims fields', () => {
  const result = sanitizeAppConfig({
    telegram: {
      enabled: true,
      botToken: '  abc123  ',
      allowedChatIds: ' 1, 2 ',
      deliveryMode: 'preview',
    },
    openclaw: {
      serviceBaseUrl: ' http://localhost:3000/test ',
      mcpServerName: ' custom-rednote ',
      toolName: ' resolve_note ',
      preferredAgentId: ' bfxia ',
      mcpScriptPath: ' /Users/demo/rednote/src/mcp-server.js ',
    },
  });

  assert.equal(result.telegram.botToken, 'abc123');
  assert.equal(result.telegram.deliveryMode, 'preview');
  assert.equal(result.openclaw.serviceBaseUrl, 'http://localhost:3000');
  assert.equal(result.openclaw.mcpServerName, 'custom-rednote');
  assert.equal(result.openclaw.toolName, 'resolve_note');
  assert.equal(result.openclaw.mcpScriptPath, '/Users/demo/rednote/src/mcp-server.js');
});

test('sanitizeAppConfig keeps an empty OpenClaw service base url so the server can auto-detect origin', () => {
  const result = sanitizeAppConfig({
    openclaw: {
      serviceBaseUrl: '   ',
    },
  });

  assert.equal(result.openclaw.serviceBaseUrl, '');
});

test('sanitizeAppConfig drops invalid OpenClaw service base urls back to auto-detect mode', () => {
  const result = sanitizeAppConfig({
    openclaw: {
      serviceBaseUrl: 'not-a-url',
    },
  });

  assert.equal(result.openclaw.serviceBaseUrl, '');
});

test('mergeAppConfig preserves unspecified existing secrets', () => {
  const result = mergeAppConfig({
    telegram: {
      enabled: true,
      botToken: 'secret-token',
      allowedChatIds: '1',
      deliveryMode: 'document',
    },
    openclaw: {
      serviceBaseUrl: 'http://127.0.0.1:3000',
      mcpServerName: 'rednote',
      toolName: 'resolve_rednote_media',
      preferredAgentId: 'bfxia',
    },
  }, {
    telegram: {
      allowedChatIds: '1,2',
    },
  });

  assert.equal(result.telegram.botToken, 'secret-token');
  assert.equal(result.telegram.allowedChatIds, '1,2');
});

test('getPublicConfig masks stored telegram token', () => {
  const result = getPublicConfig({
    telegram: {
      enabled: true,
      botToken: '1234567890abcdef',
      allowedChatIds: '',
      deliveryMode: 'document',
    },
    openclaw: {
      serviceBaseUrl: 'http://127.0.0.1:3000',
      mcpServerName: 'rednote',
      toolName: 'resolve_rednote_media',
      preferredAgentId: 'bfxia',
    },
  });

  assert.equal(result.telegram.botTokenSet, true);
  assert.match(result.telegram.botTokenMasked, /^1234\*\*\*cdef$/);
});

test('sanitizeAppState keeps a non-negative telegram offset', () => {
  const result = sanitizeAppState({
    telegram: {
      updateOffset: ' 42 ',
    },
  });

  assert.equal(result.telegram.updateOffset, 42);
});

test('getAppStatePath defaults next to the config file', () => {
  const result = getAppStatePath({}, '/tmp/rednote-data', '/tmp/rednote-data/.rednote-config.json');
  assert.equal(result, '/tmp/rednote-data/.rednote-state.json');
});

test('getAppConfigPath honors explicit APP_CONFIG_PATH', () => {
  const result = getAppConfigPath({
    APP_CONFIG_PATH: '/srv/rednote/config/.rednote-config.json',
  }, '/tmp/rednote-data');

  assert.equal(result, '/srv/rednote/config/.rednote-config.json');
});

test('migrateLegacyAppFiles copies legacy config and state into dedicated config dir', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rednote-config-'));
  const downloadDir = path.join(tempRoot, 'downloads');
  const configDir = path.join(tempRoot, 'config');
  const legacyConfigPath = path.join(downloadDir, '.rednote-config.json');
  const legacyStatePath = path.join(downloadDir, '.rednote-state.json');
  const nextConfigPath = path.join(configDir, '.rednote-config.json');
  const nextStatePath = path.join(configDir, '.rednote-state.json');

  await mkdir(downloadDir, { recursive: true });
  await writeFile(legacyConfigPath, '{"telegram":{"enabled":true}}\n', 'utf8');
  await writeFile(legacyStatePath, '{"telegram":{"updateOffset":12}}\n', 'utf8');

  const result = await migrateLegacyAppFiles({
    downloadDir,
    configPath: nextConfigPath,
    statePath: nextStatePath,
  });

  assert.deepEqual(result, {
    config: true,
    state: true,
  });
  assert.equal(await readFile(nextConfigPath, 'utf8'), '{"telegram":{"enabled":true}}\n');
  assert.equal(await readFile(nextStatePath, 'utf8'), '{"telegram":{"updateOffset":12}}\n');
});

test('migrateLegacyAppFiles also picks files from the parent of downloadDir for Docker layout upgrades', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rednote-config-parent-'));
  const dataDir = path.join(tempRoot, 'data');
  const downloadDir = path.join(dataDir, 'downloads');
  const configDir = path.join(dataDir, 'config');
  const legacyConfigPath = path.join(dataDir, '.rednote-config.json');
  const legacyStatePath = path.join(dataDir, '.rednote-state.json');
  const nextConfigPath = path.join(configDir, '.rednote-config.json');
  const nextStatePath = path.join(configDir, '.rednote-state.json');

  await mkdir(downloadDir, { recursive: true });
  await writeFile(legacyConfigPath, '{"telegram":{"enabled":false}}\n', 'utf8');
  await writeFile(legacyStatePath, '{"telegram":{"updateOffset":34}}\n', 'utf8');

  const result = await migrateLegacyAppFiles({
    downloadDir,
    configPath: nextConfigPath,
    statePath: nextStatePath,
  });

  assert.deepEqual(result, {
    config: true,
    state: true,
  });
  assert.equal(await readFile(nextConfigPath, 'utf8'), '{"telegram":{"enabled":false}}\n');
  assert.equal(await readFile(nextStatePath, 'utf8'), '{"telegram":{"updateOffset":34}}\n');
});

test('looksLikeLegacyDownloadEntry only matches old top-level download names', () => {
  assert.equal(looksLikeLegacyDownloadEntry('X @imanstore_9_2031161811874324962'), true);
  assert.equal(looksLikeLegacyDownloadEntry('示例标题_abcd1234'), true);
  assert.equal(looksLikeLegacyDownloadEntry('.rednote-config.json'), false);
  assert.equal(looksLikeLegacyDownloadEntry('config'), false);
  assert.equal(looksLikeLegacyDownloadEntry('downloads'), false);
});

test('migrateLegacyDownloadEntries moves legacy download folders into downloads dir', async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'rednote-download-layout-'));
  const dataDir = path.join(tempRoot, 'data');
  const downloadDir = path.join(dataDir, 'downloads');
  const legacyEntry = path.join(dataDir, 'X @imanstore_9_2031161811874324962');
  const configDir = path.join(dataDir, 'config');

  await mkdir(path.join(legacyEntry), { recursive: true });
  await mkdir(configDir, { recursive: true });
  await writeFile(path.join(legacyEntry, 'media.mp4'), 'demo', 'utf8');
  await writeFile(path.join(dataDir, '.rednote-config.json'), '{}\n', 'utf8');

  const moved = await migrateLegacyDownloadEntries(downloadDir);

  assert.deepEqual(moved, ['X @imanstore_9_2031161811874324962']);
  assert.equal(
    await readFile(path.join(downloadDir, 'X @imanstore_9_2031161811874324962', 'media.mp4'), 'utf8'),
    'demo',
  );
  assert.equal(await readFile(path.join(dataDir, '.rednote-config.json'), 'utf8'), '{}\n');
});

test('normalizeEnvBoolean understands common truthy and falsy strings', () => {
  assert.equal(normalizeEnvBoolean('true', false), true);
  assert.equal(normalizeEnvBoolean('OFF', true), false);
  assert.equal(normalizeEnvBoolean('', true), true);
  assert.equal(normalizeEnvBoolean('unexpected', false), false);
});
