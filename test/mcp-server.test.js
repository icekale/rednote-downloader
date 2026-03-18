import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SERVER_PATH = fileURLToPath(new URL('../src/mcp-server.js', import.meta.url));

function startServer() {
  return spawn(process.execPath, [SERVER_PATH], {
    env: {
      ...process.env,
      REDNOTE_SERVICE_BASE_URL: 'http://127.0.0.1:3000',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

function waitForLine(stream, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for MCP response.'));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('error', onError);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onData(chunk) {
      buffer += chunk.toString('utf8');
      const newlineIndex = buffer.indexOf('\n');
      if (newlineIndex === -1) {
        return;
      }

      const line = buffer.slice(0, newlineIndex).trim();
      cleanup();
      resolve(JSON.parse(line));
    }

    stream.on('data', onData);
    stream.on('error', onError);
  });
}

function collectStream(stream) {
  let buffer = '';
  stream.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
  });
  return () => buffer;
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }

  child.stdin.end();
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 1000);

    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

test('mcp server speaks newline-delimited json-rpc for initialize and tools/list', async () => {
  const child = startServer();
  const readStderr = collectStream(child.stderr);

  try {
    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2025-11-25',
        capabilities: {},
        clientInfo: {
          name: 'test-client',
          version: '0.0.0',
        },
      },
    })}\n`);

    const initializeResponse = await waitForLine(child.stdout);
    assert.equal(initializeResponse.id, 1);
    assert.equal(initializeResponse.result.protocolVersion, '2024-11-05');
    assert.equal(initializeResponse.result.serverInfo.name, 'rednote-downloader');

    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    })}\n`);

    child.stdin.write(`${JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    })}\n`);

    const listResponse = await waitForLine(child.stdout);
    assert.equal(listResponse.id, 2);
    assert.equal(listResponse.result.tools.length, 1);
    assert.equal(listResponse.result.tools[0].name, 'resolve_rednote_media');
  } finally {
    assert.equal(readStderr(), '');
    await stopServer(child);
  }
});
