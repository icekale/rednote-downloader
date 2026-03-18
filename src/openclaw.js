import path from 'node:path';
import { buildTelegramCaption, inferTelegramFileName } from './telegram.js';

function toAbsoluteBaseUrl(value, fallback) {
  try {
    const url = new URL(value || fallback);
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return fallback.replace(/\/$/, '');
  }
}

export function buildOpenClawProxyMediaUrl(item, note, index, baseUrl) {
  const root = toAbsoluteBaseUrl(baseUrl, 'http://127.0.0.1:3000');
  const params = new URLSearchParams({
    url: item.url,
    filename: inferTelegramFileName(item, note, index),
  });
  return `${root}/api/media?${params.toString()}`;
}

export function buildOpenClawTelegramReply(note, options = {}) {
  const payload = buildOpenClawResolvePayload(note, options);
  const lines = ['[[reply_to_current]]', '给你发回来啦'];

  for (const mediaUrl of payload.mediaUrls) {
    lines.push(`MEDIA:${mediaUrl}`);
  }

  return lines.join('\n');
}

export function buildOpenClawResolvePayload(note, options = {}) {
  const baseUrl = toAbsoluteBaseUrl(options.baseUrl, 'http://127.0.0.1:3000');
  const media = Array.isArray(note?.media) ? note.media : [];
  const mediaUrls = media.map((item) => item.url).filter(Boolean);
  const proxyMediaUrls = media.map((item, index) => buildOpenClawProxyMediaUrl(item, note, index, baseUrl));
  const text = buildTelegramCaption(note);
  const telegramReply = [
    '[[reply_to_current]]',
    '给你发回来啦',
    ...mediaUrls.map((mediaUrl) => `MEDIA:${mediaUrl}`),
  ].join('\n');

  return {
    summary: `Resolved ${mediaUrls.length} media item(s) from ${note?.resolvedUrl || 'RedNote note'}.`,
    text,
    mediaUrls,
    proxyMediaUrls,
    telegramReply,
    note: {
      noteId: note?.noteId || null,
      type: note?.type || null,
      title: note?.title || '',
      description: note?.description || '',
      author: note?.author || null,
      resolvedUrl: note?.resolvedUrl || '',
    },
  };
}

export function buildMcporterConfigSnippet(options = {}) {
  const serverName = options.serverName || 'rednote';
  const serviceBaseUrl = options.serviceBaseUrl || 'http://127.0.0.1:3000';
  const nodeCommand = options.nodeCommand || 'node';
  const mcpScriptPath = options.mcpScriptPath || path.join(process.cwd(), 'src', 'mcp-server.js');

  return JSON.stringify({
    mcpServers: {
      [serverName]: {
        command: nodeCommand,
        args: [mcpScriptPath],
        env: {
          REDNOTE_SERVICE_BASE_URL: serviceBaseUrl,
        },
      },
    },
  }, null, 2);
}

export function buildOpenClawAgentPrompt(options = {}) {
  const serverName = options.serverName || 'rednote';
  const toolName = options.toolName || 'resolve_rednote_media';

  return [
    `当用户发来小红书链接、xhslink 链接、x.com/twitter.com 链接，或整段分享文案时，先调用 MCP 工具 \`${serverName}.${toolName}\`。`,
    '拿到工具结果后，优先直接使用工具返回的 `telegramReply` 作为最终回复，整段原样输出，不要自己重写。',
    '如果当前会话在 Telegram 中，不要改写 `MEDIA:` 行，也不要把 `proxyMediaUrls` 当成 Telegram 回发地址。',
    '注意：`mediaUrls` 是给 Telegram/OpenClaw 用的外部直链；`proxyMediaUrls` 只是本地服务代理链。',
    '不要把一长串媒体直链直接贴给用户；优先直接发送图片和视频。',
    '如果工具返回失败，再用简短中文解释失败原因，并提醒用户补 Cookie 或换公开可访问链接。',
  ].join('\n');
}

export function buildOpenClawTemplate(options = {}) {
  return {
    serviceBaseUrl: options.serviceBaseUrl || 'http://127.0.0.1:3000',
    serverName: options.serverName || 'rednote',
    toolName: options.toolName || 'resolve_rednote_media',
    preferredAgentId: options.preferredAgentId || 'bfxia',
    mcpScriptPath: options.mcpScriptPath || path.join(process.cwd(), 'src', 'mcp-server.js'),
    mcporterSnippet: buildMcporterConfigSnippet(options),
    agentPrompt: buildOpenClawAgentPrompt(options),
  };
}
