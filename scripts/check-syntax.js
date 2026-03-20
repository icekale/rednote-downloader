import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';

const ROOT = process.cwd();
const TARGETS = ['src', 'public', 'test', 'scripts'];

function collectJavaScriptFiles(directory) {
  const entries = readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...collectJavaScriptFiles(fullPath));
      continue;
    }

    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

const files = TARGETS
  .map((target) => path.join(ROOT, target))
  .filter((target) => {
    try {
      return statSync(target).isDirectory();
    } catch {
      return false;
    }
  })
  .flatMap((target) => collectJavaScriptFiles(target));

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], {
    stdio: 'inherit',
  });
}
