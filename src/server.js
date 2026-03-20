import { pathToFileURL } from 'node:url';
import { buildServerOptions, createRednoteApp } from './server-app.js';

function isEntrypoint(metaUrl) {
  return Boolean(process.argv[1]) && metaUrl === pathToFileURL(process.argv[1]).href;
}

export { buildServerOptions, createRednoteApp } from './server-app.js';

if (isEntrypoint(import.meta.url)) {
  const app = await createRednoteApp();
  await app.start();
}
