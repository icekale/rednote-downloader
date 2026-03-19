import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAppStatePath,
  getPublicConfig,
  mergeAppConfig,
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

test('normalizeEnvBoolean understands common truthy and falsy strings', () => {
  assert.equal(normalizeEnvBoolean('true', false), true);
  assert.equal(normalizeEnvBoolean('OFF', true), false);
  assert.equal(normalizeEnvBoolean('', true), true);
  assert.equal(normalizeEnvBoolean('unexpected', false), false);
});
