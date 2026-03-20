import { COOKIE_STORAGE_KEY, parseCookieText } from './cookie-utils.js';
import { inferMediaFileName } from '/media-filenames.js';

const form = document.querySelector('#resolve-form');
const input = document.querySelector('#input');
const serverDownload = document.querySelector('#server-download');
const cookieInput = document.querySelector('#cookie-input');
const cookieDropzone = document.querySelector('#cookie-dropzone');
const cookieFileInput = document.querySelector('#cookie-file');
const cookieStatusEl = document.querySelector('#cookie-status');
const saveCookieButton = document.querySelector('#save-cookie-button');
const clearCookieButton = document.querySelector('#clear-cookie-button');
const statusEl = document.querySelector('#status');
const resultEl = document.querySelector('#result');
const resultTitleEl = document.querySelector('#result-title');
const resultSummaryEl = document.querySelector('#result-summary');
const resultErrorsEl = document.querySelector('#result-errors');
const resultListEl = document.querySelector('#result-list');
const downloadAllButton = document.querySelector('#download-all-button');
const submitButton = document.querySelector('#submit-button');

const telegramEnabled = document.querySelector('#telegram-enabled');
const telegramBotToken = document.querySelector('#telegram-bot-token');
const telegramClearToken = document.querySelector('#telegram-clear-token');
const telegramAllowedChatIds = document.querySelector('#telegram-allowed-chat-ids');
const telegramDeliveryMode = document.querySelector('#telegram-delivery-mode');
const telegramTokenHint = document.querySelector('#telegram-token-hint');
const telegramConfigStatus = document.querySelector('#telegram-config-status');
const saveTelegramConfigButton = document.querySelector('#save-telegram-config-button');
const refreshRuntimeButton = document.querySelector('#refresh-runtime-button');

const openclawServiceBaseUrl = document.querySelector('#openclaw-service-base-url');
const openclawServerName = document.querySelector('#openclaw-server-name');
const openclawAgentId = document.querySelector('#openclaw-agent-id');
const openclawMcpScriptPath = document.querySelector('#openclaw-mcp-script-path');
const saveOpenClawConfigButton = document.querySelector('#save-openclaw-config-button');
const refreshOpenClawTemplateButton = document.querySelector('#refresh-openclaw-template-button');
const openclawStatus = document.querySelector('#openclaw-status');
const mcporterSnippet = document.querySelector('#mcporter-snippet');
const agentPrompt = document.querySelector('#agent-prompt');
const configPathEl = document.querySelector('#config-path');
const refreshDiagnosticsButton = document.querySelector('#refresh-diagnostics-button');
const diagnosticsCardsEl = document.querySelector('#diagnostics-cards');
const diagnosticsChecksEl = document.querySelector('#diagnostics-checks');
const diagnosticsHintsEl = document.querySelector('#diagnostics-hints');
const diagnosticsJsonEl = document.querySelector('#diagnostics-json');
const footerVersionEl = document.querySelector('#footer-version');

const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
const copyButtons = Array.from(document.querySelectorAll('[data-copy-target]'));
const langButtons = Array.from(document.querySelectorAll('.lang-button'));

let latestEntries = [];
let latestNote = null;
let latestDownload = null;
let latestDiagnostics = null;
let latestResults = [];

