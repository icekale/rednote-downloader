import http from 'node:http';
import path from 'node:path';
import { Readable } from 'node:stream';
import { access, mkdir, readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { downloadMedia, fetchMediaResponse, resolveNote, sanitizeFileName } from './xhs.js';
import { TelegramBotRunner, parseAllowedChatIds } from './telegram.js';
import {
  getAppConfigPath,
  getAppStatePath,
  getPublicConfig,
  loadAppState,
  loadAppConfig,
  mergeAppConfig,
  migrateLegacyAppFiles,
  migrateLegacyDownloadEntries,
  normalizeDeliveryMode,
  normalizeEnvBoolean,
  normalizeServiceBaseUrl,
  saveAppConfig,
  saveAppState,
} from './config.js';
import { buildOpenClawResolvePayload, buildOpenClawTemplate } from './openclaw.js';

const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';
const DOWNLOAD_DIR = path.resolve(process.env.DOWNLOAD_DIR || path.join(process.cwd(), 'data'));
const APP_CONFIG_PATH = getAppConfigPath(process.env, DOWNLOAD_DIR);
const APP_STATE_PATH = getAppStatePath(process.env, DOWNLOAD_DIR, APP_CONFIG_PATH);
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const ADMIN_TOKEN = (process.env.REDNOTE_ADMIN_TOKEN || '').trim();
const CORS_ALLOWED_ORIGINS = new Set(
  String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const ADMIN_HEADER_NAME = 'X-Admin-Token';
const ADMIN_PATHS = new Set([
  '/api/config',
  '/api/telegram/status',
  '/api/diagnostics',
  '/api/openclaw/template',
]);

const STATIC_ROUTES = new Map([
  ['/', 'index.html'],
  ['/app.js', 'app.js'],
  ['/cookie-utils.js', 'cookie-utils.js'],
  ['/styles.css', 'styles.css'],
]);

function normalizeOrigin(value) {
  try {
    const url = new URL(value);
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

function buildCorsHeaders(request) {
  const origin = normalizeOrigin(request?.headers.origin || '');
  if (!origin) {
    return {};
  }

  const requestOrigin = normalizeOrigin(getRequestOrigin(request));
  if (origin !== requestOrigin && !CORS_ALLOWED_ORIGINS.has(origin)) {
    return {};
  }

  return {
    'Access-Control-Allow-Headers': `Content-Type, ${ADMIN_HEADER_NAME}`,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
  };
}

function sendJson(...args) {
  let request = null;
  let response;
  let statusCode;
  let payload;
  let extraHeaders = {};

  if (args.length >= 4) {
    [request, response, statusCode, payload, extraHeaders = {}] = args;
  } else {
    [response, statusCode, payload, extraHeaders = {}] = args;
  }

  response.writeHead(statusCode, {
    ...buildCorsHeaders(request),
    ...extraHeaders,
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload, null, 2));
}

function contentTypeFromFileName(fileName) {
  if (fileName.endsWith('.html')) return 'text/html; charset=utf-8';
  if (fileName.endsWith('.css')) return 'text/css; charset=utf-8';
  if (fileName.endsWith('.js')) return 'text/javascript; charset=utf-8';
  return 'application/octet-stream';
}

function inferFileNameFromUrl(input, fallback = 'media') {
  try {
    const pathname = new URL(input).pathname;
    const candidate = pathname.split('/').pop();
    if (candidate) {
      return sanitizeFileName(decodeURIComponent(candidate), fallback);
    }
  } catch {
    return fallback;
  }

  return fallback;
}

function toAsciiHeaderFileName(fileName) {
  const ascii = sanitizeFileName(fileName, 'media')
    .normalize('NFKD')
    .replace(/[^\x20-\x7e]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return ascii || 'media';
}

function buildDisposition(fileName, inline) {
  const safe = sanitizeFileName(fileName, 'media');
  const asciiFallback = toAsciiHeaderFileName(safe);
  const encoded = encodeURIComponent(safe);
  return `${inline ? 'inline' : 'attachment'}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';

    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('Request body too large'));
        request.destroy();
      }
    });

    request.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Request body must be valid JSON'));
      }
    });

    request.on('error', reject);
  });
}

function getRequestOrigin(request) {
  const protocol = request.headers['x-forwarded-proto']
    || (request.socket.encrypted ? 'https' : 'http');
  const host = request.headers['x-forwarded-host'] || request.headers.host || `127.0.0.1:${PORT}`;
  return `${protocol}://${host}`.replace(/\/$/, '');
}

function isAdminPath(pathname) {
  return ADMIN_PATHS.has(pathname);
}

function isAdminAuthorized(request) {
  if (!ADMIN_TOKEN) {
    return true;
  }

  return request.headers['x-admin-token'] === ADMIN_TOKEN;
}

function sendAdminUnauthorized(request, response) {
  sendJson(request, response, 401, {
    ok: false,
    error: `Admin token required. Set the ${ADMIN_HEADER_NAME} header or REDNOTE_ADMIN_TOKEN in the UI.`,
  }, {
    'Cache-Control': 'no-store',
  });
}

function buildTelegramRuntimeConfig(config) {
  const saved = config?.telegram || {};
  const hasSavedToken = Boolean(saved.botToken);
  const token = hasSavedToken ? saved.botToken : (process.env.TELEGRAM_BOT_TOKEN || '').trim();
  const envEnabled = normalizeEnvBoolean(process.env.TELEGRAM_ENABLED, true);

  if (!envEnabled || !token) {
    return null;
  }

  const deliveryMode = hasSavedToken
    ? normalizeDeliveryMode(saved.deliveryMode)
    : normalizeDeliveryMode(process.env.TELEGRAM_DELIVERY_MODE);
  const allowedChatIds = hasSavedToken
    ? parseAllowedChatIds(saved.allowedChatIds)
    : parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
  const enabled = hasSavedToken ? saved.enabled : true;

  if (!enabled) {
    return null;
  }

  return {
    token,
    allowedChatIds,
    deliveryMode,
  };
}

const legacyMigration = await migrateLegacyAppFiles({
  downloadDir: DOWNLOAD_DIR,
  configPath: APP_CONFIG_PATH,
  statePath: APP_STATE_PATH,
});
const migratedLegacyDownloads = await migrateLegacyDownloadEntries(DOWNLOAD_DIR);

let appConfig = await loadAppConfig(APP_CONFIG_PATH);
let appState = await loadAppState(APP_STATE_PATH);
let telegramBot = null;
let telegramRuntimeConfig = null;

async function persistTelegramOffset(offset) {
  if (!Number.isInteger(offset) || offset < 0 || offset === appState.telegram.updateOffset) {
    return;
  }

  appState = await saveAppState(APP_STATE_PATH, {
    ...appState,
    telegram: {
      ...appState.telegram,
      updateOffset: offset,
    },
  });
}

async function applyTelegramRuntime() {
  const nextRuntime = buildTelegramRuntimeConfig(appConfig);

  if (telegramBot) {
    await telegramBot.stop();
    telegramBot = null;
  }

  telegramRuntimeConfig = nextRuntime;

  if (nextRuntime) {
    telegramBot = new TelegramBotRunner({
      ...nextRuntime,
      initialOffset: appState.telegram.updateOffset,
      onOffsetChange: persistTelegramOffset,
    });
    void telegramBot.start();
  }
}

async function handleResolve(request, response, url) {
  const queryInput = url.searchParams.get('input');
  const queryDownload = url.searchParams.get('download');
  const body = request.method === 'POST' ? await readJsonBody(request) : {};
  const input = body.input || queryInput;
  const download = body.download ?? queryDownload === 'true';

  if (!input || typeof input !== 'string') {
    sendJson(request, response, 400, {
      ok: false,
      error: 'Missing required `input` string. You can send a Xiaohongshu share text, an x.com/twitter.com URL, or the full share text.',
    });
    return;
  }

  const note = await resolveNote(input, {
    cookie: body.cookie,
  });

  if (!download) {
    sendJson(request, response, 200, {
      ok: true,
      note,
    });
    return;
  }

  const downloaded = await downloadMedia(
    note.media,
    note.title,
    note.noteId,
    DOWNLOAD_DIR,
    {
      cookie: body.cookie,
      noteDescription: note.description,
    },
  );

  sendJson(request, response, 200, {
    ok: true,
    note: {
      ...note,
      media: downloaded.files,
    },
    download: {
      outputDir: downloaded.outputDir,
    },
  });
}

async function handleStatic(response, pathname) {
  const fileName = STATIC_ROUTES.get(pathname);
  if (!fileName) {
    return false;
  }

  const absolutePath = path.join(PUBLIC_DIR, fileName);
  const content = await readFile(absolutePath);

  response.writeHead(200, {
    'Content-Type': contentTypeFromFileName(fileName),
  });
  response.end(content);
  return true;
}

async function handleMediaProxy(request, response, url) {
  const target = url.searchParams.get('url');
  const fallbackTargets = url.searchParams.getAll('fallback').filter(Boolean);
  const inline = url.searchParams.get('inline') === '1';
  const requestedName = url.searchParams.get('filename');

  if (!target) {
    sendJson(request, response, 400, {
      ok: false,
      error: 'Missing required `url` query parameter.',
    });
    return;
  }

  const rangeHeader = request.headers.range ? { Range: request.headers.range } : undefined;
  const candidates = [...new Set([target, ...fallbackTargets])];
  const errors = [];
  let proxied = null;

  for (const candidate of candidates) {
    try {
      proxied = await fetchMediaResponse(candidate, {
        headers: rangeHeader,
      });
      break;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (!proxied) {
    throw new Error(errors[0] || 'Failed to proxy media');
  }

  const fileName = requestedName || inferFileNameFromUrl(proxied.url.toString());
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Disposition': buildDisposition(fileName, inline),
  };

  const passthroughHeaders = [
    'accept-ranges',
    'cache-control',
    'content-length',
    'content-range',
    'content-type',
    'etag',
    'last-modified',
  ];

  for (const headerName of passthroughHeaders) {
    const headerValue = proxied.response.headers.get(headerName);
    if (headerValue) {
      headers[headerName] = headerValue;
    }
  }

  response.writeHead(proxied.response.status, headers);
  await pipeline(Readable.fromWeb(proxied.response.body), response);
}

async function handleConfigRead(request, response) {
  sendJson(request, response, 200, {
    ok: true,
    config: getPublicConfig(appConfig),
    configPath: APP_CONFIG_PATH,
  });
}

async function handleConfigWrite(request, response) {
  const body = await readJsonBody(request);
  appConfig = mergeAppConfig(appConfig, body);
  appConfig = await saveAppConfig(APP_CONFIG_PATH, appConfig);
  await applyTelegramRuntime();

  sendJson(request, response, 200, {
    ok: true,
    config: getPublicConfig(appConfig),
    configPath: APP_CONFIG_PATH,
  });
}

async function handleTelegramStatus(request, response) {
  const config = getPublicConfig(appConfig);
  sendJson(request, response, 200, {
    ok: true,
    telegram: {
      ...config.telegram,
      runtimeEnabled: Boolean(telegramRuntimeConfig),
      allowedChatIdsConfigured: Boolean(telegramRuntimeConfig?.allowedChatIds?.size),
      deliveryMode: telegramRuntimeConfig?.deliveryMode || config.telegram.deliveryMode,
    },
  });
}

async function pathExists(targetPath) {
  if (!targetPath) {
    return false;
  }

  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function probeJsonEndpoint(url) {
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(1500),
    });
    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      detail: text.slice(0, 160),
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      detail: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

function buildDiagnosticsHints(context) {
  const hints = [];

  if (context.telegram.enabled && !context.telegram.runtimeEnabled) {
    hints.push('Telegram 在配置里已启用，但运行态没有拉起。通常是 Bot Token 缺失或保存后尚未生效。');
  }

  if (!context.telegram.botTokenSet) {
    hints.push('当前没有保存 Telegram Bot Token，Telegram 标签页里的“图形化 Bot 配置”还需要补全。');
  }

  if (!context.openclaw.mcpScriptExists) {
    hints.push('OpenClaw 的 MCP 脚本路径当前不可读。若 rednote 在 Docker、OpenClaw 在宿主机，请填写宿主机真实路径。');
  }

  if (!context.checks.configuredServiceBase.ok) {
    hints.push('配置中的 OpenClaw Service Base URL 没有通过健康检查，OpenClaw 调用 rednote 时可能会连不上。');
  }

  if (!context.telegram.allowedChatIdsConfigured) {
    hints.push('Telegram 目前没有配置 Chat ID 白名单，默认会接受所有会话。');
  }

  return hints;
}

async function handleDiagnostics(request, response) {
  const config = getPublicConfig(appConfig);
  const origin = getRequestOrigin(request);
  const serviceBaseUrl = normalizeServiceBaseUrl(config.openclaw.serviceBaseUrl || origin);
  const template = buildOpenClawTemplate({
    serviceBaseUrl,
    serverName: config.openclaw.mcpServerName,
    toolName: config.openclaw.toolName,
    preferredAgentId: config.openclaw.preferredAgentId,
    mcpScriptPath: config.openclaw.mcpScriptPath || path.join(process.cwd(), 'src', 'mcp-server.js'),
    nodeCommand: 'node',
  });

  const [serviceHealth, configuredServiceBase, mcpScriptExists] = await Promise.all([
    probeJsonEndpoint(`${origin}/healthz`),
    probeJsonEndpoint(`${serviceBaseUrl}/healthz`),
    pathExists(template.mcpScriptPath),
  ]);

  const diagnostics = {
    generatedAt: new Date().toISOString(),
    service: {
      origin,
      host: HOST,
      port: PORT,
      downloadDir: DOWNLOAD_DIR,
      configPath: APP_CONFIG_PATH,
      statePath: APP_STATE_PATH,
    },
    telegram: {
      ...config.telegram,
      runtimeEnabled: Boolean(telegramRuntimeConfig),
      allowedChatIdsConfigured: Boolean(telegramRuntimeConfig?.allowedChatIds?.size),
      allowedChatIdsCount: telegramRuntimeConfig?.allowedChatIds?.size || 0,
      deliveryMode: telegramRuntimeConfig?.deliveryMode || config.telegram.deliveryMode,
    },
    openclaw: {
      serviceBaseUrl,
      serverName: template.serverName,
      toolName: template.toolName,
      preferredAgentId: template.preferredAgentId,
      mcpScriptPath: template.mcpScriptPath,
      mcpScriptExists,
    },
    checks: {
      serviceHealth,
      configuredServiceBase,
    },
  };

  diagnostics.hints = buildDiagnosticsHints(diagnostics);

  sendJson(request, response, 200, {
    ok: true,
    diagnostics,
  });
}

async function handleOpenClawTemplate(request, response) {
  const config = getPublicConfig(appConfig);
  const template = buildOpenClawTemplate({
    serviceBaseUrl: normalizeServiceBaseUrl(config.openclaw.serviceBaseUrl || getRequestOrigin(request)),
    serverName: config.openclaw.mcpServerName,
    toolName: config.openclaw.toolName,
    preferredAgentId: config.openclaw.preferredAgentId,
    mcpScriptPath: config.openclaw.mcpScriptPath || path.join(process.cwd(), 'src', 'mcp-server.js'),
    nodeCommand: 'node',
  });

  sendJson(request, response, 200, {
    ok: true,
    openclaw: template,
  });
}

async function handleOpenClawResolve(request, response, url) {
  const queryInput = url.searchParams.get('input');
  const body = request.method === 'POST' ? await readJsonBody(request) : {};
  const input = body.input || queryInput;
  const cookie = body.cookie;

  if (!input || typeof input !== 'string') {
    sendJson(request, response, 400, {
      ok: false,
      error: 'Missing required `input` string.',
    });
    return;
  }

  const note = await resolveNote(input, { cookie });
  const baseUrl = normalizeServiceBaseUrl(
    body.serviceBaseUrl
    || appConfig.openclaw.serviceBaseUrl
    || getRequestOrigin(request),
  );

  sendJson(request, response, 200, {
    ok: true,
    note,
    openclaw: buildOpenClawResolvePayload(note, { baseUrl }),
  });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'OPTIONS') {
    response.writeHead(204, buildCorsHeaders(request));
    response.end();
    return;
  }

  try {
    if (isAdminPath(url.pathname) && !isAdminAuthorized(request)) {
      sendAdminUnauthorized(request, response);
      return;
    }

    if (request.method === 'GET' && await handleStatic(response, url.pathname)) {
      return;
    }

    if (request.method === 'GET' && url.pathname === '/healthz') {
      sendJson(request, response, 200, {
        ok: true,
        service: 'rednote-downloader',
        adminTokenRequired: Boolean(ADMIN_TOKEN),
      });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/media') {
      await handleMediaProxy(request, response, url);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/telegram/status') {
      await handleTelegramStatus(request, response);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/diagnostics') {
      await handleDiagnostics(request, response);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/config') {
      await handleConfigRead(request, response);
      return;
    }

    if (request.method === 'POST' && url.pathname === '/api/config') {
      await handleConfigWrite(request, response);
      return;
    }

    if (request.method === 'GET' && url.pathname === '/api/openclaw/template') {
      await handleOpenClawTemplate(request, response);
      return;
    }

    if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/api/openclaw/resolve') {
      await handleOpenClawResolve(request, response, url);
      return;
    }

    if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/api/resolve') {
      await handleResolve(request, response, url);
      return;
    }

    sendJson(request, response, 404, {
      ok: false,
      error: 'Not found',
    });
  } catch (error) {
    sendJson(request, response, 502, {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

for (const targetDir of new Set([
  DOWNLOAD_DIR,
  path.dirname(APP_CONFIG_PATH),
  path.dirname(APP_STATE_PATH),
])) {
  await mkdir(targetDir, { recursive: true });
}
await applyTelegramRuntime();

server.listen(PORT, HOST, () => {
  console.log(`rednote-downloader listening on http://${HOST}:${PORT}`);
  console.log(`download dir: ${DOWNLOAD_DIR}`);
  console.log(`config file: ${APP_CONFIG_PATH}`);
  console.log(`state file: ${APP_STATE_PATH}`);
  if (legacyMigration.config || legacyMigration.state) {
    console.log('[config] migrated legacy app files into the dedicated config directory');
  }
  if (migratedLegacyDownloads.length) {
    console.log(`[downloads] moved ${migratedLegacyDownloads.length} legacy entries into ${DOWNLOAD_DIR}`);
  }

  if (ADMIN_TOKEN) {
    console.log('[security] admin token protection enabled');
  } else if (HOST !== '127.0.0.1') {
    console.warn('[security] REDNOTE_ADMIN_TOKEN is not set; avoid exposing admin endpoints to untrusted networks.');
  }

  if (telegramRuntimeConfig) {
    console.log('[telegram] bot mode enabled');
    console.log(`[telegram] delivery mode: ${telegramRuntimeConfig.deliveryMode}`);
    console.log(`[telegram] update offset: ${appState.telegram.updateOffset}`);
    if (telegramRuntimeConfig.allowedChatIds.size) {
      console.log(`[telegram] restricted chats: ${[...telegramRuntimeConfig.allowedChatIds].join(', ')}`);
    }
  }
});
