import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TelegramBotRunner,
  buildTelegramCaption,
  chunkTelegramMedia,
  getTelegramMediaGroupType,
  inferTelegramFileName,
  isTelegramChatAllowed,
} from '../src/telegram.js';

test('buildTelegramCaption includes title, author, description and URL', () => {
  const caption = buildTelegramCaption({
    title: '标题A',
    author: { nickname: '作者A' },
    description: '正文A',
    resolvedUrl: 'https://www.xiaohongshu.com/explore/demo',
  });

  assert.match(caption, /标题A/);
  assert.match(caption, /作者: 作者A/);
  assert.match(caption, /正文A/);
  assert.match(caption, /https:\/\/www\.xiaohongshu\.com\/explore\/demo/);
});

test('inferTelegramFileName generates numbered image file names', () => {
  const result = inferTelegramFileName(
    { type: 'image', url: 'https://ci.xiaohongshu.com/demo.jpg' },
    { title: '测试笔记' },
    1,
  );

  assert.equal(result, '测试笔记_02.jpg');
});

test('isTelegramChatAllowed accepts all chats when allowlist is empty', () => {
  assert.equal(isTelegramChatAllowed(12345, new Set()), true);
});

test('isTelegramChatAllowed enforces configured allowlist', () => {
  assert.equal(isTelegramChatAllowed(12345, new Set(['12345'])), true);
  assert.equal(isTelegramChatAllowed(67890, new Set(['12345'])), false);
});

test('chunkTelegramMedia splits into batches of ten', () => {
  const items = Array.from({ length: 12 }, (_, index) => ({ id: index + 1 }));
  const chunks = chunkTelegramMedia(items);

  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, 10);
  assert.equal(chunks[1].length, 2);
  assert.equal(chunks[1][0].id, 11);
});

test('getTelegramMediaGroupType matches preview and document delivery modes', () => {
  assert.equal(getTelegramMediaGroupType({ type: 'image' }, 'preview'), 'photo');
  assert.equal(getTelegramMediaGroupType({ type: 'video' }, 'preview'), 'video');
  assert.equal(getTelegramMediaGroupType({ type: 'image' }, 'document'), 'document');
});

test('TelegramBotRunner persists update offset after handling a processed update', async () => {
  const originalFetch = global.fetch;
  const seenOffsets = [];
  const sendMessages = [];

  global.fetch = async (url, options = {}) => {
    const target = String(url);

    if (target.includes('/getUpdates')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 10,
              message: {
                chat: { id: 12345 },
                text: '/help',
                message_id: 77,
              },
            },
          ],
        }),
      };
    }

    if (target.includes('/sendMessage')) {
      sendMessages.push(JSON.parse(options.body));
      return {
        ok: true,
        json: async () => ({ ok: true, result: {} }),
      };
    }

    throw new Error(`Unexpected fetch: ${target}`);
  };

  try {
    const runner = new TelegramBotRunner({
      token: 'demo-token',
      allowedChatIds: new Set(),
      deliveryMode: 'document',
      initialOffset: 0,
      onOffsetChange: async (offset) => {
        seenOffsets.push(offset);
      },
    });

    runner.running = true;
    await runner.pollOnce();

    assert.deepEqual(seenOffsets, [11]);
    assert.equal(runner.offset, 11);
    assert.equal(sendMessages.length, 1);
  } finally {
    global.fetch = originalFetch;
  }
});