const UI_LANGUAGE_STORAGE_KEY = 'rednote-ui-language';
const TRANSLATIONS = {
  zh: {
    'meta.title': 'RedNote Downloader',
    'tabs.aria': '主功能标签',
    'tabs.resolve': '解析下载',
    'tabs.diagnostics': '诊断',
    'resolve.title': '帖子解析与下载',
    'resolve.input.label': '分享链接或文案',
    'resolve.input.placeholder': '把小红书分享文案、x.com 链接，或 twitter.com 链接贴在这里\n支持批量输入：一行一条链接。',
    'resolve.openPost': '查看原帖',
    'actions.title': '执行选项',
    'actions.serverDownload': '同时下载到服务端目录',
    'actions.serverDownloadNote': '公开帖子通常直接可下。只有碰到受限帖、解析失败或风控页时，再展开下面的 Cookie 选项。',
    'actions.preview': '解析并预览',
    'actions.downloadAll': '全部浏览器下载',
    'actions.proxyDownload': '代理下载',
    'actions.openOriginal': '打开原始地址',
    'actions.downloading': '下载中...',
    'cookie.summary.title': '可选 Cookie',
    'cookie.summary.hint': '仅在受限帖子时再填写',
    'cookie.title': '解析鉴权',
    'cookie.note': 'Cookie 只保存在当前浏览器。大多数公开帖子不用填，失败时再补就够了。',
    'cookie.header': 'Cookie Header',
    'cookie.placeholder': '可直接粘贴 Cookie header，也可以拖入 cookies.txt / JSON',
    'cookie.dropzone.aria': '拖拽导入 Cookie 文件',
    'cookie.dropzone.title': '拖拽 cookies.txt、JSON，或纯文本 Cookie 到这里',
    'cookie.dropzone.sub': '也可以点击这里选择文件',
    'cookie.save': '保存到本地浏览器',
    'cookie.clear': '清空 Cookie',
    'telegram.title': '图形化 Bot 配置',
    'telegram.note': '保存后立即热更新。适合本地自己调，不用再回容器里改环境变量。',
    'telegram.runtime.title': '基础设置',
    'telegram.runtime.enable': '启用 Telegram Bot',
    'telegram.runtime.token': 'Bot Token',
    'telegram.runtime.tokenPlaceholder': '留空表示保持当前已保存 Token',
    'telegram.runtime.clearToken': '保存时清空已保存 Token',
    'telegram.delivery.title': '发送策略',
    'telegram.delivery.mode': 'Delivery Mode',
    'telegram.delivery.chatIds': 'Allowed Chat IDs',
    'telegram.delivery.chatIdsPlaceholder': '多个 chat id 用逗号分隔',
    'telegram.save': '保存 Telegram 配置',
    'telegram.refresh': '刷新状态',
    'telegram.tip': '提示：document 更适合保留原始文件质量，preview 更适合直接在 Telegram 内预览。',
    'openclaw.title': 'Agent 接入',
    'openclaw.note': '生成可直接复制的 mcporter 片段和 agent 提示词，用来把小红书或 X 的媒体直接回到 Telegram。',
    'openclaw.config.title': '连接参数',
    'openclaw.config.serviceBaseAuto': '留空时自动使用当前访问地址',
    'openclaw.config.scriptPath': '宿主机 MCP 脚本路径',
    'openclaw.config.scriptPathPlaceholder': '/Users/you/.../rednote/src/mcp-server.js',
    'openclaw.save': '保存 OpenClaw 配置',
    'openclaw.refresh': '重新生成模板',
    'openclaw.tip': '如果 rednote 跑在 Docker、OpenClaw 跑在宿主机，这里必须填宿主机真实路径，不能填容器内 /app/...。',
    'openclaw.templates.title': '复制片段',
    'openclaw.templates.mcporter': 'mcporter 配置片段',
    'openclaw.templates.copyMcporter': '复制 mcporter 配置',
    'openclaw.templates.agentPrompt': 'Agent 提示词',
    'openclaw.templates.copyPrompt': '复制 Agent 提示词',
    'openclaw.templates.configPath': '服务端配置文件路径',
    'diagnostics.title': '联调状态面板',
    'diagnostics.note': '把 rednote 服务、Telegram 运行态和 OpenClaw 接线情况放到一页里，排障时不用来回翻。',
    'diagnostics.refresh': '刷新诊断',
    'diagnostics.checks.title': '健康检查',
    'diagnostics.checks.note': '快速确认服务 base URL 和本地运行态是不是都通的。',
    'diagnostics.hints.title': '建议动作',
    'diagnostics.hints.note': '根据当前配置自动给出下一步检查建议。',
    'diagnostics.raw': 'Raw Diagnostics JSON',
    'diagnostics.copy': '复制诊断 JSON',
    'results.title': '解析结果',
    'results.summary.single': '成功解析 1 条帖子，共找到 {mediaCount} 个媒体文件。',
    'results.summary.batch': '已完成 {successCount}/{totalCount} 条帖子，累计找到 {mediaCount} 个媒体文件。',
    'results.summary.batchDownload': '已完成 {successCount}/{totalCount} 条帖子，并保存到服务端目录；累计处理 {mediaCount} 个媒体文件。',
    'results.errors.title': '以下链接处理失败：',
    'footer.aria': '项目元信息',
    'footer.openSource': '开源',
    'error.adminTokenRequired': '当前实例启用了管理令牌，页面内不再提供录入入口。请通过 API Header 访问，或关闭 REDNOTE_ADMIN_TOKEN。',
    'error.requestFailed': '请求失败',
    'error.proxyDownloadFailed': '代理下载失败',
    'error.proxyDownloadFailedStatus': '代理下载失败 ({status})',
    'error.cookieImportFailed': '导入 Cookie 失败',
    'error.copyFailed': '复制失败',
    'error.initConfigFailed': '初始化配置失败',
    'status.downloadStarted': '已开始下载 {fileName}。',
    'status.parsing': '正在解析帖子页面...',
    'status.serverDownloadDone': '服务端下载完成，已保存到 {path}',
    'status.resolveDone': '解析完成，共找到 {count} 个媒体文件。',
    'status.resolveBatchDone': '批量解析完成，成功 {successCount}/{totalCount} 条，累计 {mediaCount} 个媒体文件。',
    'status.resolveBatchDownloadDone': '批量服务端下载完成，成功 {successCount}/{totalCount} 条，累计 {mediaCount} 个媒体文件。',
    'status.downloadAllPartial': '已开始下载 {successCount} 个文件，失败 {failureCount} 个：{firstFailure}',
    'status.downloadAllDone': '已开始下载 {successCount} 个文件。',
    'cookie.status.none': '当前没有保存 Cookie。',
    'cookie.status.restored': '已从本地浏览器恢复保存的 Cookie。',
    'cookie.status.removed': '输入为空，已移除本地保存的 Cookie。',
    'cookie.status.saved': 'Cookie 已保存到当前浏览器。',
    'cookie.status.cleared': 'Cookie 已清空。',
    'cookie.status.imported': '已导入 {fileName}。',
    'download.summary.title': '服务端下载完成',
    'download.summary.path': '保存路径：',
    'media.video': '视频',
    'media.image': '图片',
    'diagnostics.card.service': '服务',
    'diagnostics.card.telegram': 'Telegram',
    'diagnostics.card.openclaw': 'OpenClaw',
    'diagnostics.line.download': 'download',
    'diagnostics.line.config': 'config',
    'diagnostics.line.enabled': 'enabled',
    'diagnostics.line.runtime': 'runtime',
    'diagnostics.line.delivery': 'delivery',
    'diagnostics.line.allowlist': 'allowlist',
    'diagnostics.line.server': 'server',
    'diagnostics.line.agent': 'agent',
    'diagnostics.line.script': 'script',
    'diagnostics.value.enabled': 'yes',
    'diagnostics.value.disabled': 'no',
    'diagnostics.value.online': '在线',
    'diagnostics.value.offline': '离线',
    'diagnostics.value.ok': '正常',
    'diagnostics.value.missing': '缺失',
    'diagnostics.check.serviceHealth': '当前页面服务 healthz',
    'diagnostics.check.configuredServiceBase': 'OpenClaw Service Base URL',
    'diagnostics.check.noDetail': '无详细信息',
    'diagnostics.check.ok': '正常',
    'diagnostics.check.fail': '失败',
    'diagnostics.hints.empty': '当前没发现明显断点，链路看起来是通的。',
    'note.type.video': '视频帖',
    'note.type.normal': '图文帖',
    'note.untitled': '未命名帖子',
    'note.noDescription': '这条帖子没有公开描述文本。',
    'telegram.tokenHint.saved': '已保存 Token：{token}',
    'telegram.tokenHint.none': '当前没有保存 Telegram Token。',
    'telegram.status.saving': '正在保存 Telegram 配置...',
    'telegram.status.saved': 'Telegram 配置已保存并热更新。',
    'telegram.status.saveFailed': '保存 Telegram 配置失败',
    'telegram.status.refreshed': '运行状态已刷新。',
    'telegram.status.refreshFailed': '刷新失败',
    'openclaw.status.saving': '正在保存 OpenClaw 配置...',
    'openclaw.status.saved': 'OpenClaw 配置已保存。',
    'openclaw.status.saveFailed': '保存 OpenClaw 配置失败',
    'openclaw.status.templateFailed': '生成 OpenClaw 模板失败',
    'openclaw.status.templateReady': 'MCP server：{serverName} · 推荐 agent：{agentId}',
    'openclaw.status.diagnosticsRefreshed': '诊断信息已刷新。',
    'openclaw.status.diagnosticsFailed': '诊断刷新失败',
    'copy.mcporter': '已复制 mcporter 配置。',
    'copy.agentPrompt': '已复制 Agent 提示词。',
    'copy.diagnostics': '已复制诊断 JSON。',
  },
  en: {
    'meta.title': 'RedNote Downloader',
    'tabs.aria': 'Primary tabs',
    'tabs.resolve': 'Resolve',
    'tabs.diagnostics': 'Diagnostics',
    'resolve.title': 'Resolve And Download',
    'resolve.input.label': 'Share URL or text',
    'resolve.input.placeholder': 'Paste a Xiaohongshu share text, x.com URL, or twitter.com URL here\nBatch input is supported: one link per line.',
    'resolve.openPost': 'Open Post',
    'actions.title': 'Actions',
    'actions.serverDownload': 'Also save to the server directory',
    'actions.serverDownloadNote': 'Public posts usually work directly. Only expand the Cookie section when a post is restricted, parsing fails, or you hit an anti-bot page.',
    'actions.preview': 'Resolve And Preview',
    'actions.downloadAll': 'Download All In Browser',
    'actions.proxyDownload': 'Proxy Download',
    'actions.openOriginal': 'Open Original URL',
    'actions.downloading': 'Downloading...',
    'cookie.summary.title': 'Optional Cookie',
    'cookie.summary.hint': 'Only fill this for restricted posts',
    'cookie.title': 'Request Auth',
    'cookie.note': 'Cookies are stored only in this browser. Most public posts do not need them, so add one only if parsing fails.',
    'cookie.header': 'Cookie Header',
    'cookie.placeholder': 'Paste a Cookie header, or drop in cookies.txt / JSON',
    'cookie.dropzone.aria': 'Drop a cookie file here',
    'cookie.dropzone.title': 'Drop cookies.txt, JSON, or plain text cookies here',
    'cookie.dropzone.sub': 'Or click here to choose a file',
    'cookie.save': 'Save In Browser',
    'cookie.clear': 'Clear Cookie',
    'telegram.title': 'Bot Control Panel',
    'telegram.note': 'Changes apply immediately after saving. Good for local tuning without going back into the container.',
    'telegram.runtime.title': 'Runtime Settings',
    'telegram.runtime.enable': 'Enable Telegram Bot',
    'telegram.runtime.token': 'Bot Token',
    'telegram.runtime.tokenPlaceholder': 'Leave empty to keep the currently saved token',
    'telegram.runtime.clearToken': 'Clear the saved token on save',
    'telegram.delivery.title': 'Delivery',
    'telegram.delivery.mode': 'Delivery Mode',
    'telegram.delivery.chatIds': 'Allowed Chat IDs',
    'telegram.delivery.chatIdsPlaceholder': 'Separate multiple chat IDs with commas',
    'telegram.save': 'Save Telegram Config',
    'telegram.refresh': 'Refresh Status',
    'telegram.tip': 'Tip: document is better for preserving original file quality, while preview is better for inline Telegram viewing.',
    'openclaw.title': 'Agent Integration',
    'openclaw.note': 'Generate copy-ready mcporter snippets and agent prompts so RedNote or X media can be sent back to Telegram.',
    'openclaw.config.title': 'Connection Settings',
    'openclaw.config.serviceBaseAuto': 'leave blank to use the current origin',
    'openclaw.config.scriptPath': 'Host MCP Script Path',
    'openclaw.config.scriptPathPlaceholder': '/Users/you/.../rednote/src/mcp-server.js',
    'openclaw.save': 'Save OpenClaw Config',
    'openclaw.refresh': 'Regenerate Template',
    'openclaw.tip': 'If rednote runs in Docker and OpenClaw runs on the host, this must be the real host path, not an in-container /app/... path.',
    'openclaw.templates.title': 'Copy Snippets',
    'openclaw.templates.mcporter': 'mcporter Config Snippet',
    'openclaw.templates.copyMcporter': 'Copy mcporter Config',
    'openclaw.templates.agentPrompt': 'Agent Prompt',
    'openclaw.templates.copyPrompt': 'Copy Agent Prompt',
    'openclaw.templates.configPath': 'Server Config File Path',
    'diagnostics.title': 'Diagnostics Dashboard',
    'diagnostics.note': 'Put the rednote service, Telegram runtime, and OpenClaw wiring on one page so debugging does not require tab hopping.',
    'diagnostics.refresh': 'Refresh Diagnostics',
    'diagnostics.checks.title': 'Health Checks',
    'diagnostics.checks.note': 'Quickly confirm that the service base URL and local runtime are both reachable.',
    'diagnostics.hints.title': 'Suggested Next Steps',
    'diagnostics.hints.note': 'Generate follow-up checks automatically from the current configuration.',
    'diagnostics.raw': 'Raw Diagnostics JSON',
    'diagnostics.copy': 'Copy Diagnostics JSON',
    'results.title': 'Results',
    'results.summary.single': 'Resolved 1 post and found {mediaCount} media file(s).',
    'results.summary.batch': 'Completed {successCount}/{totalCount} posts and found {mediaCount} media file(s) in total.',
    'results.summary.batchDownload': 'Completed {successCount}/{totalCount} posts with server-side saving enabled, processing {mediaCount} media file(s) in total.',
    'results.errors.title': 'The following inputs failed:',
    'footer.aria': 'Project metadata',
    'footer.openSource': 'Open Source',
    'error.adminTokenRequired': 'This instance requires an admin token. The UI no longer exposes a token input, so use the API header or disable REDNOTE_ADMIN_TOKEN.',
    'error.requestFailed': 'Request failed',
    'error.proxyDownloadFailed': 'Proxy download failed',
    'error.proxyDownloadFailedStatus': 'Proxy download failed ({status})',
    'error.cookieImportFailed': 'Failed to import cookie',
    'error.copyFailed': 'Copy failed',
    'error.initConfigFailed': 'Failed to initialize the dashboard',
    'status.downloadStarted': 'Download started for {fileName}.',
    'status.parsing': 'Resolving the post...',
    'status.serverDownloadDone': 'Server-side download finished. Saved to {path}',
    'status.resolveDone': 'Resolved successfully. Found {count} media file(s).',
    'status.resolveBatchDone': 'Batch resolve finished with {successCount}/{totalCount} posts succeeded and {mediaCount} media file(s) found.',
    'status.resolveBatchDownloadDone': 'Batch server-side download finished with {successCount}/{totalCount} posts succeeded and {mediaCount} media file(s) processed.',
    'status.downloadAllPartial': 'Started {successCount} download(s), with {failureCount} failure(s): {firstFailure}',
    'status.downloadAllDone': 'Started {successCount} download(s).',
    'cookie.status.none': 'No saved cookie is stored in this browser.',
    'cookie.status.restored': 'Restored the saved cookie from this browser.',
    'cookie.status.removed': 'The input is empty, so the saved cookie has been removed.',
    'cookie.status.saved': 'Cookie saved in this browser.',
    'cookie.status.cleared': 'Cookie cleared.',
    'cookie.status.imported': 'Imported {fileName}.',
    'download.summary.title': 'Server-side download completed',
    'download.summary.path': 'Saved path:',
    'media.video': 'Video',
    'media.image': 'Image',
    'diagnostics.card.service': 'Service',
    'diagnostics.card.telegram': 'Telegram',
    'diagnostics.card.openclaw': 'OpenClaw',
    'diagnostics.line.download': 'download',
    'diagnostics.line.config': 'config',
    'diagnostics.line.enabled': 'enabled',
    'diagnostics.line.runtime': 'runtime',
    'diagnostics.line.delivery': 'delivery',
    'diagnostics.line.allowlist': 'allowlist',
    'diagnostics.line.server': 'server',
    'diagnostics.line.agent': 'agent',
    'diagnostics.line.script': 'script',
    'diagnostics.value.enabled': 'yes',
    'diagnostics.value.disabled': 'no',
    'diagnostics.value.online': 'online',
    'diagnostics.value.offline': 'offline',
    'diagnostics.value.ok': 'ok',
    'diagnostics.value.missing': 'missing',
    'diagnostics.check.serviceHealth': 'Current page service healthz',
    'diagnostics.check.configuredServiceBase': 'OpenClaw Service Base URL',
    'diagnostics.check.noDetail': 'No detail',
    'diagnostics.check.ok': 'ok',
    'diagnostics.check.fail': 'fail',
    'diagnostics.hints.empty': 'No obvious breakpoints were found. The pipeline currently looks healthy.',
    'note.type.video': 'Video Post',
    'note.type.normal': 'Image Post',
    'note.untitled': 'Untitled Post',
    'note.noDescription': 'This post does not expose a public description.',
    'telegram.tokenHint.saved': 'Saved token: {token}',
    'telegram.tokenHint.none': 'No Telegram token is currently saved.',
    'telegram.status.saving': 'Saving Telegram config...',
    'telegram.status.saved': 'Telegram config saved and hot-reloaded.',
    'telegram.status.saveFailed': 'Failed to save Telegram config',
    'telegram.status.refreshed': 'Runtime status refreshed.',
    'telegram.status.refreshFailed': 'Failed to refresh status',
    'openclaw.status.saving': 'Saving OpenClaw config...',
    'openclaw.status.saved': 'OpenClaw config saved.',
    'openclaw.status.saveFailed': 'Failed to save OpenClaw config',
    'openclaw.status.templateFailed': 'Failed to generate the OpenClaw template',
    'openclaw.status.templateReady': 'MCP server: {serverName} · Recommended agent: {agentId}',
    'openclaw.status.diagnosticsRefreshed': 'Diagnostics refreshed.',
    'openclaw.status.diagnosticsFailed': 'Failed to refresh diagnostics',
    'copy.mcporter': 'Copied the mcporter config.',
    'copy.agentPrompt': 'Copied the agent prompt.',
    'copy.diagnostics': 'Copied the diagnostics JSON.',
  },
};

