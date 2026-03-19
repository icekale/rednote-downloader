import { COOKIE_STORAGE_KEY, parseCookieText } from './cookie-utils.js';

const ADMIN_TOKEN_STORAGE_KEY = 'rednote-downloader.adminToken';

const adminTokenInput = document.querySelector('#admin-token');
const adminTokenStatus = document.querySelector('#admin-token-status');
const saveAdminTokenButton = document.querySelector('#save-admin-token-button');
const clearAdminTokenButton = document.querySelector('#clear-admin-token-button');

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
const noteMetaEl = document.querySelector('#note-meta');
const noteTitleEl = document.querySelector('#note-title');
const noteDescEl = document.querySelector('#note-desc');
const openNoteLinkEl = document.querySelector('#open-note-link');
const warningsEl = document.querySelector('#warnings');
const downloadSummaryEl = document.querySelector('#download-summary');
const mediaGridEl = document.querySelector('#media-grid');
const downloadAllButton = document.querySelector('#download-all-button');
const submitButton = document.querySelector('#submit-button');

const telegramRuntimePill = document.querySelector('#telegram-runtime-pill');
const headerTelegramMode = document.querySelector('#header-telegram-mode');
const headerTelegramAllowlist = document.querySelector('#header-telegram-allowlist');
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

const tabButtons = Array.from(document.querySelectorAll('.tab-button'));
const tabPanels = Array.from(document.querySelectorAll('.tab-panel'));
const copyButtons = Array.from(document.querySelectorAll('[data-copy-target]'));

