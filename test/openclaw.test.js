import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMcporterConfigSnippet,
  buildOpenClawAgentPrompt,
  buildOpenClawResolvePayload,
} from '../src/openclaw.js';

test('buildOpenClawResolvePayload returns direct media urls, proxy media urls, and reply text', () => {
  const result = buildOpenClawResolvePayload({
    noteId: 'abc123',
    title: '示例帖子',
    description: '正文内容',
    resolvedUrl: 'https://www.xiaohongshu.com/explore/abc123',
    author: { nickname: '作者A' },
    media: [
      { type: 'image', url: 'https://ci.xiaohongshu.com/demo-a' },
      { type: 'video', url: 'https://sns-video-bd.xhscdn.com/demo.mp4' },
    ],
  }, {
    baseUrl: 'http://127.0.0.1:3000',
  });

  assert.match(result.text, /示例帖子/);
  assert.equal(result.mediaUrls.length, 2);
  assert.equal(result.mediaUrls[0], 'https://ci.xiaohongshu.com/demo-a');
  assert.equal(result.mediaUrls[1], 'https://sns-video-bd.xhscdn.com/demo.mp4');
  assert.equal(result.proxyMediaUrls.length, 2);
  assert.match(result.telegramReply, /^\[\[reply_to_current\]\]\n给你发回来啦\nMEDIA:https:\/\/ci\.xiaohongshu\.com\/demo-a\nMEDIA:https:\/\/sns-video-bd\.xhscdn\.com\/demo\.mp4$/);
  assert.match(result.proxyMediaUrls[0], /^http:\/\/127\.0\.0\.1:3000\/api\/media\?/);
  assert.match(result.proxyMediaUrls[1], /filename=/);
});

test('buildMcporterConfigSnippet includes node command and service base url env', () => {
  const snippet = buildMcporterConfigSnippet({
    serverName: 'rednote',
    nodeCommand: 'node',
    mcpScriptPath: '/tmp/rednote/src/mcp-server.js',
    serviceBaseUrl: 'http://127.0.0.1:3000',
  });

  assert.match(snippet, /"rednote"/);
  assert.match(snippet, /"command": "node"/);
  assert.match(snippet, /"REDNOTE_SERVICE_BASE_URL": "http:\/\/127\.0\.0\.1:3000"/);
});

test('buildOpenClawAgentPrompt references the MCP tool', () => {
  const prompt = buildOpenClawAgentPrompt({
    serverName: 'rednote',
    toolName: 'resolve_rednote_media',
  });

  assert.match(prompt, /rednote\.resolve_rednote_media/);
  assert.match(prompt, /telegramReply/);
  assert.match(prompt, /mediaUrls/);
  assert.match(prompt, /proxyMediaUrls/);
});