let currentLang = resolveInitialLanguage();

function resolveInitialLanguage() {
  const saved = window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY);
  if (saved === 'zh' || saved === 'en') {
    return saved;
  }

  return navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function t(key, params = {}) {
  const template = TRANSLATIONS[currentLang]?.[key] || TRANSLATIONS.zh[key] || key;

  return template.replace(/\{(\w+)\}/g, (_, name) => {
    const value = params[name];
    return value === undefined || value === null ? '' : String(value);
  });
}

function applyI18n() {
  document.documentElement.lang = currentLang === 'zh' ? 'zh-CN' : 'en';
  document.title = t('meta.title');

  document.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
  });

  document.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  });

  langButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.lang === currentLang);
  });
}

function rerenderCurrentView() {
  if (latestResults.length) {
    renderResults(latestResults);
  }

  if (latestDiagnostics) {
    renderDiagnosticsCards(latestDiagnostics);
    renderDiagnosticsChecks(latestDiagnostics.checks);
    renderDiagnosticsHints(latestDiagnostics.hints);
  }
}

function setLanguage(lang, { persist = true, reloadRemote = true } = {}) {
  currentLang = lang === 'en' ? 'en' : 'zh';

  if (persist) {
    window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, currentLang);
  }

  applyI18n();
  loadSavedCookie();
  rerenderCurrentView();

  if (reloadRemote) {
    void loadDashboard().catch((error) => {
      setTelegramStatus(error instanceof Error ? error.message : t('error.initConfigFailed'), 'error');
      setOpenClawStatus(error instanceof Error ? error.message : t('error.initConfigFailed'), 'error');
    });
  }
}

