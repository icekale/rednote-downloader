import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const ROOT = process.cwd();
const TARGET_DIRS = ['src', 'public'];
const execFileAsync = promisify(execFile);

async function collectJavaScriptFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectJavaScriptFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(absolutePath);
    }
  }

  return files;
}

const files = (
  await Promise.all(TARGET_DIRS.map((dir) => collectJavaScriptFiles(path.join(ROOT, dir))))
).flat();

await Promise.all(files.map((file) => execFileAsync(process.execPath, ['--check', file])));
console.log(`Syntax check passed for ${files.length} JavaScript files.`);
