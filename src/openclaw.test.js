import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildHermesTemplate, buildHermesAgentPrompt, buildIntegrationTemplates, buildOpenClawResolvePayload } from './openclaw.js';

test('buildHermesTemplate returns a runnable CLI command and YAML snippet', () => {
  const template = buildHermesTemplate({
    serviceBaseUrl: 'https://example.com',
    serverName: 'custom',
    toolName: 'resolve_rednote_media',
    nodeCommand: 'node',
    mcpScriptPath: '/tmp/mcp-server.js',
  });

  assert(template.cliCommand.includes('hermes mcp add'));
  assert(template.cliCommand.includes('--command env'));
  assert(template.cliCommand.includes("'REDNOTE_SERVICE_BASE_URL=https://example.com'"));
  assert(template.cliCommand.includes("'node'"));
  assert(template.cliCommand.includes("'/tmp/mcp-server.js'"));
  assert(template.yamlSnippet.includes('mcp_servers:'));
  assert(template.yamlSnippet.includes('command: "node"'));
  assert(template.yamlSnippet.includes('REDNOTE_SERVICE_BASE_URL: "https://example.com"'));
});

test('buildHermesAgentPrompt mentions Hermes MCP tools and media-first behavior', () => {
  const prompt = buildHermesAgentPrompt({
    serverName: 'rednote',
    toolName: 'resolve_rednote_media',
  });

  assert(prompt.includes('Hermes MCP'));
  assert(prompt.includes('media-first'));
  assert(prompt.includes('mcp_rednote_resolve_rednote_media'));
});

test('buildIntegrationTemplates returns labeled snippet payloads for both targets', () => {
  const templates = buildIntegrationTemplates();

  assert.equal(templates.openclaw.snippetPrimaryLabel, 'McPorter configuration');
  assert.ok(templates.openclaw.snippetPrimary.includes('mcpServers'));
  assert.equal(templates.openclaw.snippetSecondaryLabel, 'Agent prompt');
  assert.ok(templates.openclaw.snippetSecondary.includes('MCP 工具'));

  assert.equal(templates.hermes.snippetPrimaryLabel, 'Hermes CLI command');
  assert.ok(templates.hermes.snippetPrimary.includes('hermes mcp add'));
  assert.equal(templates.hermes.snippetSecondaryLabel, 'Hermes YAML snippet');
  assert.ok(templates.hermes.snippetSecondary.includes('mcp_servers:'));
  assert.equal(templates.hermes.snippetTertiaryLabel, 'Hermes agent prompt');
  assert.ok(templates.hermes.snippetTertiary.includes('Hermes MCP'));
});

test('filters invalid media before building proxy URLs', () => {
  const note = {
    media: [
      { url: 'https://valid.com/img.jpg', fileName: 'explicit.jpg' },
      { url: '' },
      {},
    ],
    resolvedUrl: 'https://example.com',
  };

  const payload = buildOpenClawResolvePayload(note, { baseUrl: 'http://127.0.0.1:3000' });

  assert.equal(payload.mediaUrls.length, 1);
  assert.equal(payload.proxyMediaUrls.length, 1);
  assert.equal(
    payload.proxyMediaUrls[0],
    'http://127.0.0.1:3000/api/media?url=https%3A%2F%2Fvalid.com%2Fimg.jpg&filename=explicit.jpg',
  );
});

test('Hermes CLI quoting handles spaces and apostrophes', () => {
  const template = buildHermesTemplate({
    serverName: "custom svc",
    nodeCommand: "/usr/bin/node",
    mcpScriptPath: "/tmp/my script's path.js",
  });

  assert(template.cliCommand.includes("'custom svc'"));
  assert(template.cliCommand.includes("'REDNOTE_SERVICE_BASE_URL=http://127.0.0.1:3000'"));
  assert(template.cliCommand.includes("'/tmp/my script'\\''s path.js'"));
});
