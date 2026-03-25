import { createWriteStream, openAsBlob } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { normalizeEnvBoolean } from './config.js';
import { inferMediaFileName } from './shared/media-filenames.js';
import { extractFirstUrl, fetchMediaResponse, resolveNote } from './xhs.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const POLL_TIMEOUT_SECONDS = 30;
const MAX_CAPTION_LENGTH = 900;
const TELEGRAM_MEDIA_GROUP_LIMIT = 10;

export function parseAllowedChatIds(input) {
  return new Set(
    String(input || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function toTelegramApiUrl(token, method) {
  return `${TELEGRAM_API_BASE}/bot${token}/${method}`;
}

function trimCaption(text) {
  const source = String(text || '').trim();
  if (source.length <= MAX_CAPTION_LENGTH) {
    return source;
  }

  return `${source.slice(0, MAX_CAPTION_LENGTH - 1)}…`;
}

function isAbortError(error) {
  return error instanceof Error && error.name === 'AbortError';
}

function isTelegramEntityTooLargeError(error) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /request entity too large|entity too large|file is too big|payload too large|413/i.test(error.message);
}

export function buildTelegramCaption(note) {
  const lines = [
    note?.title || 'Untitled RedNote Note',
    note?.author?.nickname ? `作者: ${note.author.nickname}` : '',
    note?.description || '',
    note?.resolvedUrl || '',
  ].filter(Boolean);

  return trimCaption(lines.join('\n\n'));
}

export function inferTelegramFileName(item, note, index) {
  return inferMediaFileName(item, note, index, {
    totalItems: Array.isArray(note?.media) ? note.media.length : 1,
    fallbackBaseName: 'rednote',
  });
}

export function isTelegramChatAllowed(chatId, allowedChatIds) {
  if (!allowedChatIds?.size) {
    return true;
  }

  return allowedChatIds.has(String(chatId));
}

export function chunkTelegramMedia(items, chunkSize = TELEGRAM_MEDIA_GROUP_LIMIT) {
  const chunks = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}

export function getTelegramMediaGroupType(item, deliveryMode = 'document') {
  if (deliveryMode === 'preview') {
    return item?.type === 'video' ? 'video' : 'photo';
  }

  return 'document';
}

async function cleanupTempDirs(tempDirs) {
  await Promise.allSettled(
    tempDirs
      .filter(Boolean)
      .map((tempDir) => rm(tempDir, { recursive: true, force: true })),
  );
}

function collectTelegramMediaCandidates(item) {
  return [...new Set([
    item?.url,
    ...(Array.isArray(item?.fallbackUrls) ? item.fallbackUrls : []),
  ].filter(Boolean))];
}

function buildTelegramOversizeFallbackText(item, note, index, caption) {
  const links = collectTelegramMediaCandidates(item);
  const fileName = inferTelegramFileName(item, note, index);
  const lines = [];

  if (caption) {
    lines.push(caption, '');
  }

  lines.push('这个文件太大，Telegram 不能直接回传。请直接下载：');
  lines.push(fileName);
  lines.push(...links);

  return lines.join('\n');
}

async function fetchTelegramUploadMedia(item) {
  const errors = [];

  for (const candidate of collectTelegramMediaCandidates(item)) {
    try {
      return await fetchMediaResponse(candidate);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  throw new Error(errors[0] || 'Failed to download media for Telegram upload');
}

async function materializeTelegramUpload(item, note, index) {
  const { response } = await fetchTelegramUploadMedia(item);
  const contentType = response.headers.get('content-type') || (item.type === 'video' ? 'video/mp4' : 'image/jpeg');
  const fileName = inferTelegramFileName(item, note, index);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'rednote-telegram-'));
  const tempPath = path.join(tempDir, fileName);

  await pipeline(Readable.fromWeb(response.body), createWriteStream(tempPath));

  return {
    tempDir,
    fileBlob: await openAsBlob(tempPath, { type: contentType }),
    fileName,
  };
}

async function telegramRequest(token, method, payload, isMultipart = false) {
  const response = await fetch(toTelegramApiUrl(token, method), {
    method: 'POST',
    body: isMultipart ? payload : JSON.stringify(payload),
    headers: isMultipart ? undefined : { 'Content-Type': 'application/json' },
  });

  const data = await response.json();
  if (!response.ok || !data.ok) {
    throw new Error(data?.description || `Telegram API error (${response.status})`);
  }

  return data.result;
}

async function sendText(token, chatId, text, replyToMessageId) {
  return telegramRequest(token, 'sendMessage', {
    chat_id: chatId,
    text,
    reply_to_message_id: replyToMessageId,
    disable_web_page_preview: true,
  });
}

async function sendChatAction(token, chatId, action) {
  return telegramRequest(token, 'sendChatAction', {
    chat_id: chatId,
    action,
  });
}

async function uploadMediaAsTelegramFile(token, method, fieldName, chatId, item, note, index, options = {}) {
  const upload = await materializeTelegramUpload(item, note, index);
  const body = new FormData();

  try {
    body.append('chat_id', String(chatId));
    if (options.replyToMessageId) {
      body.append('reply_to_message_id', String(options.replyToMessageId));
    }
    if (options.caption) {
      body.append('caption', options.caption);
    }

    body.append(fieldName, upload.fileBlob, upload.fileName);

    return await telegramRequest(token, method, body, true);
  } finally {
    await cleanupTempDirs([upload.tempDir]);
  }
}

async function uploadMediaGroup(token, chatId, note, items, startIndex, options = {}) {
  const deliveryMode = options.deliveryMode || 'document';
  const body = new FormData();
  const mediaEntries = [];
  const tempDirs = [];

  try {
    body.append('chat_id', String(chatId));
    if (options.replyToMessageId) {
      body.append('reply_to_message_id', String(options.replyToMessageId));
    }

    for (const [offset, item] of items.entries()) {
      const itemIndex = startIndex + offset;
      const fieldName = `media_${itemIndex}`;
      const upload = await materializeTelegramUpload(item, note, itemIndex);

      tempDirs.push(upload.tempDir);
      body.append(fieldName, upload.fileBlob, upload.fileName);

      const mediaEntry = {
        type: getTelegramMediaGroupType(item, deliveryMode),
        media: `attach://${fieldName}`,
      };

      if (offset === 0 && options.caption) {
        mediaEntry.caption = options.caption;
      }

      mediaEntries.push(mediaEntry);
    }

    body.append('media', JSON.stringify(mediaEntries));
    return await telegramRequest(token, 'sendMediaGroup', body, true);
  } finally {
    await cleanupTempDirs(tempDirs);
  }
}

async function sendTelegramOversizeFallback(token, chatId, item, note, index, options = {}) {
  const text = buildTelegramOversizeFallbackText(item, note, index, options.caption);
  await sendText(token, chatId, text, options.replyToMessageId);
}

async function sendResolvedMediaItem(token, chatId, item, note, index, options = {}) {
  const deliveryMode = options.deliveryMode || 'document';

  try {
    if (deliveryMode === 'preview') {
      const method = item.type === 'video' ? 'sendVideo' : 'sendPhoto';
      const fieldName = item.type === 'video' ? 'video' : 'photo';
      await uploadMediaAsTelegramFile(token, method, fieldName, chatId, item, note, index, {
        replyToMessageId: options.replyToMessageId,
        caption: options.caption,
      });
      return;
    }

    await uploadMediaAsTelegramFile(token, 'sendDocument', 'document', chatId, item, note, index, {
      replyToMessageId: options.replyToMessageId,
      caption: options.caption,
    });
  } catch (error) {
    if (!isTelegramEntityTooLargeError(error)) {
      throw error;
    }

    console.warn('[telegram] media upload exceeded Telegram size limit, sending fallback links:', error.message);
    await sendTelegramOversizeFallback(token, chatId, item, note, index, options);
  }
}

async function sendResolvedMediaSequential(token, chatId, note, options = {}) {
  const deliveryMode = options.deliveryMode || 'document';
  const caption = buildTelegramCaption(note);

  for (const [index, item] of note.media.entries()) {
    await sendResolvedMediaItem(token, chatId, item, note, index, {
      deliveryMode,
      replyToMessageId: index === 0 ? options.replyToMessageId : undefined,
      caption: index === 0 ? caption : undefined,
    });
  }
}

async function sendResolvedMedia(token, chatId, note, options = {}) {
  const media = Array.isArray(note?.media) ? note.media : [];
  const caption = buildTelegramCaption(note);

  if (!media.length) {
    await sendText(token, chatId, caption, options.replyToMessageId);
    return;
  }

  if (media.length === 1) {
    const [item] = media;
    await sendResolvedMediaItem(token, chatId, item, note, 0, {
      deliveryMode: options.deliveryMode,
      replyToMessageId: options.replyToMessageId,
      caption,
    });
    return;
  }

  try {
    const chunks = chunkTelegramMedia(media);

    for (const [chunkIndex, chunk] of chunks.entries()) {
      await uploadMediaGroup(token, chatId, note, chunk, chunkIndex * TELEGRAM_MEDIA_GROUP_LIMIT, {
        deliveryMode: options.deliveryMode,
        replyToMessageId: chunkIndex === 0 ? options.replyToMessageId : undefined,
        caption: chunkIndex === 0 ? caption : undefined,
      });
    }
  } catch (error) {
    console.warn('[telegram] media group send failed, falling back to sequential uploads:', error instanceof Error ? error.message : error);
    await sendResolvedMediaSequential(token, chatId, note, options);
  }
}

function buildHelpText() {
  return [
    '把小红书链接、x.com/twitter.com 链接，或整段分享文案直接发给我。',
    '我会解析帖子并把图片/视频直接回到 Telegram。',
    '如果你想保留原始文件质量，保持默认 document 模式就可以。',
  ].join('\n');
}

export class TelegramBotRunner {
  constructor(options) {
    this.token = options.token;
    this.allowedChatIds = options.allowedChatIds;
    this.deliveryMode = options.deliveryMode || 'document';
    this.offset = Number.isInteger(options.initialOffset) && options.initialOffset >= 0
      ? options.initialOffset
      : 0;
    this.onOffsetChange = typeof options.onOffsetChange === 'function'
      ? options.onOffsetChange
      : null;
    this.running = false;
    this.loopPromise = null;
    this.pollController = null;
  }

  async fetchUpdates() {
    const url = new URL(toTelegramApiUrl(this.token, 'getUpdates'));
    url.searchParams.set('timeout', String(POLL_TIMEOUT_SECONDS));
    url.searchParams.set('offset', String(this.offset));

    const controller = new AbortController();
    this.pollController = controller;

    try {
      const response = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data?.description || `Telegram polling failed (${response.status})`);
      }

      return data.result || [];
    } finally {
      if (this.pollController === controller) {
        this.pollController = null;
      }
    }
  }

  async handleMessage(message) {
    const chatId = message?.chat?.id;
    if (!chatId) {
      return;
    }

    if (!isTelegramChatAllowed(chatId, this.allowedChatIds)) {
      await sendText(this.token, chatId, 'This bot is not enabled for this Telegram chat.', message.message_id);
      return;
    }

    const text = message?.text || message?.caption || '';
    if (!text) {
      return;
    }

    if (text === '/start' || text === '/help') {
      await sendText(this.token, chatId, buildHelpText(), message.message_id);
      return;
    }

    let input;
    try {
      input = extractFirstUrl(text);
    } catch {
      await sendText(this.token, chatId, '请直接发送小红书链接、x.com/twitter.com 链接，或者包含这些链接的整段分享文案。', message.message_id);
      return;
    }

    try {
      await sendChatAction(this.token, chatId, 'upload_document');
      const note = await resolveNote(input);
      await sendResolvedMedia(this.token, chatId, note, {
        deliveryMode: this.deliveryMode,
        replyToMessageId: message.message_id,
      });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Unknown error';
      await sendText(this.token, chatId, `解析失败：${messageText}`, message.message_id);
    }
  }

  async pollOnce() {
    const updates = await this.fetchUpdates();

    for (const update of updates) {
      if (!this.running) {
        return;
      }

      if (update.message) {
        await this.handleMessage(update.message);
      }

      const nextOffset = Math.max(this.offset, (update.update_id || 0) + 1);
      if (nextOffset !== this.offset) {
        this.offset = nextOffset;
        if (this.onOffsetChange) {
          await this.onOffsetChange(this.offset);
        }
      }
    }
  }

  start() {
    if (this.loopPromise) {
      return this.loopPromise;
    }

    this.running = true;
    this.loopPromise = (async () => {
      while (this.running) {
        try {
          await this.pollOnce();
        } catch (error) {
          if (!this.running && isAbortError(error)) {
            break;
          }

          console.error('[telegram] polling error:', error instanceof Error ? error.message : error);
          if (!this.running) {
            break;
          }
          await delay(3000);
        }
      }
    })().finally(() => {
      this.running = false;
      this.loopPromise = null;
    });

    return this.loopPromise;
  }

  async stop() {
    this.running = false;
    if (this.pollController) {
      this.pollController.abort();
    }

    if (this.loopPromise) {
      await this.loopPromise.catch(() => {});
    }
  }
}

export function getTelegramConfigFromEnv() {
  const token = process.env.TELEGRAM_BOT_TOKEN || '';
  if (!token || !normalizeEnvBoolean(process.env.TELEGRAM_ENABLED, true)) {
    return null;
  }

  return {
    token,
    allowedChatIds: parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS),
    deliveryMode: process.env.TELEGRAM_DELIVERY_MODE === 'preview' ? 'preview' : 'document',
  };
}
