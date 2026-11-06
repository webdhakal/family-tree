import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const dist = resolve(process.argv[2] ?? 'dist');
const assets = (await readdir(resolve(dist, 'assets'))).sort().map(file => `/assets/${file}`);
const paths = ['/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', ...assets];
const worker = await readFile(new URL('./service-worker.js', import.meta.url), 'utf8');
const hash = createHash('sha256').update(worker);
for (const path of paths) hash.update(await readFile(resolve(dist, '.' + path)));
const version = hash.digest('hex').slice(0, 16);
await writeFile(resolve(dist, 'sw.js'),
  `const BUILD_ID = ${JSON.stringify(version)};\nconst PRECACHE = ${JSON.stringify(paths)};\n${worker}`,
);