function setMessage(element, message, tone = '') {
  element.textContent = message;
  element.classList.remove('error', 'success');
  if (tone) {
    element.classList.add(tone);
  }
}

function switchTab(tabId) {
  tabButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tabId);
  });

  tabPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === `tab-${tabId}`);
  });
}

async function fetchJson(url, options) {
  const requestOptions = options ? { ...options } : {};
  requestOptions.headers = new Headers(requestOptions.headers || {});

  const response = await fetch(url, requestOptions);
  const data = await response.json().catch(() => null);

  if (response.status === 401) {
    throw new Error(t('error.adminTokenRequired'));
  }

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || t('error.requestFailed'));
  }

  return data;
}

function setStatus(message, isError = false) {
  setMessage(statusEl, message, isError ? 'error' : '');
}

function setCookieStatus(message, isError = false) {
  setMessage(cookieStatusEl, message, isError ? 'error' : '');
}

function setTelegramStatus(message, tone = '') {
  setMessage(telegramConfigStatus, message, tone);
}

function setOpenClawStatus(message, tone = '') {
  setMessage(openclawStatus, message, tone);
}

function clearChildren(node) {
  while (node.firstChild) {
    node.removeChild(node.firstChild);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildEntryFileName(note, item, index, options = {}) {
  return inferMediaFileName(item, note, index, {
    batch: Boolean(options.batch),
    totalItems: Number.isFinite(options.totalItems) ? options.totalItems : 1,
    fallbackBaseName: 'rednote-media',
  });
}

function createMediaEntry(note, item, index, options = {}) {
  return {
    note,
    item,
    index,
    fileName: buildEntryFileName(note, item, index, options),
  };
}

function buildProxyUrl(entry, inline) {
  const params = new URLSearchParams({
    url: entry.item.url,
    filename: entry.fileName,
  });

  if (Array.isArray(entry.item.fallbackUrls)) {
    entry.item.fallbackUrls
      .filter(Boolean)
      .forEach((fallbackUrl) => params.append('fallback', fallbackUrl));
  }

  if (inline) {
    params.set('inline', '1');
  }

  return `/api/media?${params.toString()}`;
}

function createMediaActionLink(label, href, options = {}) {
  const {
    primary = false,
    download = false,
    target = '',
    rel = '',
    referrerPolicy = '',
  } = options;

  const link = document.createElement('a');
  link.className = `button media-action-button${primary ? ' button-primary' : ''}`;
  link.href = href;
  link.textContent = label;

  if (download) {
    link.setAttribute('download', '');
  }

  if (target) {
    link.target = target;
  }

  if (rel) {
    link.rel = rel;
  }

  if (referrerPolicy) {
    link.referrerPolicy = referrerPolicy;
  }

  return link;
}

function createMediaActionButton(label, onClick, options = {}) {
  const { primary = false } = options;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `button media-action-button${primary ? ' button-primary' : ''}`;
  button.textContent = label;
  button.addEventListener('click', () => {
    void onClick(button);
  });
  return button;
}

function extractFileNameFromDisposition(headerValue, fallback) {
  if (!headerValue) {
    return fallback;
  }

  const utf8Match = headerValue.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return fallback;
    }
  }

  const quotedMatch = headerValue.match(/filename="([^"]+)"/i);
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const plainMatch = headerValue.match(/filename=([^;]+)/i);
  if (plainMatch?.[1]) {
    return plainMatch[1].trim();
  }

  return fallback;
}

