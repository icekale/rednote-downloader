import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildDouyinAwemeDetailUrl,
  extractDouyinAwemeId,
  generateXBogus,
  isDouyinShareHost,
  parseDouyinAwemeDetail,
  pickDouyinVideoCandidate,
  resolveDouyinShareUrl,
} from './douyin.js';

test('detects supported Douyin share hosts', () => {
  assert.equal(isDouyinShareHost('www.douyin.com'), true);
  assert.equal(isDouyinShareHost('v.douyin.com'), true);
  assert.equal(isDouyinShareHost('v.iesdouyin.com'), true);
  assert.equal(isDouyinShareHost('www.iesdouyin.com'), true);
  assert.equal(isDouyinShareHost('example.com'), false);
});

test('extracts aweme id from supported single video URLs', () => {
  assert.equal(
    extractDouyinAwemeId('https://www.douyin.com/video/7321234567890123456?previous_page=app_code_link'),
    '7321234567890123456',
  );
  assert.equal(
    extractDouyinAwemeId('https://www.douyin.com/discover?modal_id=7321234567890123456'),
    '7321234567890123456',
  );
  assert.equal(
    extractDouyinAwemeId('https://www.iesdouyin.com/share/video/7321234567890123456/?region=CN'),
    '7321234567890123456',
  );
  assert.equal(extractDouyinAwemeId('https://www.douyin.com/user/MS4wLjABAAAA'), null);
});

test('generates stable X-Bogus shape and signed detail URL', () => {
  const unsignedPath = 'https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=7321234567890123456&aid=6383';
  const { signedUrl, xBogus, userAgent } = generateXBogus(unsignedPath, {
    now: 1_700_000_000,
    userAgent: 'Mozilla/5.0 Test Agent',
  });

  assert.equal(typeof xBogus, 'string');
  assert.equal(xBogus.length, 28);
  assert.match(xBogus, /^[A-Za-z0-9/+=_-]+$/);
  assert.equal(userAgent, 'Mozilla/5.0 Test Agent');
  assert.ok(signedUrl.startsWith(`${unsignedPath}&X-Bogus=`));

  const detail = buildDouyinAwemeDetailUrl('7321234567890123456', {
    now: 1_700_000_000,
    userAgent: 'Mozilla/5.0 Test Agent',
  });
  assert.ok(detail.signedUrl.includes('/aweme/v1/web/aweme/detail/'));
  assert.ok(detail.signedUrl.includes('aweme_id=7321234567890123456'));
  assert.ok(detail.signedUrl.includes('X-Bogus='));
});

test('picks the highest bitrate non-watermarked video candidate before fallbacks', () => {
  const video = {
    bit_rate: [
      {
        bit_rate: 900,
        play_addr: {
          width: 720,
          url_list: ['https://v26.douyinvod.com/low.mp4?watermark=0'],
        },
      },
      {
        bit_rate: 2400,
        play_addr: {
          width: 1080,
          url_list: [
            'https://www.douyin.com/aweme/v1/play/?video_id=abc&playwm=1',
            'https://v3.douyinvod.com/high.mp4?watermark=0',
          ],
        },
      },
    ],
    play_addr: {
      url_list: ['https://www.douyin.com/aweme/v1/play/?video_id=fallback&playwm=1'],
    },
  };

  const candidate = pickDouyinVideoCandidate(video);

  assert.equal(candidate.url, 'https://v3.douyinvod.com/high.mp4?watermark=0');
  assert.equal(candidate.watermarked, false);
});

test('falls back to signed no-watermark play endpoint when no direct candidate exists', () => {
  const candidate = pickDouyinVideoCandidate({
    vid: 'video-token-1',
    play_addr: {
      uri: 'play-uri-1',
      url_list: ['https://www.douyin.com/aweme/v1/play/?video_id=watermarked&playwm=1'],
    },
  }, {
    now: 1_700_000_000,
    userAgent: 'Mozilla/5.0 Test Agent',
  });

  assert.equal(candidate.watermarked, false);
  assert.ok(candidate.url.includes('/aweme/v1/play/'));
  assert.ok(candidate.url.includes('watermark=0'));
  assert.ok(candidate.url.includes('X-Bogus='));
});

test('parses aweme detail payload into the existing note shape', () => {
  const note = parseDouyinAwemeDetail({
    aweme_detail: {
      aweme_id: '7321234567890123456',
      desc: 'A public Douyin video',
      aweme_type: 0,
      author: {
        nickname: 'Creator',
        uid: '123',
        sec_uid: 'sec-123',
      },
      video: {
        bit_rate: [
          {
            bit_rate: 1800,
            play_addr: {
              width: 1080,
              height: 1920,
              url_list: ['https://v3.douyinvod.com/video.mp4?watermark=0'],
            },
          },
        ],
        cover: {
          url_list: ['https://p3-sign.douyinpic.com/cover.jpeg'],
        },
      },
    },
  }, 'https://www.douyin.com/video/7321234567890123456');

  assert.equal(note.noteId, '7321234567890123456');
  assert.equal(note.title, 'A public Douyin video');
  assert.equal(note.description, 'A public Douyin video');
  assert.equal(note.type, 'video');
  assert.deepEqual(note.author, {
    nickname: 'Creator',
    userId: '123',
  });
  assert.equal(note.media.length, 1);
  assert.equal(note.media[0].type, 'video');
  assert.equal(note.media[0].url, 'https://v3.douyinvod.com/video.mp4?watermark=0');
  assert.equal(note.media[0].thumbnailUrl, 'https://p3-sign.douyinpic.com/cover.jpeg');
  assert.deepEqual(note.warnings, []);
});

test('resolves Douyin short links by following redirects to a supported video URL', async () => {
  const seen = [];
  const fetchImpl = async (url) => {
    seen.push(url.toString());
    if (url.toString() === 'https://v.douyin.com/abc123/') {
      return {
        status: 302,
        headers: {
          get(name) {
            return name.toLowerCase() === 'location'
              ? 'https://www.iesdouyin.com/share/video/7321234567890123456/?region=CN'
              : null;
          },
        },
      };
    }

    return {
      status: 302,
      headers: {
        get(name) {
          return name.toLowerCase() === 'location'
            ? 'https://www.douyin.com/video/7321234567890123456'
            : null;
        },
      },
    };
  };

  const resolved = await resolveDouyinShareUrl('https://v.douyin.com/abc123/', { fetchImpl });

  assert.equal(resolved.toString(), 'https://www.douyin.com/video/7321234567890123456');
  assert.deepEqual(seen, [
    'https://v.douyin.com/abc123/',
    'https://www.iesdouyin.com/share/video/7321234567890123456/?region=CN',
  ]);
});
