import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cookieRowsToHeader,
  decryptChromeCookieValue,
  encryptChromeCookieValueForTest,
} from '../src/browser-cookie.js';

test('decryptChromeCookieValue decodes Chrome v10 cookie payload', () => {
  const secret = 'unit-test-secret';
  const plain = 'web_session=abc123';
  const encrypted = encryptChromeCookieValueForTest(plain, secret);

  assert.equal(decryptChromeCookieValue(encrypted, secret), plain);
});

test('decryptChromeCookieValue strips Chrome host-hash prefix when present', () => {
  const secret = 'unit-test-secret';
  const prefixed = Buffer.concat([Buffer.alloc(32, 1), Buffer.from('clean-cookie-value', 'utf8')]).toString('binary');
  const encrypted = encryptChromeCookieValueForTest(prefixed, secret);

  assert.equal(decryptChromeCookieValue(encrypted, secret), 'clean-cookie-value');
});

test('cookieRowsToHeader deduplicates by latest cookie name', () => {
  const header = cookieRowsToHeader([
    { name: 'a1', value: 'old' },
    { name: 'gid', value: '1' },
    { name: 'a1', value: 'new' },
  ]);

  assert.equal(header, 'a1=new; gid=1');
});