async function readProxyDownloadError(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const payload = await response.json().catch(() => null);
    return payload?.error || t('error.proxyDownloadFailedStatus', { status: response.status });
  }

  const text = await response.text().catch(() => '');
  return text.trim() || t('error.proxyDownloadFailedStatus', { status: response.status });
}

function triggerBlobDownload(blob, fileName) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function downloadProxyMedia(entry, options = {}) {
  const {
    button = null,
    silentSuccess = false,
  } = options;
  const fallbackFileName = entry.fileName;
  const idleLabel = button?.dataset.idleLabel || button?.textContent || t('actions.proxyDownload');

  if (button) {
    button.dataset.idleLabel = idleLabel;
    button.disabled = true;
    button.textContent = t('actions.downloading');
  }

  try {
    const response = await fetch(buildProxyUrl(entry, false));
    if (!response.ok) {
      throw new Error(await readProxyDownloadError(response));
    }

    const fileName = extractFileNameFromDisposition(
      response.headers.get('content-disposition'),
      fallbackFileName,
    );
    const blob = await response.blob();
    triggerBlobDownload(blob, fileName);

    if (!silentSuccess) {
      setStatus(t('status.downloadStarted', { fileName }));
    }

    return fileName;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = idleLabel;
    }
  }
}

function loadSavedCookie() {
  const saved = window.localStorage.getItem(COOKIE_STORAGE_KEY);
  if (!saved) {
    setCookieStatus(t('cookie.status.none'));
    return;
  }

  cookieInput.value = saved;
  setCookieStatus(t('cookie.status.restored'));
}

function saveCookieLocally() {
  const value = cookieInput.value.trim();
  if (!value) {
    window.localStorage.removeItem(COOKIE_STORAGE_KEY);
    setCookieStatus(t('cookie.status.removed'));
    return;
  }

  window.localStorage.setItem(COOKIE_STORAGE_KEY, value);
  setCookieStatus(t('cookie.status.saved'), false);
}

function clearCookieLocally() {
  cookieInput.value = '';
  window.localStorage.removeItem(COOKIE_STORAGE_KEY);
  setCookieStatus(t('cookie.status.cleared'));
}

async function importCookieFile(file) {
  const content = await file.text();
  const parsed = parseCookieText(content);
  cookieInput.value = parsed;
  saveCookieLocally();
  setCookieStatus(t('cookie.status.imported', { fileName: file.name }));
}

