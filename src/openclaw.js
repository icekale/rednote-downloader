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
  const validMedia = media.filter((item) => typeof item?.url === 'string' && item.url.trim());
  const mediaUrls = validMedia.map((item) => item.url);
  const proxyMediaUrls = validMedia
    .map((item, index) => buildOpenClawProxyMediaUrl(item, note, index, baseUrl))
    .filter(Boolean);
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

function normalizeHermesTemplateOptions(options = {}) {
  const fallbackServiceBaseUrl = 'http://127.0.0.1:3000';
  const providedServiceBaseUrl = typeof options.serviceBaseUrl === 'string' && options.serviceBaseUrl.trim()
    ? options.serviceBaseUrl.trim()
    : fallbackServiceBaseUrl;
  const serviceBaseUrl = toAbsoluteBaseUrl(providedServiceBaseUrl, fallbackServiceBaseUrl);
  const serverName = options.serverName || 'rednote';
  const toolName = options.toolName || 'resolve_rednote_media';
  const nodeCommand = options.nodeCommand || 'node';
  const mcpScriptPath = options.mcpScriptPath || path.join(process.cwd(), 'src', 'mcp-server.js');

  return { serviceBaseUrl, serverName, toolName, nodeCommand, mcpScriptPath };
}

function shellQuote(value) {
  if (typeof value !== 'string') {
    value = String(value);
  }

  if (value === '') {
    return "''";
  }

  return `'${value.replace(/'/g, "'\\''")}'`;
}

function yamlQuote(value) {
  if (value === undefined || value === null) {
    return '""';
  }

  return JSON.stringify(String(value));
}

export function buildHermesCliCommand(options = {}) {
  const { serviceBaseUrl, serverName, nodeCommand, mcpScriptPath } = normalizeHermesTemplateOptions(options);
  const args = [
    `REDNOTE_SERVICE_BASE_URL=${serviceBaseUrl}`,
    nodeCommand,
    mcpScriptPath,
  ].map(shellQuote);

  return [
    'hermes',
    'mcp',
    'add',
    shellQuote(serverName),
    '--command',
    'env',
    '--args',
    ...args,
  ].join(' ');
}

export function buildHermesYamlSnippet(options = {}) {
  const { serviceBaseUrl, serverName, nodeCommand, mcpScriptPath } = normalizeHermesTemplateOptions(options);

  return [
    'mcp_servers:',
    `  ${serverName}:`,
    `    command: ${yamlQuote(nodeCommand)}`,
    '    args:',
    `      - ${JSON.stringify(mcpScriptPath)}`,
    '    env:',
    `      REDNOTE_SERVICE_BASE_URL: ${yamlQuote(serviceBaseUrl)}`,
  ].join('\n');
}

export function buildHermesAgentPrompt(options = {}) {
  const { serverName, toolName } = normalizeHermesTemplateOptions(options);
  const toolIdentifier = `mcp_${serverName}_${toolName}`;

  return [
    'Hermes MCP agents adopt a media-first priority when exchanging telemetry for RedNote payloads.',
    `Always call \`${toolIdentifier}\` and surface the media-first response payload before replying to the user.`,
    'Leave the media ordering untouched, and honor Hermes expectations by streaming the tool output as-is.',
  ].join(' ');
}

export function buildHermesTemplate(options = {}) {
  const normalized = normalizeHermesTemplateOptions(options);
  const { serviceBaseUrl, serverName, toolName, nodeCommand, mcpScriptPath } = normalized;
  const preferredAgentId = options.preferredAgentId || 'bfxia';

  const templateOptions = { ...normalized };

  return {
    serviceBaseUrl,
    serverName,
    toolName,
    preferredAgentId,
    nodeCommand,
    mcpScriptPath,
    cliCommand: buildHermesCliCommand(templateOptions),
    yamlSnippet: buildHermesYamlSnippet(templateOptions),
    agentPrompt: buildHermesAgentPrompt(templateOptions),
  };
}

export function buildIntegrationTemplates(options = {}) {
  const { openclaw: openclawOverrides = {}, hermes: hermesOverrides = {}, ...rest } = options;
  const openclawTemplate = buildOpenClawTemplate({ ...rest, ...openclawOverrides });
  const hermesTemplate = buildHermesTemplate({ ...rest, ...hermesOverrides });

  return {
    openclaw: {
      label: 'OpenClaw MCP',
      snippetPrimaryLabel: 'McPorter configuration',
      snippetPrimary: openclawTemplate.mcporterSnippet,
      snippetSecondaryLabel: 'Agent prompt',
      snippetSecondary: openclawTemplate.agentPrompt,
      template: openclawTemplate,
    },
    hermes: {
      label: 'Hermes MCP',
      snippetPrimaryLabel: 'Hermes CLI command',
      snippetPrimary: hermesTemplate.cliCommand,
      snippetSecondaryLabel: 'Hermes YAML snippet',
      snippetSecondary: hermesTemplate.yamlSnippet,
      snippetTertiaryLabel: 'Hermes agent prompt',
      snippetTertiary: hermesTemplate.agentPrompt,
      template: hermesTemplate,
    },
  };
}