let latestMedia = [];
let latestTitle = 'rednote-media';
let adminToken = '';

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
  const headers = new Headers(requestOptions.headers || {});

  if (adminToken && !headers.has('X-Admin-Token')) {
    headers.set('X-Admin-Token', adminToken);
  }

  requestOptions.headers = headers;

  const response = await fetch(url, requestOptions);
  const data = await response.json().catch(() => null);

  if (response.status === 401) {
    throw new Error('缺少或错误的 Admin Token，请先在页面顶部填写。');
  }

  if (!response.ok || !data?.ok) {
    throw new Error(data?.error || '请求失败');
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

function setAdminTokenStatus(message, tone = '') {
  setMessage(adminTokenStatus, message, tone);
}

function countConfiguredChatIds(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .length;
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

function guessExtension(item) {
  try {
    const pathname = new URL(item.url).pathname;
    const match = pathname.match(/\.([a-z0-9]{2,5})$/i);
    if (match?.[1]) {
      return match[1];
    }
  } catch {
    return item.type === 'video' ? 'mp4' : 'jpg';
  }

  return item.type === 'video' ? 'mp4' : 'jpg';
}

function fileNameForItem(item, index) {
  const extension = guessExtension(item);
  if (item.fileName) {
    return item.fileName;
  }

  if (item.type === 'video') {
    return `${latestTitle}.${extension}`;
  }

  return `${latestTitle}_${String(index + 1).padStart(2, '0')}.${extension}`;
}

function buildProxyUrl(item, index, inline) {
  const params = new URLSearchParams({
    url: item.url,
    filename: fileNameForItem(item, index),
  });

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

function loadSavedCookie() {
  const saved = window.localStorage.getItem(COOKIE_STORAGE_KEY);
  if (!saved) {
    setCookieStatus('当前没有保存 Cookie。');
    return;
  }

  cookieInput.value = saved;
  setCookieStatus('已从本地浏览器恢复保存的 Cookie。');
}

function loadSavedAdminToken() {
  adminToken = window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || '';
  adminTokenInput.value = adminToken;
  setAdminTokenStatus(adminToken ? '已从本地浏览器恢复 Admin Token。' : '当前没有保存 Admin Token。');
}

function saveCookieLocally() {
  const value = cookieInput.value.trim();
  if (!value) {
    window.localStorage.removeItem(COOKIE_STORAGE_KEY);
    setCookieStatus('输入为空，已移除本地保存的 Cookie。');
    return;
  }

  window.localStorage.setItem(COOKIE_STORAGE_KEY, value);
  setCookieStatus('Cookie 已保存到当前浏览器。', false);
}

function clearCookieLocally() {
  cookieInput.value = '';
  window.localStorage.removeItem(COOKIE_STORAGE_KEY);
  setCookieStatus('Cookie 已清空。');
}

async function saveAdminTokenLocally() {
  adminToken = adminTokenInput.value.trim();
  if (!adminToken) {
    window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    setAdminTokenStatus('输入为空，已移除本地保存的 Admin Token。');
    return;
  }

  window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, adminToken);
  setAdminTokenStatus('Admin Token 已保存，正在验证...', '');

  try {
    await loadDashboard();
    setAdminTokenStatus('Admin Token 已保存并验证通过。', 'success');
  } catch (error) {
    setAdminTokenStatus(error instanceof Error ? error.message : 'Admin Token 验证失败', 'error');
  }
}

async function clearAdminTokenLocally() {
  adminToken = '';
  adminTokenInput.value = '';
  window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  setAdminTokenStatus('Admin Token 已清空。');

  try {
    await loadDashboard();
  } catch {
    // Clearing the token may intentionally remove access to admin-only endpoints.
  }
}

async function importCookieFile(file) {
  const content = await file.text();
  const parsed = parseCookieText(content);
  cookieInput.value = parsed;
  saveCookieLocally();
  setCookieStatus(`已导入 ${file.name}。`);
}

function renderWarnings(warnings) {
  if (!warnings?.length) {
    warningsEl.classList.add('hidden');
    warningsEl.innerHTML = '';
    return;
  }

  warningsEl.classList.remove('hidden');
  warningsEl.innerHTML = warnings.map((item) => `<p>${item}</p>`).join('');
}

function renderDownloadSummary(download) {
  if (!download?.outputDir) {
    downloadSummaryEl.classList.add('hidden');
    downloadSummaryEl.innerHTML = '';
    return;
  }

  downloadSummaryEl.classList.remove('hidden');
  downloadSummaryEl.innerHTML = `<p>文件已经下载到服务端目录：<strong>${download.outputDir}</strong></p>`;
}

function renderMedia(items) {
  clearChildren(mediaGridEl);
  latestMedia = items;
  downloadAllButton.disabled = items.length === 0;

  items.forEach((item, index) => {
    const card = document.createElement('article');
    card.className = 'media-card';

    const topLine = document.createElement('div');
    topLine.className = 'media-topline';
    topLine.innerHTML = `
      <span>${item.type === 'video' ? '视频' : '图片'} ${index + 1}</span>
      <span>${item.fileName || fileNameForItem(item, index)}</span>
    `;

    const mediaNode = item.type === 'video'
      ? document.createElement('video')
      : document.createElement('img');

    if (item.type === 'video') {
      mediaNode.controls = true;
      mediaNode.preload = 'metadata';
      mediaNode.src = buildProxyUrl(item, index, true);
    } else {
      mediaNode.loading = 'lazy';
      mediaNode.alt = item.fileName || fileNameForItem(item, index);
      mediaNode.src = buildProxyUrl(item, index, true);
    }

    const actions = document.createElement('div');
    actions.className = 'media-actions';
    actions.append(
      createMediaActionLink('代理下载', buildProxyUrl(item, index, false), {
        primary: true,
        download: true,
      }),
      createMediaActionLink('打开原始地址', item.url, {
        target: '_blank',
        rel: 'noopener noreferrer',
        referrerPolicy: 'no-referrer',
      })
    );

    card.append(topLine, actions, mediaNode);
    mediaGridEl.appendChild(card);
  });
}

function renderDiagnosticsCards(diagnostics) {
  clearChildren(diagnosticsCardsEl);

  const cards = [
    {
      label: 'service',
      title: '服务',
      lines: [
        diagnostics.service.origin,
        `download: ${diagnostics.service.downloadDir}`,
        `config: ${diagnostics.service.configPath}`,
      ],
    },
    {
      label: 'telegram',
      title: 'Telegram',
      lines: [
        `enabled: ${diagnostics.telegram.enabled ? 'yes' : 'no'}`,
        `runtime: ${diagnostics.telegram.runtimeEnabled ? 'online' : 'offline'}`,
        `delivery: ${diagnostics.telegram.deliveryMode}`,
        `allowlist: ${diagnostics.telegram.allowedChatIdsCount || 0} chat(s)`,
      ],
    },
    {
      label: 'openclaw',
      title: 'OpenClaw',
      lines: [
        diagnostics.openclaw.serviceBaseUrl,
        `server: ${diagnostics.openclaw.serverName}.${diagnostics.openclaw.toolName}`,
        `agent: ${diagnostics.openclaw.preferredAgentId}`,
        `script: ${diagnostics.openclaw.mcpScriptExists ? 'ok' : 'missing'}`,
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
    { key: 'serviceHealth', label: '当前页面服务 healthz' },
    { key: 'configuredServiceBase', label: 'OpenClaw Service Base URL' },
  ];

  entries.forEach(({ key, label }) => {
    const check = checks[key];
    const row = document.createElement('div');
    row.className = 'check-row';
    row.innerHTML = `
      <div>
        <strong>${escapeHtml(label)}</strong>
        <p>${escapeHtml(check.detail || 'No detail')}</p>
      </div>
      <span class="check-pill ${check.ok ? 'success' : 'error'}">${check.ok ? 'ok' : `fail${check.status ? ` ${check.status}` : ''}`}</span>
    `;
    diagnosticsChecksEl.appendChild(row);
  });
}

function renderDiagnosticsHints(hints) {
  clearChildren(diagnosticsHintsEl);

  if (!hints?.length) {
    diagnosticsHintsEl.innerHTML = '<p class="hint-empty">当前没发现明显断点，链路看起来是通的。</p>';
    return;
  }

  hints.forEach((hint) => {
    const item = document.createElement('p');
    item.className = 'hint-item';
    item.textContent = hint;
    diagnosticsHintsEl.appendChild(item);
  });
}

function updateHeader(note) {
  latestTitle = (note.title || 'rednote-media')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'rednote-media';

  noteMetaEl.textContent = `${note.type === 'video' ? '视频帖' : '图文帖'}${note.author?.nickname ? ` · ${note.author.nickname}` : ''}`;
  noteTitleEl.textContent = note.title || '未命名帖子';
  noteDescEl.textContent = note.description || '这条帖子没有公开描述文本。';
  openNoteLinkEl.href = note.resolvedUrl || '#';
}

async function onSubmit(event) {
  event.preventDefault();

  setStatus('正在解析帖子页面...');
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

    resultEl.classList.remove('hidden');
    updateHeader(data.note);
    renderWarnings(data.note.warnings);
    renderDownloadSummary(data.download);
    renderMedia(data.note.media || []);
    setStatus(`解析完成，共找到 ${data.note.media?.length || 0} 个媒体文件。`);
    switchTab('resolve');
  } catch (error) {
    resultEl.classList.add('hidden');
    setStatus(error instanceof Error ? error.message : '请求失败', true);
  } finally {
    submitButton.disabled = false;
  }
}

function triggerBrowserDownloads() {
  latestMedia.forEach((item, index) => {
    const link = document.createElement('a');
    link.href = buildProxyUrl(item, index, false);
    link.click();
  });
}

function onCookieFileChange(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  importCookieFile(file)
    .catch((error) => {
      setCookieStatus(error instanceof Error ? error.message : '导入 Cookie 失败', true);
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
    setCookieStatus(error instanceof Error ? error.message : '导入 Cookie 失败', true);
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
    ? `已保存 Token：${config.telegram.botTokenMasked}`
    : '当前没有保存 Telegram Token。';
  telegramBotToken.value = '';
  telegramClearToken.checked = false;

  openclawServiceBaseUrl.value = config.openclaw.serviceBaseUrl || window.location.origin;
  openclawServerName.value = config.openclaw.mcpServerName || 'rednote';
  openclawAgentId.value = config.openclaw.preferredAgentId || 'bfxia';
  openclawMcpScriptPath.value = config.openclaw.mcpScriptPath || '';

  telegramRuntimePill.textContent = telegram.runtimeEnabled ? 'enabled' : 'disabled';
  headerTelegramMode.textContent = telegram.deliveryMode || config.telegram.deliveryMode || 'document';
  headerTelegramAllowlist.textContent = String(countConfiguredChatIds(config.telegram.allowedChatIds));
}

async function loadDiagnostics() {
  const data = await fetchJson('/api/diagnostics');
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

async function saveTelegramConfig() {
  setTelegramStatus('正在保存 Telegram 配置...');
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
    setTelegramStatus('Telegram 配置已保存并热更新。', 'success');
  } catch (error) {
    setTelegramStatus(error instanceof Error ? error.message : '保存 Telegram 配置失败', 'error');
  } finally {
    saveTelegramConfigButton.disabled = false;
  }
}

async function saveOpenClawConfig() {
  setOpenClawStatus('正在保存 OpenClaw 配置...');
  saveOpenClawConfigButton.disabled = true;

  try {
    await fetchJson('/api/config', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        openclaw: {
          serviceBaseUrl: openclawServiceBaseUrl.value.trim() || window.location.origin,
          mcpServerName: openclawServerName.value.trim() || 'rednote',
          preferredAgentId: openclawAgentId.value.trim() || 'bfxia',
          mcpScriptPath: openclawMcpScriptPath.value.trim(),
        },
      }),
    });

    await loadDashboard();
    setOpenClawStatus('OpenClaw 配置已保存。', 'success');
  } catch (error) {
    setOpenClawStatus(error instanceof Error ? error.message : '保存 OpenClaw 配置失败', 'error');
  } finally {
    saveOpenClawConfigButton.disabled = false;
  }
}

async function refreshOpenClawTemplate() {
  try {
    const data = await fetchJson('/api/openclaw/template');
    mcporterSnippet.value = data.openclaw.mcporterSnippet;
    agentPrompt.value = data.openclaw.agentPrompt;
    setOpenClawStatus(`MCP server：${data.openclaw.serverName} · 推荐 agent：${data.openclaw.preferredAgentId}`);
  } catch (error) {
    setOpenClawStatus(error instanceof Error ? error.message : '生成 OpenClaw 模板失败', 'error');
  }
}

async function refreshRuntime() {
  try {
    await loadDashboard();
    setTelegramStatus('运行状态已刷新。', 'success');
  } catch (error) {
    setTelegramStatus(error instanceof Error ? error.message : '刷新失败', 'error');
  }
}

async function refreshDiagnostics() {
  refreshDiagnosticsButton.disabled = true;

  try {
    await loadDiagnostics();
    setOpenClawStatus('诊断信息已刷新。', 'success');
  } catch (error) {
    setOpenClawStatus(error instanceof Error ? error.message : '诊断刷新失败', 'error');
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
    setOpenClawStatus(`已复制${targetId === 'mcporter-snippet' ? ' mcporter 配置' : ' Agent 提示词'}。`, 'success');
  } catch (error) {
    setOpenClawStatus(error instanceof Error ? error.message : '复制失败', 'error');
  }
}

form.addEventListener('submit', onSubmit);
downloadAllButton.addEventListener('click', triggerBrowserDownloads);
saveCookieButton.addEventListener('click', saveCookieLocally);
clearCookieButton.addEventListener('click', clearCookieLocally);
saveAdminTokenButton.addEventListener('click', saveAdminTokenLocally);
clearAdminTokenButton.addEventListener('click', clearAdminTokenLocally);
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

loadSavedAdminToken();
loadSavedCookie();
loadDashboard().catch((error) => {
  setAdminTokenStatus(error instanceof Error ? error.message : '初始化配置失败', 'error');
  setTelegramStatus(error instanceof Error ? error.message : '初始化配置失败', 'error');
  setOpenClawStatus(error instanceof Error ? error.message : '初始化配置失败', 'error');
});
