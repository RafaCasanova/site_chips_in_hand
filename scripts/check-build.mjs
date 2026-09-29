import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../dist/site-chips-in-hand/browser/', import.meta.url);
const html = await readFile(new URL('index.html', root), 'utf8');
assert(!/<style\b|\son\w+=/i.test(html), 'Build must not inline styles or event handlers.');
assert(!/<script(?![^>]*\bsrc=)[^>]*>\s*\S/i.test(html), 'Build must not inline scripts.');
const config = JSON.parse(await readFile(new URL('runtime-config.json', root), 'utf8'));
assert.deepEqual(Object.keys(config), ['apiBaseUrl']);
for (const file of await readdir(root)) {
  if (!/\.(js|json|html)$/.test(file)) continue;
  const content = await readFile(new URL(file, root), 'utf8');
  assert(
    !/GOCSPX-|-----BEGIN .*PRIVATE KEY-----/.test(content),
    `Credential pattern found in ${file}`,
  );
}
console.info('Static build verified: external scripts/styles and public runtime config.');
