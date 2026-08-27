import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createServer } from 'vite';

// Generate a portable example from source. Never read the owner's database,
// browser state, local backups, or deployed boards.
const output = resolve('examples/ai-coding-sample.json');
const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { createShowcaseStore } = await vite.ssrLoadModule('/src/data/showcase.ts');
  const { createBoardStore } = await vite.ssrLoadModule('/src/state/boardStore.ts');
  const session = JSON.parse(createShowcaseStore().exportSession());
  const restored = createBoardStore({ session, storage: null });
  assert.deepEqual(JSON.parse(restored.exportSession()), session, 'The portable example must survive complete-session import.');
  const serialized = `${JSON.stringify(session, null, 2)}\n`;
  await mkdir(resolve('examples'), { recursive: true });
  // Do not silently replace an example someone has edited.
  await writeFile(output, serialized, { flag: 'wx' });
  console.log(JSON.stringify({ output, bytes: Buffer.byteLength(serialized), cards: session.content.nodes.length, sources: session.content.sources.length, connections: session.content.links.length, pendingProposals: session.changeSets.filter(set => set.status === 'pending').length }));
} finally {
  await vite.close();
}
