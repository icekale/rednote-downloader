import { createCipheriv, createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);

const CHROME_BASE_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'Google', 'Chrome');
const XHS_HOST_FILTER = `%xiaohongshu%`;
const SAFE_STORAGE_SERVICES = [
  'Chrome Safe Storage',
  'Google Chrome Safe Storage',
];

function isPkcs7Padded(buffer) {
  const pad = buffer[buffer.length - 1];
  if (!pad || pad > 16 || pad > buffer.length) {
    return false;
  }

  for (let index = buffer.length - pad; index < buffer.length; index += 1) {
    if (buffer[index] !== pad) {
      return false;
    }
  }

  return true;
}

function stripPkcs7(buffer) {
  if (!buffer.length || !isPkcs7Padded(buffer)) {
    return buffer;
  }

  return buffer.subarray(0, buffer.length - buffer[buffer.length - 1]);
}

function textScore(buffer) {
  if (!buffer.length) {
    return 0;
  }

  let printable = 0;
  for (const byte of buffer) {
    if (
      (byte >= 0x20 && byte <= 0x7e) ||
      byte === 0x09 ||
      byte === 0x0a ||
      byte === 0x0d
    ) {
      printable += 1;
    }
  }

  return printable / buffer.length;
}

function stripChromeDomainHashPrefix(buffer) {
  if (buffer.length <= 32) {
    return buffer;
  }

  const stripped = buffer.subarray(32);
  return textScore(stripped) > textScore(buffer) ? stripped : buffer;
}

export function deriveChromeMacKey(safeStorageSecret) {
  return pbkdf2Sync(safeStorageSecret, 'saltysalt', 1003, 16, 'sha1');
}

export function decryptChromeCookieValue(encryptedValue, safeStorageSecret) {
  const buffer = Buffer.isBuffer(encryptedValue)
    ? encryptedValue
    : Buffer.from(encryptedValue);
  const prefix = buffer.subarray(0, 3).toString('utf8');

  if (prefix !== 'v10') {
    return buffer.toString('utf8');
  }

  const key = deriveChromeMacKey(safeStorageSecret);
  const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20));
  decipher.setAutoPadding(false);

  const decrypted = Buffer.concat([
    decipher.update(buffer.subarray(3)),
    decipher.final(),
  ]);

  return stripChromeDomainHashPrefix(stripPkcs7(decrypted)).toString('utf8');
}

async function getChromeProfileDirs() {
  const entries = await readdir(CHROME_BASE_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name === 'Default' || /^Profile \d+$/.test(name))
    .sort((left, right) => (left === 'Default' ? -1 : left.localeCompare(right)));
}

async function makeCookiesDbCopy(profileName) {
  const sourcePath = path.join(CHROME_BASE_DIR, profileName, 'Cookies');
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'rednote-chrome-cookies-'));
  const tempPath = path.join(tempDir, 'Cookies.sqlite3');

  await copyFile(sourcePath, tempPath);

  return {
    tempDir,
    tempPath,
    sourcePath,
  };
}

async function queryCookies(dbPath) {
  const sql = `
    select
      host_key,
      name,
      path,
      value,
      hex(encrypted_value) as encrypted_value_hex
    from cookies
    where host_key like '${XHS_HOST_FILTER}'
    order by host_key asc, name asc;
  `;
  const { stdout } = await execFile('sqlite3', ['-json', dbPath, sql], {
    maxBuffer: 1024 * 1024 * 4,
  });

  return JSON.parse(stdout || '[]');
}

async function getChromeSafeStorageSecret() {
  for (const service of SAFE_STORAGE_SERVICES) {
    try {
      const { stdout } = await execFile('security', ['find-generic-password', '-w', '-s', service], {
        maxBuffer: 1024 * 1024,
      });
      const secret = stdout.trim();
      if (secret) {
        return secret;
      }
    } catch {
      continue;
    }
  }

  throw new Error('Unable to read Chrome Safe Storage from macOS Keychain. Please allow keychain access, or import Cookie manually.');
}

function normalizeCookieRows(rows, safeStorageSecret) {
  return rows
    .map((row) => {
      const encryptedHex = row.encrypted_value_hex || '';
      const encryptedBuffer = encryptedHex ? Buffer.from(encryptedHex, 'hex') : Buffer.alloc(0);
      const value = row.value || (encryptedBuffer.length ? decryptChromeCookieValue(encryptedBuffer, safeStorageSecret) : '');

      return {
        host: row.host_key,
        name: row.name,
        path: row.path,
        value,
      };
    })
    .filter((row) => row.name && row.value);
}

export function cookieRowsToHeader(rows) {
  const map = new Map();
  for (const row of rows) {
    map.set(row.name, row.value);
  }
  return [...map.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

export async function readChromeXiaohongshuCookie() {
  const profiles = await getChromeProfileDirs();
  if (profiles.length === 0) {
    throw new Error('No Chrome profile found on this Mac.');
  }

  const safeStorageSecret = await getChromeSafeStorageSecret();
  let best = null;

  for (const profileName of profiles) {
    let temp;

    try {
      temp = await makeCookiesDbCopy(profileName);
      const rows = await queryCookies(temp.tempPath);
      const normalized = normalizeCookieRows(rows, safeStorageSecret);

      if (!normalized.length) {
        continue;
      }

      const header = cookieRowsToHeader(normalized);
      if (!header) {
        continue;
      }

      if (!best || normalized.length > best.cookieCount) {
        best = {
          browser: 'chrome',
          profile: profileName,
          cookieCount: normalized.length,
          cookie: header,
          hosts: [...new Set(normalized.map((row) => row.host))],
          names: normalized.map((row) => row.name),
        };
      }
    } finally {
      if (temp?.tempDir) {
        await rm(temp.tempDir, { recursive: true, force: true });
      }
    }
  }

  if (!best) {
    throw new Error('Chrome is installed, but no Xiaohongshu cookies were found in the available profiles.');
  }

  return best;
}

export function encryptChromeCookieValueForTest(plainText, safeStorageSecret) {
  const key = deriveChromeMacKey(safeStorageSecret);
  const blockSize = 16;
  const raw = Buffer.from(plainText, 'utf8');
  const remainder = raw.length % blockSize;
  const padding = remainder === 0 ? blockSize : blockSize - remainder;
  const padded = Buffer.concat([raw, Buffer.alloc(padding, padding)]);
  const encryptor = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, 0x20));
  encryptor.setAutoPadding(false);
  return Buffer.concat([Buffer.from('v10'), encryptor.update(padded), encryptor.final()]);
}
