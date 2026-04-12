import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { test } from 'node:test';

import { createRednoteApp } from './server-app.js';

async function startTestApp(t, overrides = {}) {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'rednote-app-test-'));
  const appConfigPath = path.join(tmpDir, 'config.json');
  const appStatePath = path.join(tmpDir, 'state.json');
  const openclawScriptPath = path.join(tmpDir, 'openclaw-mcp-server.js');
  const hermesScriptPath = path.join(tmpDir, 'hermes-mcp-server.js');
  const seedConfig = {
    openclaw: {
      serviceBaseUrl: '',
      mcpServerName: 'openclaw-test',
      toolName: 'openclaw_tool',
      preferredAgentId: 'openclaw-agent',
      mcpScriptPath: openclawScriptPath,
    },
    hermes: {
      serviceBaseUrl: '',
      mcpServerName: 'hermes-test',
      toolName: 'hermes_tool',
      preferredAgentId: 'hermes-agent',
      mcpScriptPath: hermesScriptPath,
    },
  };

  await writeFile(appConfigPath, `${JSON.stringify(seedConfig, null, 2)}\n`, 'utf8');
  await writeFile(openclawScriptPath, '// test stub\n', 'utf8');
  await writeFile(hermesScriptPath, '// test stub\n', 'utf8');

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

  return { origin: app.getOrigin(), seedConfig };
}

test('GET /api/integration/template returns openclaw and hermes targets', async (t) => {
  const { origin, seedConfig } = await startTestApp(t);

  const response = await fetch(`${origin}/api/integration/template`);
  assert.equal(response.status, 200);
  const data = await response.json();

  assert.equal(data.ok, true);
  assert.ok(data.integration);
  assert.ok(data.integration.openclaw);
  assert.ok(data.integration.hermes);
  assert.ok(data.integration.openclaw.template);
  assert.ok(data.integration.hermes.template);

  assert.equal(data.integration.openclaw.template.serverName, seedConfig.openclaw.mcpServerName);
  assert.equal(data.integration.openclaw.template.toolName, seedConfig.openclaw.toolName);
  assert.equal(data.integration.openclaw.template.preferredAgentId, seedConfig.openclaw.preferredAgentId);
  assert.equal(data.integration.openclaw.template.mcpScriptPath, seedConfig.openclaw.mcpScriptPath);
  assert.ok(data.integration.openclaw.snippetPrimary.includes('mcpServers'));
  assert.ok(data.integration.openclaw.snippetPrimary.includes(seedConfig.openclaw.mcpServerName));
  assert.ok(data.integration.hermes.snippetPrimary.includes('hermes mcp add'));
  assert.ok(data.integration.hermes.snippetPrimary.includes(seedConfig.hermes.mcpServerName));
  assert.ok(data.integration.hermes.snippetPrimary.includes('REDNOTE_SERVICE_BASE_URL='));
  assert.ok(data.integration.hermes.snippetPrimary.includes(seedConfig.hermes.mcpScriptPath));
  assert.equal(data.integration.hermes.template.serverName, seedConfig.hermes.mcpServerName);
  assert.equal(data.integration.hermes.template.toolName, seedConfig.hermes.toolName);
  assert.equal(data.integration.hermes.template.preferredAgentId, seedConfig.hermes.preferredAgentId);
  assert.equal(data.integration.hermes.template.mcpScriptPath, seedConfig.hermes.mcpScriptPath);
});

test('POST /api/integration/template applies request overrides without persisting them', async (t) => {
  const { origin, seedConfig } = await startTestApp(t);

  const response = await fetch(`${origin}/api/integration/template`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      hermes: {
        serviceBaseUrl: 'http://override.local:3999',
        preferredAgentId: 'override-agent',
      },
    }),
  });
  assert.equal(response.status, 200);
  const data = await response.json();

  assert.equal(data.ok, true);
  assert.equal(data.integration.hermes.template.serviceBaseUrl, 'http://override.local:3999');
  assert.equal(data.integration.hermes.template.preferredAgentId, 'override-agent');

  const followupResponse = await fetch(`${origin}/api/integration/template`);
  assert.equal(followupResponse.status, 200);
  const followupData = await followupResponse.json();

  assert.equal(followupData.ok, true);
  assert.equal(followupData.integration.hermes.template.preferredAgentId, seedConfig.hermes.preferredAgentId);
});

test('GET /api/openclaw/template remains backward compatible', async (t) => {
  const { origin, seedConfig } = await startTestApp(t);

  const response = await fetch(`${origin}/api/openclaw/template`);
  assert.equal(response.status, 200);
  const data = await response.json();

  assert.equal(data.ok, true);
  assert.ok(data.openclaw);
  assert.equal(typeof data.openclaw.mcporterSnippet, 'string');
  assert.equal(typeof data.openclaw.agentPrompt, 'string');
  assert.equal(data.openclaw.serverName, seedConfig.openclaw.mcpServerName);
  assert.equal(data.openclaw.toolName, seedConfig.openclaw.toolName);
  assert.equal(data.openclaw.preferredAgentId, seedConfig.openclaw.preferredAgentId);
  assert.equal(data.openclaw.mcpScriptPath, seedConfig.openclaw.mcpScriptPath);
  assert.ok(data.openclaw.mcporterSnippet.includes(origin));
});

test('GET /api/diagnostics includes hermes status', async (t) => {
  const { origin, seedConfig } = await startTestApp(t);

  const response = await fetch(`${origin}/api/diagnostics`);
  assert.equal(response.status, 200);
  const data = await response.json();

  assert.equal(data.ok, true);
  assert.ok(data.diagnostics);
  assert.ok(data.diagnostics.hermes);

  const hermes = data.diagnostics.hermes;
  assert.equal(typeof hermes.serviceBaseUrl, 'string');
  assert.equal(typeof hermes.serverName, 'string');
  assert.equal(typeof hermes.toolName, 'string');
  assert.equal(typeof hermes.preferredAgentId, 'string');
  assert.equal(typeof hermes.mcpScriptPath, 'string');
  assert.equal(typeof hermes.mcpScriptExists, 'boolean');
  assert.equal(typeof hermes.cliAvailable, 'boolean');

  assert.equal(hermes.serviceBaseUrl, origin);
  assert.equal(hermes.serverName, seedConfig.hermes.mcpServerName);
  assert.equal(hermes.toolName, seedConfig.hermes.toolName);
  assert.equal(hermes.preferredAgentId, seedConfig.hermes.preferredAgentId);
  assert.equal(hermes.mcpScriptPath, seedConfig.hermes.mcpScriptPath);
});
