import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const DEFAULT_OPENCLAW_SERVICE_BASE_URL = 'http://127.0.0.1:3000';
const DEFAULT_MCP_SERVER_NAME = 'rednote';
const DEFAULT_OPENCLAW_TOOL_NAME = 'resolve_rednote_media';

export const DEFAULT_APP_CONFIG = {
  telegram: {
    enabled: false,
    botToken: '',
    allowedChatIds: '',
    deliveryMode: 'document',
  },
  openclaw: {
    serviceBaseUrl: DEFAULT_OPENCLAW_SERVICE_BASE_URL,
    mcpServerName: DEFAULT_MCP_SERVER_NAME,
    toolName: DEFAULT_OPENCLAW_TOOL_NAME,
    preferredAgentId: 'bfxia',
    mcpScriptPath: '',
  },
};

function normalizeString(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback;
  }

  return value.trim();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === 'boolean') {
    return value;
  }

  return fallback;
}

export function normalizeDeliveryMode(value) {
  return value === 'preview' ? 'preview' : 'document';
}

export function normalizeServiceBaseUrl(value) {
  const trimmed = normalizeString(value, DEFAULT_OPENCLAW_SERVICE_BASE_URL);
  if (!trimmed) {
    return DEFAULT_OPENCLAW_SERVICE_BASE_URL;
  }

  try {
    const url = new URL(trimmed);
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return DEFAULT_OPENCLAW_SERVICE_BASE_URL;
  }
}

export function sanitizeAppConfig(input = {}) {
  const telegram = input?.telegram || {};
  const openclaw = input?.openclaw || {};

  return {
    telegram: {
      enabled: normalizeBoolean(telegram.enabled, DEFAULT_APP_CONFIG.telegram.enabled),
      botToken: normalizeString(telegram.botToken, DEFAULT_APP_CONFIG.telegram.botToken),
      allowedChatIds: normalizeString(telegram.allowedChatIds, DEFAULT_APP_CONFIG.telegram.allowedChatIds),
      deliveryMode: normalizeDeliveryMode(telegram.deliveryMode || DEFAULT_APP_CONFIG.telegram.deliveryMode),
    },
    openclaw: {
      serviceBaseUrl: normalizeServiceBaseUrl(openclaw.serviceBaseUrl || DEFAULT_APP_CONFIG.openclaw.serviceBaseUrl),
      mcpServerName: normalizeString(openclaw.mcpServerName, DEFAULT_APP_CONFIG.openclaw.mcpServerName) || DEFAULT_MCP_SERVER_NAME,
      toolName: normalizeString(openclaw.toolName, DEFAULT_APP_CONFIG.openclaw.toolName) || DEFAULT_OPENCLAW_TOOL_NAME,
      preferredAgentId: normalizeString(openclaw.preferredAgentId, DEFAULT_APP_CONFIG.openclaw.preferredAgentId),
      mcpScriptPath: normalizeString(openclaw.mcpScriptPath, DEFAULT_APP_CONFIG.openclaw.mcpScriptPath),
    },
  };
}

export function mergeAppConfig(current, patch = {}) {
  const base = sanitizeAppConfig(current);
  const merged = {
    telegram: {
      ...base.telegram,
      ...(patch.telegram || {}),
    },
    openclaw: {
      ...base.openclaw,
      ...(patch.openclaw || {}),
    },
  };

  return sanitizeAppConfig(merged);
}

export function getAppConfigPath(env = process.env, downloadDir) {
  if (env.APP_CONFIG_PATH) {
    return path.resolve(env.APP_CONFIG_PATH);
  }

  return path.resolve(path.join(downloadDir, '.rednote-config.json'));
}

export async function loadAppConfig(configPath) {
  try {
    const content = await readFile(configPath, 'utf8');
    return sanitizeAppConfig(JSON.parse(content));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return sanitizeAppConfig(DEFAULT_APP_CONFIG);
    }

    throw error;
  }
}

export async function saveAppConfig(configPath, config) {
  const normalized = sanitizeAppConfig(config);
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  return normalized;
}

export function maskSecret(value) {
  const source = normalizeString(value);
  if (!source) {
    return '';
  }

  if (source.length <= 8) {
    return `${source.slice(0, 2)}***`;
  }

  return `${source.slice(0, 4)}***${source.slice(-4)}`;
}

export function getPublicConfig(config) {
  const normalized = sanitizeAppConfig(config);
  return {
    telegram: {
      enabled: normalized.telegram.enabled,
      botTokenMasked: maskSecret(normalized.telegram.botToken),
      botTokenSet: Boolean(normalized.telegram.botToken),
      allowedChatIds: normalized.telegram.allowedChatIds,
      deliveryMode: normalized.telegram.deliveryMode,
    },
    openclaw: normalized.openclaw,
  };
}
