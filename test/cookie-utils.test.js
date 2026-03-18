import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCookieText, pairsToCookieHeader } from '../public/cookie-utils.js';

test('parseCookieText supports raw cookie header', () => {
  const parsed = parseCookieText('a=1; b=2; c=3');
  assert.equal(parsed, 'a=1; b=2; c=3');
});

test('parseCookieText supports netscape cookie file', () => {
  const input = `
# Netscape HTTP Cookie File
.xiaohongshu.com\tTRUE\t/\tFALSE\t1735689600\ta1\tfoo
.xiaohongshu.com\tTRUE\t/\tFALSE\t1735689600\tweb_session\tbar
  `;

  const parsed = parseCookieText(input);
  assert.equal(parsed, 'a1=foo; web_session=bar');
});

test('parseCookieText supports json array export', () => {
  const input = JSON.stringify([
    { name: 'a1', value: 'foo' },
    { name: 'webId', value: 'bar' },
  ]);

  const parsed = parseCookieText(input);
  assert.equal(parsed, 'a1=foo; webId=bar');
});

test('pairsToCookieHeader deduplicates by latest value', () => {
  const header = pairsToCookieHeader([
    { name: 'a1', value: 'old' },
    { name: 'web_session', value: 'bar' },
    { name: 'a1', value: 'new' },
  ]);

  assert.equal(header, 'a1=new; web_session=bar');
});
