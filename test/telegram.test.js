import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
