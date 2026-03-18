import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFixTwitterApiUrl,
  deriveOriginalImageUrl,
  ensureAllowedMediaUrl,
  extractFirstUrl,
  extractImages,
  extractTwitterMedia,
  extractVideo,
  getNoteData,
  normalizeTwitterPhotoUrl,
  parseNoteFromHtml,
  parseTweetFromApiPayload,
} from '../src/xhs.js';

test('extractFirstUrl pulls URL from share text', () => {
  const input = '23 小明发布了一篇小红书笔记，快来看吧！ 😆 http://xhslink.com/a/abc123 复制本条信息';
  assert.equal(extractFirstUrl(input), 'http://xhslink.com/a/abc123');
});

test('deriveOriginalImageUrl converts preview URL into ci download URL', () => {
  const input = 'http://sns-webpic-qc.xhscdn.com/202401011200/abcd1234/image-token!nd_dft_wlteh_webp_3';
  assert.equal(
    deriveOriginalImageUrl(input),
    'https://ci.xiaohongshu.com/image-token',
  );
});

test('extractImages prefers ci.xiaohongshu.com when available', () => {
  const result = extractImages({
    imageList: [
      {
        urlDefault: 'http://sns-webpic-qc.xhscdn.com/202401011200/abcd1234/token-one!nd_dft_wlteh_webp_3',
      },
    ],
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].url, 'https://ci.xiaohongshu.com/token-one');
});

test('extractVideo prefers origin video key direct CDN URL', () => {
  const result = extractVideo({
    video: {
      consumer: {
        originVideoKey: 'path/to/video.mp4',
      },
      media: {
        stream: {
          h265: [
            { masterUrl: 'https://example.com/fallback.m3u8' },
          ],
        },
      },
    },
  });

  assert.ok(result);
  assert.equal(result.url, 'https://sns-video-bd.xhscdn.com/path/to/video.mp4');
});

test('getNoteData supports note.noteDetailMap pages', () => {
  const state = {
    note: {
      noteDetailMap: {
        abc123: {
          note: {
            noteId: 'abc123',
            title: '示例标题',
            type: 'normal',
            imageList: [
              {
                urlDefault: 'http://sns-webpic-qc.xhscdn.com/202401011200/abcd1234/token-two!nd_dft_wlteh_webp_3',
              },
            ],
          },
        },
      },
    },
  };

  const note = getNoteData(state, 'https://www.xiaohongshu.com/explore/abc123?xsec_token=demo');
  assert.equal(note?.noteId, 'abc123');
});

test('parseNoteFromHtml supports noteData payload pages', () => {
  const html = `
    <html>
      <head><title>我的测试笔记 - 小红书</title></head>
      <body>
        <script>
          window.__INITIAL_STATE__={
            "noteData":{
              "data":{
                "noteData":{
                  "noteId":"note123",
                  "title":"我的测试笔记",
                  "desc":"正文内容",
                  "type":"video",
                  "user":{"nickname":"作者A","userId":"user123"},
                  "video":{
                    "consumer":{"originVideoKey":"origin/video.mp4"},
                    "media":{"stream":{"h264":[{"masterUrl":"https://video-cdn.example/fallback.m3u8"}]}}
                  }
                }
              }
            }
          }
        </script>
      </body>
    </html>
  `;

  const parsed = parseNoteFromHtml(html, 'https://www.xiaohongshu.com/explore/note123');
  assert.equal(parsed.noteId, 'note123');
  assert.equal(parsed.type, 'video');
  assert.equal(parsed.media[0].url, 'https://sns-video-bd.xhscdn.com/origin/video.mp4');
});

test('ensureAllowedMediaUrl rejects non-xiaohongshu media hosts', () => {
  assert.throws(
    () => ensureAllowedMediaUrl('https://example.com/demo.jpg'),
    /Unsupported media host/,
  );
});

test('buildFixTwitterApiUrl converts an x.com status URL into fxtwitter api URL', () => {
  assert.equal(
    buildFixTwitterApiUrl('https://x.com/imanstore_9/status/2031161811874324962'),
    'https://api.fxtwitter.com/imanstore_9/status/2031161811874324962',
  );
});

test('normalizeTwitterPhotoUrl prefers original-size image urls', () => {
  assert.equal(
    normalizeTwitterPhotoUrl('https://pbs.twimg.com/media/Example123.jpg?format=jpg&name=small'),
    'https://pbs.twimg.com/media/Example123.jpg?format=jpg&name=orig',
  );
});

test('extractTwitterMedia keeps image order and picks best video variant', () => {
  const media = extractTwitterMedia({
    media: {
      all: [
        {
          type: 'photo',
          url: 'https://pbs.twimg.com/media/PhotoOne.jpg?format=jpg&name=small',
          width: 1200,
          height: 900,
        },
        {
          type: 'video',
          url: 'https://video.twimg.com/amplify_video/demo/vid/avc1/640x360/base.mp4?tag=21',
          formats: [
            { url: 'https://video.twimg.com/amplify_video/demo/vid/avc1/320x180/low.mp4?tag=21', bitrate: 256000, container: 'mp4' },
            { url: 'https://video.twimg.com/amplify_video/demo/vid/avc1/1280x720/high.mp4?tag=21', bitrate: 2176000, container: 'mp4' },
          ],
        },
      ],
    },
  });

  assert.equal(media.length, 2);
  assert.equal(media[0].url, 'https://pbs.twimg.com/media/PhotoOne.jpg?format=jpg&name=orig');
  assert.equal(media[1].url, 'https://video.twimg.com/amplify_video/demo/vid/avc1/1280x720/high.mp4?tag=21');
});

test('parseTweetFromApiPayload converts fxtwitter response into note shape', () => {
  const parsed = parseTweetFromApiPayload({
    tweet: {
      id: '2031161811874324962',
      url: 'https://x.com/imanstore_9/status/2031161811874324962',
      text: '示例推文正文',
      author: {
        id: '1374708079887937536',
        name: '公穴崩坏（成都）',
        screen_name: 'imanstore_9',
      },
      media: {
        all: [
          {
            type: 'video',
            url: 'https://video.twimg.com/amplify_video/demo/vid/avc1/480x852/base.mp4?tag=21',
            formats: [
              { url: 'https://video.twimg.com/amplify_video/demo/vid/avc1/480x852/base.mp4?tag=21', bitrate: 950000, container: 'mp4' },
              { url: 'https://video.twimg.com/amplify_video/demo/vid/avc1/720x1280/best.mp4?tag=21', bitrate: 2176000, container: 'mp4' },
            ],
          },
        ],
      },
    },
  });

  assert.equal(parsed.noteId, '2031161811874324962');
  assert.equal(parsed.title, 'X @imanstore_9');
  assert.equal(parsed.author.nickname, '公穴崩坏（成都）');
  assert.equal(parsed.type, 'video');
  assert.equal(parsed.media[0].url, 'https://video.twimg.com/amplify_video/demo/vid/avc1/720x1280/best.mp4?tag=21');
});

test('ensureAllowedMediaUrl accepts twitter media hosts', () => {
  assert.doesNotThrow(() => ensureAllowedMediaUrl('https://pbs.twimg.com/media/Example123.jpg?format=jpg&name=orig'));
  assert.doesNotThrow(() => ensureAllowedMediaUrl('https://video.twimg.com/amplify_video/demo/vid/avc1/720x1280/high.mp4?tag=21'));
});
