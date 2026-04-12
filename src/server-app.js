import http from 'node:http';
import path from 'node:path';
import { constants as fsConstants } from 'node:fs';
import { Readable } from 'node:stream';
import { access, mkdir, readFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import packageMeta from '../package.json' with { type: 'json' };
import { mapWithConcurrency, normalizePositiveInt } from './async-utils.js';
import { downloadMedia, extractAllUrls, fetchMediaResponse, resolveNote, sanitizeFileName } from './xhs.js';
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
import { buildIntegrationTemplates, buildOpenClawResolvePayload, buildOpenClawTemplate } from './openclaw.js';

const DEFAULT_ADMIN_HEADER_NAME = 'X-Admin-Token';
const ADMIN_PATHS = new Set([
  '/api/config',
  '/api/telegram/status',
  '/api/diagnostics',
  '/api/openclaw/template',
  '/api/integration/template',
]);

const DEFAULT_STATIC_ROUTES = new Map([
  ['/', 'index.html'],
  ['/app.js', 'app.js'],
  ['/cookie-utils.js', 'cookie-utils.js'],
  ['/integration-utils.js', path.join(process.cwd(), 'src', 'shared', 'agent-integration.js')],
  ['/icon.svg', 'icon.svg'],
  ['/media-filenames.js', path.join(process.cwd(), 'src', 'shared', 'media-filenames.js')],
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

function normalizeUiLanguage(value) {
  return String(value || '').trim().toLowerCase() === 'en' ? 'en' : 'zh';
}

function contentTypeFromFileName(fileName) {
  if (fileName.endsWith('.html')) return 'text/html; charset=utf-8';
  if (fileName.endsWith('.css')) return 'text/css; charset=utf-8';
  if (fileName.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (fileName.endsWith('.svg')) return 'image/svg+xml';
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

function getRequestOrigin(request, fallbackPort) {
  const protocol = request.headers['x-forwarded-proto']
    || (request.socket.encrypted ? 'https' : 'http');
  const host = request.headers['x-forwarded-host'] || request.headers.host || `127.0.0.1:${fallbackPort}`;
  return `${protocol}://${host}`.replace(/\/$/, '');
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

async function probeCliAvailable(binaryName, env = process.env) {
  const name = typeof binaryName === 'string' ? binaryName.trim() : '';
  const pathValue = typeof env?.PATH === 'string' ? env.PATH : '';
  if (!name || !pathValue) {
    return false;
  }

  const dirs = pathValue.split(path.delimiter).map((value) => value.trim()).filter(Boolean);
  const suffixes = process.platform === 'win32'
    ? ['.exe', '.cmd', '.bat', '']
    : [''];

  for (const dir of dirs) {
    for (const suffix of suffixes) {
      const candidate = path.join(dir, `${name}${suffix}`);
      try {
        await access(candidate, fsConstants.X_OK);
        return true;
      } catch {
        // keep searching
      }
    }
  }

  return false;
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

function buildDiagnosticsHints(context, language = 'zh') {
  const hints = [];
  const isEnglish = language === 'en';

  if (context.telegram.enabled && !context.telegram.runtimeEnabled) {
    hints.push(
      isEnglish
        ? 'Telegram is enabled in config, but the runtime is not running. This is usually caused by a missing bot token or a config change that has not been applied yet.'
        : 'Telegram 在配置里已启用，但运行态没有拉起。通常是 Bot Token 缺失或保存后尚未生效。',
    );
  }

  if (!context.telegram.botTokenSet) {
    hints.push(
      isEnglish
        ? 'No Telegram bot token is currently saved. Finish the setup in the Telegram tab before testing the bot workflow.'
        : '当前没有保存 Telegram Bot Token，Telegram 标签页里的“图形化 Bot 配置”还需要补全。',
    );
  }

  if (!context.openclaw.mcpScriptExists) {
    hints.push(
      isEnglish
        ? 'The configured OpenClaw MCP script path is not readable. If rednote runs in Docker and OpenClaw runs on the host, use the real host path instead of an in-container path.'
        : 'OpenClaw 的 MCP 脚本路径当前不可读。若 rednote 在 Docker、OpenClaw 在宿主机，请填写宿主机真实路径。',
    );
  }

  if (!context.checks.configuredServiceBase.ok) {
    hints.push(
      isEnglish
        ? 'The configured OpenClaw service base URL did not pass the health check, so OpenClaw may fail to connect back to rednote.'
        : '配置中的 OpenClaw Service Base URL 没有通过健康检查，OpenClaw 调用 rednote 时可能会连不上。',
    );
  }

  if (!context.telegram.allowedChatIdsConfigured) {
    hints.push(
      isEnglish
        ? 'Telegram currently has no Chat ID allowlist configured, so the bot will accept messages from any chat by default.'
        : 'Telegram 目前没有配置 Chat ID 白名单，默认会接受所有会话。',
    );
  }

  return hints;
}

function buildTelegramRuntimeConfig(config, env) {
  const saved = config?.telegram || {};
  const hasSavedToken = Boolean(saved.botToken);
  const token = hasSavedToken ? saved.botToken : (env.TELEGRAM_BOT_TOKEN || '').trim();
  const envEnabled = normalizeEnvBoolean(env.TELEGRAM_ENABLED, true);

  if (!envEnabled || !token) {
    return null;
  }

  const deliveryMode = hasSavedToken
    ? normalizeDeliveryMode(saved.deliveryMode)
    : normalizeDeliveryMode(env.TELEGRAM_DELIVERY_MODE);
  const allowedChatIds = hasSavedToken
    ? parseAllowedChatIds(saved.allowedChatIds)
    : parseAllowedChatIds(env.TELEGRAM_ALLOWED_CHAT_IDS);
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

export function buildServerOptions(options = {}) {
  const env = options.env || process.env;
  const downloadDir = path.resolve(options.downloadDir || env.DOWNLOAD_DIR || path.join(process.cwd(), 'data'));
  const appConfigPath = path.resolve(options.appConfigPath || getAppConfigPath(env, downloadDir));
  const appStatePath = path.resolve(options.appStatePath || getAppStatePath(env, downloadDir, appConfigPath));
  const adminToken = typeof options.adminToken === 'string'
    ? options.adminToken.trim()
    : String(env.REDNOTE_ADMIN_TOKEN || '').trim();
  const corsAllowedOrigins = Array.isArray(options.corsAllowedOrigins)
    ? options.corsAllowedOrigins
    : String(env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

  return {
    env,
    port: options.port ?? Number.parseInt(env.PORT || '3000', 10),
    host: options.host || env.HOST || '127.0.0.1',
    appVersion: options.appVersion || packageMeta.version,
    downloadDir,
    appConfigPath,
    appStatePath,
    publicDir: path.resolve(options.publicDir || path.join(process.cwd(), 'public')),
    adminToken,
    adminHeaderName: options.adminHeaderName || DEFAULT_ADMIN_HEADER_NAME,
    corsAllowedOrigins: new Set(corsAllowedOrigins.map(normalizeOrigin).filter(Boolean)),
    batchResolveConcurrency: normalizePositiveInt(options.batchResolveConcurrency ?? env.BATCH_RESOLVE_CONCURRENCY, 3),
    mediaDownloadConcurrency: normalizePositiveInt(options.mediaDownloadConcurrency ?? env.MEDIA_DOWNLOAD_CONCURRENCY, 3),
    staticRoutes: options.staticRoutes || DEFAULT_STATIC_ROUTES,
    log: options.log || console,
    skipMigrations: Boolean(options.skipMigrations),
    dependencies: {
      downloadMedia,
      extractAllUrls,
      fetchMediaResponse,
      resolveNote,
      TelegramBotRunner,
      ...options.dependencies,
    },
  };
}

export async function createRednoteApp(options = {}) {
  const settings = buildServerOptions(options);
  const {
    downloadMedia: downloadMediaImpl,
    extractAllUrls: extractAllUrlsImpl,
    fetchMediaResponse: fetchMediaResponseImpl,
    resolveNote: resolveNoteImpl,
    TelegramBotRunner: TelegramBotRunnerImpl,
  } = settings.dependencies;
  const legacyMigration = settings.skipMigrations
    ? { config: false, state: false }
    : await migrateLegacyAppFiles({
      downloadDir: settings.downloadDir,
      configPath: settings.appConfigPath,
      statePath: settings.appStatePath,
    });
  const migratedLegacyDownloads = settings.skipMigrations
    ? []
    : await migrateLegacyDownloadEntries(settings.downloadDir);

  let appConfig = await loadAppConfig(settings.appConfigPath);
  let appState = await loadAppState(settings.appStatePath);
  let telegramBot = null;
  let telegramRuntimeConfig = null;

  function buildCorsHeaders(request) {
    const origin = normalizeOrigin(request?.headers.origin || '');
    if (!origin) {
      return {};
    }

    const requestOrigin = normalizeOrigin(getRequestOrigin(request, settings.port));
    if (origin !== requestOrigin && !settings.corsAllowedOrigins.has(origin)) {
      return {};
    }

    return {
      'Access-Control-Allow-Headers': `Content-Type, ${settings.adminHeaderName}`,
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

  function isAdminPath(pathname) {
    return ADMIN_PATHS.has(pathname);
  }

  function isAdminAuthorized(request) {
    if (!settings.adminToken) {
      return true;
    }

    const headerName = String(settings.adminHeaderName || DEFAULT_ADMIN_HEADER_NAME).toLowerCase();
    const provided = request.headers[headerName];

    if (Array.isArray(provided)) {
      return provided.includes(settings.adminToken);
    }

    return provided === settings.adminToken;
  }

  function sendAdminUnauthorized(request, response) {
    sendJson(request, response, 401, {
      ok: false,
      error: `Admin token required. Set the ${settings.adminHeaderName} header or REDNOTE_ADMIN_TOKEN in the UI.`,
    }, {
      'Cache-Control': 'no-store',
    });
  }

  async function persistTelegramOffset(offset) {
    if (!Number.isInteger(offset) || offset < 0 || offset === appState.telegram.updateOffset) {
      return;
    }

    appState = await saveAppState(settings.appStatePath, {
      ...appState,
      telegram: {
        ...appState.telegram,
        updateOffset: offset,
      },
    });
  }

  async function applyTelegramRuntime() {
    const nextRuntime = buildTelegramRuntimeConfig(appConfig, settings.env);

    if (telegramBot) {
      await telegramBot.stop();
      telegramBot = null;
    }

    telegramRuntimeConfig = nextRuntime;

    if (nextRuntime) {
      telegramBot = new TelegramBotRunnerImpl({
        ...nextRuntime,
        initialOffset: appState.telegram.updateOffset,
        onOffsetChange: persistTelegramOffset,
      });
      void telegramBot.start();
    }
  }

  async function resolveInputResult(resolvedInput, body, download) {
    const note = await resolveNoteImpl(resolvedInput, {
      cookie: body.cookie,
    });

    if (!download) {
      return {
        input: resolvedInput,
        ok: true,
        note,
      };
    }

    const downloaded = await downloadMediaImpl(
      note.media,
      note.title,
      note.noteId,
      settings.downloadDir,
      {
        cookie: body.cookie,
        noteDescription: note.description,
        concurrency: settings.mediaDownloadConcurrency,
      },
    );

    return {
      input: resolvedInput,
      ok: true,
      note: {
        ...note,
        media: downloaded.files,
      },
      download: {
        outputDir: downloaded.outputDir,
      },
    };
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

    const inputs = extractAllUrlsImpl(input);

    if (inputs.length > 1) {
      const results = await mapWithConcurrency(
        inputs,
        settings.batchResolveConcurrency,
        async (resolvedInput) => {
          try {
            return await resolveInputResult(resolvedInput, body, download);
          } catch (error) {
            return {
              input: resolvedInput,
              ok: false,
              error: error instanceof Error ? error.message : 'Unknown error',
            };
          }
        },
      );

      sendJson(request, response, 200, {
        ok: true,
        batch: true,
        results,
      });
      return;
    }

    const result = await resolveInputResult(input, body, download);
    sendJson(request, response, 200, {
      ok: true,
      note: result.note,
      download: result.download,
    });
  }

  async function handleStatic(response, pathname) {
    const fileRef = settings.staticRoutes.get(pathname);
    if (!fileRef) {
      return false;
    }

    const absolutePath = path.isAbsolute(fileRef)
      ? fileRef
      : path.join(settings.publicDir, fileRef);
    const content = await readFile(absolutePath);

    response.writeHead(200, {
      'Content-Type': contentTypeFromFileName(path.basename(absolutePath)),
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
        proxied = await fetchMediaResponseImpl(candidate, {
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
      configPath: settings.appConfigPath,
    });
  }

  async function handleConfigWrite(request, response) {
    const body = await readJsonBody(request);
    appConfig = mergeAppConfig(appConfig, body);
    appConfig = await saveAppConfig(settings.appConfigPath, appConfig);
    await applyTelegramRuntime();

    sendJson(request, response, 200, {
      ok: true,
      config: getPublicConfig(appConfig),
      configPath: settings.appConfigPath,
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

  function getIntegrationTargetPayload(templates, target) {
    return templates?.targets?.[target] || templates?.[target] || {};
  }

  function buildIntegrationTemplatePayload(configSource, origin) {
    const config = getPublicConfig(configSource);
    const openclawServiceBaseUrl = normalizeServiceBaseUrl(config.openclaw.serviceBaseUrl, origin);
    const hermesServiceBaseUrl = normalizeServiceBaseUrl(config.hermes.serviceBaseUrl, origin);

    return buildIntegrationTemplates({
      nodeCommand: 'node',
      openclaw: {
        serviceBaseUrl: openclawServiceBaseUrl,
        serverName: config.openclaw.mcpServerName,
        toolName: config.openclaw.toolName,
        preferredAgentId: config.openclaw.preferredAgentId,
        mcpScriptPath: config.openclaw.mcpScriptPath || path.join(process.cwd(), 'src', 'mcp-server.js'),
      },
      hermes: {
        serviceBaseUrl: hermesServiceBaseUrl,
        serverName: config.hermes.mcpServerName,
        toolName: config.hermes.toolName,
        preferredAgentId: config.hermes.preferredAgentId,
        mcpScriptPath: config.hermes.mcpScriptPath || path.join(process.cwd(), 'src', 'mcp-server.js'),
      },
    });
  }

  async function handleDiagnostics(request, response) {
    const config = getPublicConfig(appConfig);
    const origin = getRequestOrigin(request, settings.port);
    const url = new URL(request.url, origin);
    const language = normalizeUiLanguage(url.searchParams.get('lang'));
    const openclawServiceBaseUrl = normalizeServiceBaseUrl(config.openclaw.serviceBaseUrl, origin);
    const hermesServiceBaseUrl = normalizeServiceBaseUrl(config.hermes.serviceBaseUrl, origin);
    const templates = buildIntegrationTemplatePayload(appConfig, origin);
    const openclawTemplate = getIntegrationTargetPayload(templates, 'openclaw').template;
    const hermesTemplate = getIntegrationTargetPayload(templates, 'hermes').template;

    const [serviceHealth, configuredServiceBase, openclawMcpScriptExists, hermesMcpScriptExists, hermesCliAvailable] = await Promise.all([
      probeJsonEndpoint(`${origin}/healthz`),
      probeJsonEndpoint(`${openclawServiceBaseUrl}/healthz`),
      pathExists(openclawTemplate.mcpScriptPath),
      pathExists(hermesTemplate.mcpScriptPath),
      probeCliAvailable('hermes', settings.env),
    ]);

    const diagnostics = {
      generatedAt: new Date().toISOString(),
      service: {
        origin,
        host: settings.host,
        port: settings.port,
        downloadDir: settings.downloadDir,
        configPath: settings.appConfigPath,
        statePath: settings.appStatePath,
      },
      telegram: {
        ...config.telegram,
        runtimeEnabled: Boolean(telegramRuntimeConfig),
        allowedChatIdsConfigured: Boolean(telegramRuntimeConfig?.allowedChatIds?.size),
        allowedChatIdsCount: telegramRuntimeConfig?.allowedChatIds?.size || 0,
        deliveryMode: telegramRuntimeConfig?.deliveryMode || config.telegram.deliveryMode,
      },
      openclaw: {
        serviceBaseUrl: openclawServiceBaseUrl,
        serverName: openclawTemplate.serverName,
        toolName: openclawTemplate.toolName,
        preferredAgentId: openclawTemplate.preferredAgentId,
        mcpScriptPath: openclawTemplate.mcpScriptPath,
        mcpScriptExists: openclawMcpScriptExists,
      },
      hermes: {
        serviceBaseUrl: hermesServiceBaseUrl,
        serverName: hermesTemplate.serverName,
        toolName: hermesTemplate.toolName,
        preferredAgentId: hermesTemplate.preferredAgentId,
        mcpScriptPath: hermesTemplate.mcpScriptPath,
        mcpScriptExists: hermesMcpScriptExists,
        cliAvailable: hermesCliAvailable,
      },
      checks: {
        serviceHealth,
        configuredServiceBase,
      },
    };

    diagnostics.hints = buildDiagnosticsHints(diagnostics, language);

    sendJson(request, response, 200, {
      ok: true,
      diagnostics,
    });
  }

  async function handleOpenClawTemplate(request, response) {
    const config = getPublicConfig(appConfig);
    const template = buildOpenClawTemplate({
      serviceBaseUrl: normalizeServiceBaseUrl(config.openclaw.serviceBaseUrl, getRequestOrigin(request, settings.port)),
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

  async function handleIntegrationTemplate(request, response) {
    const origin = getRequestOrigin(request, settings.port);
    const body = request.method === 'POST' ? await readJsonBody(request) : null;
    const configSource = body ? mergeAppConfig(appConfig, body) : appConfig;
    const templates = buildIntegrationTemplatePayload(configSource, origin);

    sendJson(request, response, 200, {
      ok: true,
      integration: templates,
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

    const note = await resolveNoteImpl(input, { cookie });
    const baseUrl = normalizeServiceBaseUrl(
      body.serviceBaseUrl || appConfig.openclaw.serviceBaseUrl,
      getRequestOrigin(request, settings.port),
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
          version: settings.appVersion,
          adminTokenRequired: Boolean(settings.adminToken),
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

      if ((request.method === 'GET' || request.method === 'POST') && url.pathname === '/api/integration/template') {
        await handleIntegrationTemplate(request, response);
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
      settings.log.error('[http] request failed', request.method, url.pathname, error);

      if (response.headersSent || response.writableEnded) {
        response.destroy();
        return;
      }

      sendJson(request, response, 502, {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  async function ensureDirectories() {
    for (const targetDir of new Set([
      settings.downloadDir,
      path.dirname(settings.appConfigPath),
      path.dirname(settings.appStatePath),
    ])) {
      await mkdir(targetDir, { recursive: true });
    }
  }

  function logStartup() {
    settings.log.log(`rednote-downloader listening on http://${settings.host}:${settings.port}`);
    settings.log.log(`version: ${settings.appVersion}`);
    settings.log.log(`download dir: ${settings.downloadDir}`);
    settings.log.log(`config file: ${settings.appConfigPath}`);
    settings.log.log(`state file: ${settings.appStatePath}`);
    if (legacyMigration.config || legacyMigration.state) {
      settings.log.log('[config] migrated legacy app files into the dedicated config directory');
    }
    if (migratedLegacyDownloads.length) {
      settings.log.log(`[downloads] moved ${migratedLegacyDownloads.length} legacy entries into ${settings.downloadDir}`);
    }

    if (settings.adminToken) {
      settings.log.log('[security] admin token protection enabled');
    } else if (settings.host !== '127.0.0.1') {
      settings.log.warn('[security] REDNOTE_ADMIN_TOKEN is not set; avoid exposing admin endpoints to untrusted networks.');
    }

    if (telegramRuntimeConfig) {
      settings.log.log('[telegram] bot mode enabled');
      settings.log.log(`[telegram] delivery mode: ${telegramRuntimeConfig.deliveryMode}`);
      settings.log.log(`[telegram] update offset: ${appState.telegram.updateOffset}`);
      if (telegramRuntimeConfig.allowedChatIds.size) {
        settings.log.log(`[telegram] restricted chats: ${[...telegramRuntimeConfig.allowedChatIds].join(', ')}`);
      }
    }
  }

  async function start() {
    await ensureDirectories();
    await applyTelegramRuntime();

    if (server.listening) {
      return server;
    }

    await new Promise((resolve, reject) => {
      const onError = (error) => {
        server.off('listening', onListening);
        reject(error);
      };
      const onListening = () => {
        server.off('error', onError);
        resolve();
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(settings.port, settings.host);
    });

    if (options.logStartup !== false) {
      logStartup();
    }

    return server;
  }

  async function stop() {
    if (telegramBot) {
      await telegramBot.stop();
      telegramBot = null;
    }
    telegramRuntimeConfig = null;

    if (!server.listening) {
      return;
    }

    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }

  function getOrigin() {
    const address = server.address();
    if (!address || typeof address === 'string') {
      return `http://${settings.host}:${settings.port}`;
    }

    const host = address.family === 'IPv6' ? '127.0.0.1' : address.address;
    return `http://${host}:${address.port}`;
  }

  return {
    server,
    start,
    stop,
    getOrigin,
    getState() {
      return {
        appConfig,
        appState,
        telegramRuntimeConfig,
        legacyMigration,
        migratedLegacyDownloads,
      };
    },
    settings,
  };
}
