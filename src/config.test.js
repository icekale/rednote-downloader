import assert from 'node:assert/strict';
import test from 'node:test';

import { getPublicConfig, mergeAppConfig, sanitizeAppConfig } from './config.js';

const openclawSeed = {
  serviceBaseUrl: 'http://localhost:3000',
  mcpServerName: 'rednote',
  toolName: 'resolve_rednote_media',
  preferredAgentId: 'bfxia',
  mcpScriptPath: '/Users/kale/rednote/src/mcp-server.js',
};

test('sanitizeAppConfig seeds hermes from openclaw when hermes is missing', () => {
  const normalized = sanitizeAppConfig({ openclaw: openclawSeed });
  assert.deepStrictEqual(normalized.hermes, normalized.openclaw);
});

test('mergeAppConfig updates hermes without dropping openclaw', () => {
  const initial = sanitizeAppConfig({ openclaw: openclawSeed });
  const updated = mergeAppConfig(initial, {
    hermes: { preferredAgentId: 'hermes-bot' },
  });

  assert.deepStrictEqual(updated.openclaw, initial.openclaw);
  assert.strictEqual(updated.hermes.preferredAgentId, 'hermes-bot');
});

test('getPublicConfig exposes both openclaw and hermes blocks', () => {
  const normalized = sanitizeAppConfig({
    openclaw: openclawSeed,
    hermes: {
      ...openclawSeed,
      serviceBaseUrl: 'http://localhost:4000',
      preferredAgentId: 'hermes-bot',
    },
  });

  const publicConfig = getPublicConfig(normalized);

  assert.deepStrictEqual(publicConfig.openclaw, normalized.openclaw);
  assert.deepStrictEqual(publicConfig.hermes, normalized.hermes);
  assert.strictEqual(publicConfig.hermes.preferredAgentId, 'hermes-bot');
});
