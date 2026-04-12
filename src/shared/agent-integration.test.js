import test from 'node:test';
import assert from 'node:assert/strict';
import {
  INTEGRATION_TARGET_STORAGE_KEY,
  normalizeTemplateSlots,
  resolveInitialIntegrationTarget,
} from './agent-integration.js';

test('resolveInitialIntegrationTarget respects a saved browser selection', () => {
  const target = resolveInitialIntegrationTarget({
    storageValue: 'hermes',
    config: {
      openclaw: {
        serviceBaseUrl: '',
        preferredAgentId: 'bfxia',
      },
      hermes: {
        serviceBaseUrl: '',
        preferredAgentId: 'bfxia',
        mcpScriptPath: '',
      },
    },
  });

  assert.equal(target, 'hermes');
});

test('resolveInitialIntegrationTarget falls back to hermes when hermes config is customized', () => {
  const target = resolveInitialIntegrationTarget({
    storageValue: '',
    config: {
      openclaw: {
        serviceBaseUrl: '',
        preferredAgentId: 'bfxia',
      },
      hermes: {
        serviceBaseUrl: 'http://localhost:3000',
        preferredAgentId: 'hermes-bot',
      },
    },
  });

  assert.equal(target, 'hermes');
});

test('resolveInitialIntegrationTarget keeps openclaw when hermes only has seeded defaults', () => {
  const target = resolveInitialIntegrationTarget({
    storageValue: '',
    config: {
      openclaw: {
        serviceBaseUrl: '',
        preferredAgentId: 'bfxia',
      },
      hermes: {
        serviceBaseUrl: '',
        mcpServerName: 'rednote',
        toolName: 'resolve_rednote_media',
        preferredAgentId: 'bfxia',
        mcpScriptPath: '',
      },
    },
  });

  assert.equal(target, 'openclaw');
});

test('resolveInitialIntegrationTarget keeps openclaw when hermes mirrors openclaw settings', () => {
  const target = resolveInitialIntegrationTarget({
    storageValue: '',
    config: {
      openclaw: {
        serviceBaseUrl: 'http://localhost:3000',
        mcpServerName: 'rednote',
        toolName: 'resolve_rednote_media',
        preferredAgentId: 'bfxia',
        mcpScriptPath: '/Users/kale/rednote/src/mcp-server.js',
      },
      hermes: {
        serviceBaseUrl: 'http://localhost:3000',
        mcpServerName: 'rednote',
        toolName: 'resolve_rednote_media',
        preferredAgentId: 'bfxia',
        mcpScriptPath: '/Users/kale/rednote/src/mcp-server.js',
      },
    },
  });

  assert.equal(target, 'openclaw');
});

test('normalizeTemplateSlots returns three slots for hermes and two for openclaw', () => {
  const hermesSlots = normalizeTemplateSlots({
    snippetPrimaryLabel: 'A',
    snippetPrimary: 'A code',
    snippetSecondaryLabel: 'B',
    snippetSecondary: 'B code',
    snippetTertiaryLabel: 'C',
    snippetTertiary: 'C code',
  });
  const openclawSlots = normalizeTemplateSlots({
    snippetPrimaryLabel: 'A',
    snippetPrimary: 'A code',
    snippetSecondaryLabel: 'B',
    snippetSecondary: 'B code',
  });

  assert.equal(hermesSlots.length, 3);
  assert.equal(openclawSlots.length, 2);
  assert.equal(hermesSlots[0].label, 'A');
  assert.equal(hermesSlots[0].value, 'A code');
});

test('INTEGRATION_TARGET_STORAGE_KEY equals rednote-integration-target', () => {
  assert.equal(INTEGRATION_TARGET_STORAGE_KEY, 'rednote-integration-target');
});
