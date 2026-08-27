// Keep the checked-in source video available locally, but never embed it in the Worker.
import { createHash } from 'node:crypto';
import { lstat, readFile, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = await realpath(fileURLToPath(new URL('..', import.meta.url)));
const file = 'evidence-board-walkthrough.mp4';
const hash = 'f8f262096d99e914700f5d9f7dcf8a8525032dd23b95fbf477a01450a3a2fed3';
const source = await readFile(path.join(root, 'public', file));
if (source.length !== 21080314 || createHash('sha256').update(source).digest('hex') !== hash) throw new Error('Update the pinned media manifest before publishing a different recording.');
for (const directory of ['client', 'server']) {
  const generated = path.resolve(root, 'dist', directory, file);
  if (!generated.startsWith(root + path.sep)) throw new Error('Generated media path escaped project.');
  const info = await lstat(generated).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  if (!info) continue;
  if (!info.isFile() || info.isSymbolicLink() || await realpath(generated) !== generated) throw new Error('Expected a regular generated media copy.');
  await unlink(generated);
}
console.log('Video verified and excluded from the Worker bundle; production serves it from R2.');