test('TelegramBotRunner does not acknowledge a later update when handling it fails', async () => {
  const originalFetch = global.fetch;
  const seenOffsets = [];
  let sendMessageCount = 0;

  global.fetch = async (url, options = {}) => {
    const target = String(url);

    if (target.includes('/getUpdates')) {
      return {
        ok: true,
        json: async () => ({
          ok: true,
          result: [
            {
              update_id: 10,
              message: {
                chat: { id: 12345 },
                text: '/help',
                message_id: 77,
              },
            },
            {
              update_id: 11,
              message: {
                chat: { id: 12345 },
                text: '/help',
                message_id: 78,
              },
            },
          ],
        }),
      };
    }

    if (target.includes('/sendMessage')) {
      sendMessageCount += 1;
      if (sendMessageCount === 2) {
        throw new Error('temporary telegram send failure');
      }

      return {
        ok: true,
        json: async () => ({ ok: true, result: {} }),
      };
    }

    throw new Error(`Unexpected fetch: ${target}`);
  };

  try {
    const runner = new TelegramBotRunner({
      token: 'demo-token',
      allowedChatIds: new Set(),
      deliveryMode: 'document',
      initialOffset: 0,
      onOffsetChange: async (offset) => {
        seenOffsets.push(offset);
      },
    });

    runner.running = true;
    await assert.rejects(
      runner.pollOnce(),
      /temporary telegram send failure/,
    );

    assert.deepEqual(seenOffsets, [11]);
    assert.equal(runner.offset, 11);
  } finally {
    global.fetch = originalFetch;
  }
});

test('TelegramBotRunner uses fallback media URLs for Telegram uploads', async () => {
  const originalFetch = global.fetch;
  const seenTargets = [];
  let sendDocumentCount = 0;

  global.fetch = async (url, options = {}) => {
    const target = String(url);
    seenTargets.push(target);

    if (target.includes('/sendChatAction')) {
      return {
        ok: true,
        json: async () => ({ ok: true, result: {} }),
      };
    }

    if (target.includes('api.fxtwitter.com/demo/status/1')) {
      return {
        ok: true,
        json: async () => ({
          code: 200,
          tweet: {
            id: '1',
            url: 'https://x.com/demo/status/1',
            text: '示例推文',
            author: {
              id: 'user-1',
              name: 'Demo User',
              screen_name: 'demo',
            },
            media: {
              all: [
                {
                  type: 'video',
                  url: 'https://video.twimg.com/demo/original.mp4',
                  formats: [
                    {
                      url: 'https://video.twimg.com/demo/primary.mp4',
                      bitrate: 2000,
                      container: 'mp4',
                    },
                    {
                      url: 'https://video.twimg.com/demo/fallback.mp4',
                      bitrate: 1000,
                      container: 'mp4',
                    },
                  ],
                },
              ],
            },
          },
        }),
      };
    }

    if (target.includes('video.twimg.com/demo/primary.mp4')) {
      return new Response('missing', { status: 404 });
    }

    if (target.includes('video.twimg.com/demo/fallback.mp4')) {
      return new Response(
        new Uint8Array([1, 2, 3, 4]),
        {
          status: 200,
          headers: {
            'Content-Type': 'video/mp4',
          },
        },
      );
    }

    if (target.includes('/sendDocument')) {
      sendDocumentCount += 1;
      return {
        ok: true,
        json: async () => ({ ok: true, result: {} }),
      };
    }

    throw new Error(`Unexpected fetch: ${target}`);
  };

  try {
    const runner = new TelegramBotRunner({
      token: 'demo-token',
      allowedChatIds: new Set(),
      deliveryMode: 'document',
    });

    await runner.handleMessage({
      chat: { id: 12345 },
      text: 'https://x.com/demo/status/1',
      message_id: 77,
    });

    assert.equal(sendDocumentCount, 1);
    assert.ok(seenTargets.some((target) => target.includes('video.twimg.com/demo/primary.mp4')));
    assert.ok(seenTargets.some((target) => target.includes('video.twimg.com/demo/fallback.mp4')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('TelegramBotRunner stop aborts an in-flight long poll', async () => {
  const originalFetch = global.fetch;
  let aborted = false;

  global.fetch = async (url, options = {}) => {
    const target = String(url);
    if (!target.includes('/getUpdates')) {
      throw new Error(`Unexpected fetch: ${target}`);
    }

    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        aborted = true;
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    });
  };

  try {
    const runner = new TelegramBotRunner({
      token: 'demo-token',
      allowedChatIds: new Set(),
      deliveryMode: 'document',
    });

    const loopPromise = runner.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await runner.stop();
    await loopPromise;

    assert.equal(aborted, true);
    assert.equal(runner.running, false);
  } finally {
    global.fetch = originalFetch;
  }
});