function renderWarnings(container, warningItems) {
  if (!warningItems?.length) {
    container.classList.add('hidden');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.innerHTML = warningItems.map((item) => `<p>${item}</p>`).join('');
}

function renderDownloadSummary(download, container) {
  if (!download?.outputDir) {
    container.classList.add('hidden');
    container.classList.remove('success');
    container.innerHTML = '';
    return;
  }

  container.classList.remove('hidden');
  container.classList.add('success');
  container.innerHTML = `
    <p><strong>${escapeHtml(t('download.summary.title'))}</strong></p>
    <p>${escapeHtml(t('download.summary.path'))}<code>${escapeHtml(download.outputDir)}</code></p>
  `;
}

function renderMedia(entries, container) {
  clearChildren(container);

  entries.forEach((entry) => {
    const card = document.createElement('article');
    card.className = 'media-card';
    const { item, index } = entry;

    const topLine = document.createElement('div');
    topLine.className = 'media-topline';
    topLine.innerHTML = `
      <span>${item.type === 'video' ? t('media.video') : t('media.image')} ${index + 1}</span>
      <span>${entry.fileName}</span>
    `;

    const mediaNode = item.type === 'video'
      ? document.createElement('video')
      : document.createElement('img');

    if (item.type === 'video') {
      mediaNode.controls = true;
      mediaNode.preload = 'metadata';
      mediaNode.src = buildProxyUrl(entry, true);
    } else {
      mediaNode.loading = 'lazy';
      mediaNode.alt = entry.fileName;
      mediaNode.src = buildProxyUrl(entry, true);
    }

    const actions = document.createElement('div');
    actions.className = 'media-actions';
    actions.append(
      createMediaActionButton(t('actions.proxyDownload'), async (button) => {
        try {
          await downloadProxyMedia(entry, { button });
        } catch (error) {
          setStatus(error instanceof Error ? error.message : t('error.proxyDownloadFailed'), true);
        }
      }, {
        primary: true,
      }),
      createMediaActionLink(t('actions.openOriginal'), item.url, {
        target: '_blank',
        rel: 'noopener noreferrer',
        referrerPolicy: 'no-referrer',
      })
    );

    card.append(topLine, actions, mediaNode);
    container.appendChild(card);
  });
}

function normalizeResolveResults(data, submittedInput) {
  if (Array.isArray(data.results)) {
    return data.results;
  }

  if (data.note) {
    return [{
      input: submittedInput,
      ok: true,
      note: data.note,
      download: data.download || null,
    }];
  }

  return [];
}

function renderResultErrors(errorResults) {
  if (!errorResults.length) {
    resultErrorsEl.classList.add('hidden');
    resultErrorsEl.innerHTML = '';
    return;
  }

  resultErrorsEl.classList.remove('hidden');
  resultErrorsEl.innerHTML = `
    <p><strong>${escapeHtml(t('results.errors.title'))}</strong></p>
    ${errorResults.map((item) => `<p>${escapeHtml(item.input)}: ${escapeHtml(item.error || t('error.requestFailed'))}</p>`).join('')}
  `;
}

function buildResultSummary(results) {
  const successResults = results.filter((item) => item.ok && item.note);
  const mediaCount = successResults.reduce((sum, item) => sum + (item.note.media?.length || 0), 0);

  if (!successResults.length) {
    return '';
  }

  if (results.length === 1 && successResults.length === 1) {
    return t('results.summary.single', { mediaCount });
  }

  const params = {
    successCount: successResults.length,
    totalCount: results.length,
    mediaCount,
  };

  if (successResults.some((item) => item.download?.outputDir)) {
    return t('results.summary.batchDownload', params);
  }

  return t('results.summary.batch', params);
}

function renderNoteCard(result, batchMode = false) {
  const note = result.note;
  const totalItems = Array.isArray(note.media) ? note.media.length : 0;
  const entries = (note.media || []).map((item, index) => createMediaEntry(note, item, index, {
    batch: batchMode,
    totalItems,
  }));
  const card = document.createElement('article');
  card.className = 'subcard result-note';

  const head = document.createElement('div');
  head.className = 'section-head compact result-note-head';

  const headText = document.createElement('div');
  const meta = document.createElement('p');
  meta.className = 'note-meta';
  meta.textContent = `${note.type === 'video' ? t('note.type.video') : t('note.type.normal')}${note.author?.nickname ? ` · ${note.author.nickname}` : ''}`;

  const title = document.createElement('h3');
  title.textContent = note.title || t('note.untitled');

  headText.append(meta, title);

  const link = createMediaActionLink(t('resolve.openPost'), note.resolvedUrl || '#', {
    target: '_blank',
    rel: 'noopener noreferrer',
  });
  link.classList.remove('button', 'media-action-button');
  link.classList.add('inline-link');

  head.append(headText, link);

  const desc = document.createElement('p');
  desc.className = 'note-desc';
  desc.textContent = note.description || t('note.noDescription');

  const warnings = document.createElement('div');
  warnings.className = 'notice hidden';
  renderWarnings(warnings, note.warnings);

  const downloadSummary = document.createElement('div');
  downloadSummary.className = 'notice hidden';
  renderDownloadSummary(result.download, downloadSummary);

  const mediaGrid = document.createElement('div');
  mediaGrid.className = 'media-grid';
  renderMedia(entries, mediaGrid);

  card.append(head, desc, warnings, downloadSummary, mediaGrid);
  return { card, entries };
}

function renderResults(results) {
  clearChildren(resultListEl);
  latestEntries = [];
  latestResults = results;
  latestNote = null;
  latestDownload = null;

  const successResults = results.filter((item) => item.ok && item.note);
  const errorResults = results.filter((item) => !item.ok);
  const batchMode = successResults.length > 1;

  const summary = buildResultSummary(results);
  if (summary) {
    resultSummaryEl.classList.remove('hidden');
    resultSummaryEl.textContent = summary;
  } else {
    resultSummaryEl.classList.add('hidden');
    resultSummaryEl.textContent = '';
  }

  renderResultErrors(errorResults);

  successResults.forEach((result) => {
    const rendered = renderNoteCard(result, batchMode);
    latestEntries.push(...rendered.entries);
    resultListEl.appendChild(rendered.card);
  });

  if (successResults.length === 1) {
    latestNote = successResults[0].note;
    latestDownload = successResults[0].download || null;
  }

  downloadAllButton.disabled = latestEntries.length === 0;
}

function renderDiagnosticsCards(diagnostics) {
  clearChildren(diagnosticsCardsEl);

  const cards = [
    {
      label: 'service',
      title: t('diagnostics.card.service'),
      lines: [
        diagnostics.service.origin,
        `${t('diagnostics.line.download')}: ${diagnostics.service.downloadDir}`,
        `${t('diagnostics.line.config')}: ${diagnostics.service.configPath}`,
      ],
    },
    {
      label: 'telegram',
      title: t('diagnostics.card.telegram'),
      lines: [
        `${t('diagnostics.line.enabled')}: ${diagnostics.telegram.enabled ? t('diagnostics.value.enabled') : t('diagnostics.value.disabled')}`,
        `${t('diagnostics.line.runtime')}: ${diagnostics.telegram.runtimeEnabled ? t('diagnostics.value.online') : t('diagnostics.value.offline')}`,
        `${t('diagnostics.line.delivery')}: ${diagnostics.telegram.deliveryMode}`,
        `${t('diagnostics.line.allowlist')}: ${diagnostics.telegram.allowedChatIdsCount || 0} chat(s)`,
      ],
    },
    {
      label: 'openclaw',
      title: t('diagnostics.card.openclaw'),
      lines: [
        diagnostics.openclaw.serviceBaseUrl,
        `${t('diagnostics.line.server')}: ${diagnostics.openclaw.serverName}.${diagnostics.openclaw.toolName}`,
        `${t('diagnostics.line.agent')}: ${diagnostics.openclaw.preferredAgentId}`,
        `${t('diagnostics.line.script')}: ${diagnostics.openclaw.mcpScriptExists ? t('diagnostics.value.ok') : t('diagnostics.value.missing')}`,
      ],
    },
  ];

  cards.forEach((cardData) => {
    const card = document.createElement('article');
    card.className = 'diag-card';

    const heading = document.createElement('div');
    heading.className = 'diag-card-head';
    heading.innerHTML = `
      <span class="diag-label">${escapeHtml(cardData.label)}</span>
      <strong>${escapeHtml(cardData.title)}</strong>
    `;

    const list = document.createElement('div');
    list.className = 'diag-lines';
    list.innerHTML = cardData.lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');

    card.append(heading, list);
    diagnosticsCardsEl.appendChild(card);
  });
}

function renderDiagnosticsChecks(checks) {
  clearChildren(diagnosticsChecksEl);

  const entries = [
    { key: 'serviceHealth', label: t('diagnostics.check.serviceHealth') },
    { key: 'configuredServiceBase', label: t('diagnostics.check.configuredServiceBase') },
  ];

  entries.forEach(({ key, label }) => {
    const check = checks[key];
    const row = document.createElement('div');
    row.className = 'check-row';
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(label)}</strong>
        <p>${escapeHtml(check.detail || t('diagnostics.check.noDetail'))}</p>
      </div>
      <span class="check-pill ${check.ok ? 'success' : 'error'}">${check.ok ? t('diagnostics.check.ok') : `${t('diagnostics.check.fail')}${check.status ? ` ${check.status}` : ''}`}</span>
    `;
    diagnosticsChecksEl.appendChild(row);
  });
}

function renderDiagnosticsHints(hints) {
  clearChildren(diagnosticsHintsEl);

  if (!hints?.length) {
    diagnosticsHintsEl.innerHTML = `<p class="hint-empty">${escapeHtml(t('diagnostics.hints.empty'))}</p>`;
    return;
  }

  hints.forEach((hint) => {
    const item = document.createElement('p');
    item.className = 'hint-item';
    item.textContent = hint;
    diagnosticsHintsEl.appendChild(item);
  });
}

async function onSubmit(event) {
  event.preventDefault();

  setStatus(t('status.parsing'));
  submitButton.disabled = true;
  downloadAllButton.disabled = true;

  try {
    const data = await fetchJson('/api/resolve', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: input.value,
        download: serverDownload.checked,
        cookie: cookieInput.value.trim() || undefined,
      }),
    });

    const results = normalizeResolveResults(data, input.value);
    resultEl.classList.remove('hidden');
    renderResults(results);

    const successResults = results.filter((item) => item.ok && item.note);
    const mediaCount = successResults.reduce((sum, item) => sum + (item.note.media?.length || 0), 0);

    if (results.length > 1) {
      const key = successResults.some((item) => item.download?.outputDir)
        ? 'status.resolveBatchDownloadDone'
        : 'status.resolveBatchDone';
      setStatus(t(key, {
        successCount: successResults.length,
        totalCount: results.length,
        mediaCount,
      }), successResults.length === 0);
    } else if (data.download?.outputDir) {
      setStatus(t('status.serverDownloadDone', { path: data.download.outputDir }));
    } else {
      setStatus(t('status.resolveDone', { count: data.note.media?.length || 0 }));
    }
    switchTab('resolve');
  } catch (error) {
    resultEl.classList.add('hidden');
    latestResults = [];
    latestEntries = [];
    latestNote = null;
    latestDownload = null;
    setStatus(error instanceof Error ? error.message : t('error.requestFailed'), true);
  } finally {
    submitButton.disabled = false;
  }
}

async function triggerBrowserDownloads() {
  if (!latestEntries.length) {
    return;
  }

  downloadAllButton.disabled = true;
  const failures = [];
  let successCount = 0;

  for (const [index, entry] of latestEntries.entries()) {
    try {
      await downloadProxyMedia(entry, { silentSuccess: true });
      successCount += 1;
    } catch (error) {
      failures.push(`${index + 1}. ${error instanceof Error ? error.message : t('error.proxyDownloadFailed')}`);
    }
  }

  if (failures.length) {
    setStatus(t('status.downloadAllPartial', {
      successCount,
      failureCount: failures.length,
      firstFailure: failures[0],
    }), true);
  } else {
    setStatus(t('status.downloadAllDone', { successCount }));
  }

  downloadAllButton.disabled = latestEntries.length === 0;
}

function onCookieFileChange(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  importCookieFile(file)
    .catch((error) => {
      setCookieStatus(error instanceof Error ? error.message : t('error.cookieImportFailed'), true);
    })
    .finally(() => {
      cookieFileInput.value = '';
    });
}

function openCookiePicker() {
  cookieFileInput.click();
}

function onDrop(event) {
  event.preventDefault();
  cookieDropzone.classList.remove('dragover');

  const [file] = event.dataTransfer?.files || [];
  if (!file) {
    return;
  }

  importCookieFile(file).catch((error) => {
    setCookieStatus(error instanceof Error ? error.message : t('error.cookieImportFailed'), true);
  });
}

function onDragOver(event) {
  event.preventDefault();
  cookieDropzone.classList.add('dragover');
}

function onDragLeave() {
  cookieDropzone.classList.remove('dragover');
}

function applyConfigToForm(config, telegram) {
  telegramEnabled.checked = config.telegram.enabled;
  telegramAllowedChatIds.value = config.telegram.allowedChatIds || '';
  telegramDeliveryMode.value = telegram.deliveryMode || config.telegram.deliveryMode || 'document';
  telegramTokenHint.textContent = config.telegram.botTokenSet
    ? t('telegram.tokenHint.saved', { token: config.telegram.botTokenMasked })
    : t('telegram.tokenHint.none');
  telegramBotToken.value = '';
  telegramClearToken.checked = false;

  openclawServiceBaseUrl.value = config.openclaw.serviceBaseUrl || '';
  openclawServiceBaseUrl.placeholder = `${window.location.origin} (${t('openclaw.config.serviceBaseAuto')})`;
  openclawServerName.value = config.openclaw.mcpServerName || 'rednote';
  openclawAgentId.value = config.openclaw.preferredAgentId || 'bfxia';
  openclawMcpScriptPath.value = config.openclaw.mcpScriptPath || '';
}

async function loadDiagnostics() {
  const data = await fetchJson(`/api/diagnostics?lang=${currentLang}`);
  latestDiagnostics = data.diagnostics;
  renderDiagnosticsCards(data.diagnostics);
  renderDiagnosticsChecks(data.diagnostics.checks);
  renderDiagnosticsHints(data.diagnostics.hints);
  diagnosticsJsonEl.value = JSON.stringify(data.diagnostics, null, 2);
}

async function loadDashboard() {
  const [configData, telegramData] = await Promise.all([
    fetchJson('/api/config'),
    fetchJson('/api/telegram/status'),
  ]);

  configPathEl.textContent = configData.configPath;
  applyConfigToForm(configData.config, telegramData.telegram);
  await Promise.all([
    refreshOpenClawTemplate(),
    loadDiagnostics(),
  ]);
}

async function loadFooterMeta() {
  if (!footerVersionEl) {
    return;
  }

  try {
    const data = await fetchJson('/healthz');
    if (data.version) {
      footerVersionEl.textContent = `v${data.version}`;
    }
  } catch {
    footerVersionEl.textContent = footerVersionEl.textContent || 'v0.2.17';
  }
}

async function saveTelegramConfig() {
  setTelegramStatus(t('telegram.status.saving'));
  saveTelegramConfigButton.disabled = true;

  try {
    const patch = {
      telegram: {
        enabled: telegramEnabled.checked,
        allowedChatIds: telegramAllowedChatIds.value.trim(),
        deliveryMode: telegramDeliveryMode.value,
      },
    };

    if (telegramClearToken.checked) {
      patch.telegram.botToken = '';
    } else if (telegramBotToken.value.trim()) {
      patch.telegram.botToken = telegramBotToken.value.trim();
    }

    await fetchJson('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    });

    await loadDashboard();
    setTelegramStatus(t('telegram.status.saved'), 'success');
  } catch (error) {
    setTelegramStatus(error instanceof Error ? error.message : t('telegram.status.saveFailed'), 'error');
  } finally {
    saveTelegramConfigButton.disabled = false;
  }
}

async function saveOpenClawConfig() {
  setOpenClawStatus(t('openclaw.status.saving'));
  saveOpenClawConfigButton.disabled = true;

  try {
    await fetchJson('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        openclaw: {
          serviceBaseUrl: openclawServiceBaseUrl.value.trim(),
          mcpServerName: openclawServerName.value.trim() || 'rednote',
          preferredAgentId: openclawAgentId.value.trim() || 'bfxia',
          mcpScriptPath: openclawMcpScriptPath.value.trim(),
        },
      }),
    });

    await loadDashboard();
    setOpenClawStatus(t('openclaw.status.saved'), 'success');
  } catch (error) {
    setOpenClawStatus(error instanceof Error ? error.message : t('openclaw.status.saveFailed'), 'error');
  } finally {
    saveOpenClawConfigButton.disabled = false;
  }
}

async function refreshOpenClawTemplate() {
  try {
    const data = await fetchJson('/api/openclaw/template');
    mcporterSnippet.value = data.openclaw.mcporterSnippet;
    agentPrompt.value = data.openclaw.agentPrompt;
    setOpenClawStatus(t('openclaw.status.templateReady', {
      serverName: data.openclaw.serverName,
      agentId: data.openclaw.preferredAgentId,
    }));
  } catch (error) {
    setOpenClawStatus(error instanceof Error ? error.message : t('openclaw.status.templateFailed'), 'error');
  }
}

async function refreshRuntime() {
  try {
    await loadDashboard();
    setTelegramStatus(t('telegram.status.refreshed'), 'success');
  } catch (error) {
    setTelegramStatus(error instanceof Error ? error.message : t('telegram.status.refreshFailed'), 'error');
  }
}

async function refreshDiagnostics() {
  refreshDiagnosticsButton.disabled = true;

  try {
    await loadDiagnostics();
    setOpenClawStatus(t('openclaw.status.diagnosticsRefreshed'), 'success');
  } catch (error) {
    setOpenClawStatus(error instanceof Error ? error.message : t('openclaw.status.diagnosticsFailed'), 'error');
  } finally {
    refreshDiagnosticsButton.disabled = false;
  }
}

async function copyTextFromTarget(event) {
  const targetId = event.currentTarget.dataset.copyTarget;
  const target = document.querySelector(`#${targetId}`);
  if (!target) {
    return;
  }

  try {
    await navigator.clipboard.writeText(target.value || target.textContent || '');
    const key = targetId === 'mcporter-snippet'
      ? 'copy.mcporter'
      : targetId === 'diagnostics-json'
        ? 'copy.diagnostics'
        : 'copy.agentPrompt';
    setOpenClawStatus(t(key), 'success');
  } catch (error) {
    setOpenClawStatus(error instanceof Error ? error.message : t('error.copyFailed'), 'error');
  }
}

form.addEventListener('submit', onSubmit);
downloadAllButton.addEventListener('click', triggerBrowserDownloads);
saveCookieButton.addEventListener('click', saveCookieLocally);
clearCookieButton.addEventListener('click', clearCookieLocally);
cookieFileInput.addEventListener('change', onCookieFileChange);
cookieDropzone.addEventListener('click', openCookiePicker);
cookieDropzone.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    openCookiePicker();
  }
});
cookieDropzone.addEventListener('dragover', onDragOver);
cookieDropzone.addEventListener('dragleave', onDragLeave);
cookieDropzone.addEventListener('drop', onDrop);
saveTelegramConfigButton.addEventListener('click', saveTelegramConfig);
refreshRuntimeButton.addEventListener('click', refreshRuntime);
refreshDiagnosticsButton.addEventListener('click', refreshDiagnostics);
saveOpenClawConfigButton.addEventListener('click', saveOpenClawConfig);
refreshOpenClawTemplateButton.addEventListener('click', refreshOpenClawTemplate);
tabButtons.forEach((button) => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
});
copyButtons.forEach((button) => {
  button.addEventListener('click', copyTextFromTarget);
});
langButtons.forEach((button) => {
  button.addEventListener('click', () => setLanguage(button.dataset.lang));
});

applyI18n();
loadSavedCookie();
void loadFooterMeta();
loadDashboard().catch((error) => {
  setTelegramStatus(error instanceof Error ? error.message : t('error.initConfigFailed'), 'error');
  setOpenClawStatus(error instanceof Error ? error.message : t('error.initConfigFailed'), 'error');
});
