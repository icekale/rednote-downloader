import path from 'node:path';
import { access, copyFile, mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';

const DEFAULT_OPENCLAW_SERVICE_BASE_URL = '';
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

export const DEFAULT_APP_STATE = {
  telegram: {
    updateOffset: 0,
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

export function normalizeEnvBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }

  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }

  return fallback;
}

export function normalizeDeliveryMode(value) {
  return value === 'preview' ? 'preview' : 'document';
}

export function normalizeServiceBaseUrl(value, fallback = DEFAULT_OPENCLAW_SERVICE_BASE_URL) {
  const trimmed = normalizeString(value, fallback);
  if (!trimmed) {
    return fallback;
  }

  try {
    const url = new URL(trimmed);
    url.pathname = '';
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return fallback;
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
      serviceBaseUrl: normalizeServiceBaseUrl(openclaw.serviceBaseUrl, DEFAULT_APP_CONFIG.openclaw.serviceBaseUrl),
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

export function getAppStatePath(env = process.env, downloadDir, configPath = '') {
  if (env.APP_STATE_PATH) {
    return path.resolve(env.APP_STATE_PATH);
  }

  if (configPath) {
    return path.resolve(path.join(path.dirname(configPath), '.rednote-state.json'));
  }

  return path.resolve(path.join(downloadDir, '.rednote-state.json'));
}

async function fileExists(targetPath) {
  try {
    await access(targetPath);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return false;
    }

    throw error;
  }
}

async function migrateLegacyFile(legacyPaths, nextPath) {
  const target = path.resolve(nextPath);

  if (await fileExists(target)) {
    return false;
  }

  const candidates = Array.isArray(legacyPaths) ? legacyPaths : [legacyPaths];
  const source = await (async () => {
    for (const candidate of candidates) {
      const resolved = path.resolve(candidate);
      if (resolved === target) {
        continue;
      }

      if (await fileExists(resolved)) {
        return resolved;
      }
    }

    return '';
  })();

  if (!source) {
    return false;
  }

  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
  return true;
}

export async function migrateLegacyAppFiles({ downloadDir, configPath, statePath }) {
  const legacyDirCandidates = [
    path.resolve(downloadDir),
    path.resolve(path.dirname(downloadDir)),
  ];

  return {
    config: await migrateLegacyFile(
      legacyDirCandidates.map((dir) => path.join(dir, '.rednote-config.json')),
      configPath,
    ),
    state: await migrateLegacyFile(
      legacyDirCandidates.map((dir) => path.join(dir, '.rednote-state.json')),
      statePath,
    ),
  };
}

export function looksLikeLegacyDownloadEntry(name) {
  if (typeof name !== 'string' || !name || name.startsWith('.')) {
    return false;
  }

  const stem = name.replace(/\.[^.]+$/, '');
  return /_[A-Za-z0-9]{6,}$/.test(stem);
}

export async function migrateLegacyDownloadEntries(downloadDir) {
  const targetDir = path.resolve(downloadDir);
  const legacyRootDir = path.resolve(path.dirname(targetDir));
  const reservedNames = new Set([
    path.basename(targetDir),
    'config',
  ]);
  const moved = [];

  await mkdir(targetDir, { recursive: true });

  if (legacyRootDir === targetDir) {
    return moved;
  }

  const entries = await readdir(legacyRootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (reservedNames.has(entry.name) || !looksLikeLegacyDownloadEntry(entry.name)) {
      continue;
    }

    const sourcePath = path.join(legacyRootDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (await fileExists(targetPath)) {
      continue;
    }

    await rename(sourcePath, targetPath);
    moved.push(entry.name);
  }

  return moved;
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

export function sanitizeAppState(input = {}) {
  const telegram = input?.telegram || {};

  return {
    telegram: {
      updateOffset: normalizeNonNegativeInteger(
        telegram.updateOffset,
        DEFAULT_APP_STATE.telegram.updateOffset,
      ),
    },
  };
}

export async function loadAppState(statePath) {
  try {
    const content = await readFile(statePath, 'utf8');
    return sanitizeAppState(JSON.parse(content));
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return sanitizeAppState(DEFAULT_APP_STATE);
    }

    throw error;
  }
}

export async function saveAppState(statePath, state) {
  const normalized = sanitizeAppState(state);
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
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
