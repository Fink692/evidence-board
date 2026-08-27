import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleApi } from '../server/api';
import { openLocalDatabase } from '../server/local-database';
import { createEmptyContent, createSeedContent } from '../src/data/seed';
import { createShowcaseStore } from '../src/data/showcase';
import { createBoardStore } from '../src/state/boardStore';
import type { BoardStore } from '../src/domain/types';

let db: ReturnType<typeof openLocalDatabase>;
let store: BoardStore;
beforeEach(() => { db = openLocalDatabase(':memory:'); const content = createEmptyContent('Should we change our planning process?'); content.title = 'Planning research'; store = createBoardStore({ content, storage: null }); });
afterEach(() => db.close());
function request(path: string, method = 'GET', body?: unknown, user = 'alice', extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Evidence-Board': '1', ...extra };
  if (user) { headers['oai-authenticated-user-id'] = user; headers['oai-authenticated-user-email'] = `${user}@example.test`; }
  return handleApi(new Request(`https://research.example.test${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }), { DB: db });
}
const session = () => JSON.parse(store.exportSession());
const create = (id = 'research_one', user = 'alice') => request('/api/boards', 'POST', { id, session: session() }, user);

describe('authenticated durable research workspace', () => {
  it('starts empty and rejects anonymous research access', async () => {
    expect((await request('/api/workspace', 'GET', undefined, '')).status).toBe(401);
    expect((await request('/api/boards', 'POST', { id: 'x', session: session() }, '')).status).toBe(401);
    const response = await request('/api/workspace');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect((await response.json()).boards).toEqual([]);
  });
  it('creates and reopens the actual question with no fictional content', async () => {
    expect((await create()).status).toBe(201);
    const reopened = await (await request('/api/boards/research_one')).json();
    expect(reopened.board).toMatchObject({ title: 'Planning research', version: 1, nodeCount: 0 });
    expect(reopened.session).toEqual(session());
    expect((await (await request('/api/workspace')).json()).boards).toHaveLength(1);
  });
  it('isolates all board reads, writes and deletes by the stable owner ID', async () => {
    await create();
    expect((await (await request('/api/workspace', 'GET', undefined, 'bob')).json()).boards).toEqual([]);
    expect((await request('/api/boards/research_one', 'GET', undefined, 'bob')).status).toBe(404);
    expect((await request('/api/boards/research_one', 'PUT', { version: 1, session: session() }, 'bob')).status).toBe(409);
    expect((await request('/api/boards/research_one', 'DELETE', undefined, 'bob', { 'If-Match': '1' })).status).toBe(409);
    expect((await request('/api/boards/research_one')).status).toBe(200);
  });
  it('rejects cross-origin writes and missing request guard', async () => {
    expect((await request('/api/boards', 'POST', { id: 'x', session: session() }, 'alice', { Origin: 'https://unrelated.example.test' })).status).toBe(403);
    expect((await request('/api/boards', 'POST', { id: 'x', session: session() }, 'alice', { 'X-Evidence-Board': '' })).status).toBe(403);
    expect((await request('/api/boards', 'POST', { id: 'x', session: session() }, 'alice', { 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403);
  });
  it('never overwrites an existing board on create or stale save', async () => {
    await create();
    store.updateMetadata({ title: 'Revised planning question', question: store.getState().content.question, description: '' });
    expect((await create()).status).toBe(409);
    expect((await request('/api/boards/research_one', 'PUT', { version: 1, session: session() })).status).toBe(200);
    store.updateMetadata({ title: 'Stale edit', question: 'New question?', description: '' });
    expect((await request('/api/boards/research_one', 'PUT', { version: 1, session: session() })).status).toBe(409);
    const saved = await (await request('/api/boards/research_one')).json();
    expect(saved.board).toMatchObject({ version: 2, title: 'Revised planning question' });
    expect(saved.session.content.title).toBe('Revised planning question');
  });
  it('persists pending choices and undo history even when the accepted revision has not changed', async () => {
    store = createBoardStore({ content: createSeedContent(), storage: null });
    store.applyHumanOperations([{ type: 'update_node', nodeId: 'claim_access', patch: { title: 'An actual edited claim' } }], 'Edited claim');
    const proposal = store.proposeChangeSet({ title: 'Review', summary: 'Review a possible conclusion.', baseRevision: 2, changes: [{ title: 'Conclusion', rationale: 'Needs human judgement.', operation: { type: 'set_conclusion', conclusion: 'A proposed decision.' } }] });
    await create();
    store.toggleChange(proposal.id, proposal.changes[0].id);
    await request('/api/boards/research_one', 'PUT', { version: 1, session: session() });
    const saved = await (await request('/api/boards/research_one')).json();
    const restored = createBoardStore({ session: saved.session, storage: null });
    expect(restored.getState().revision).toBe(2);
    expect(restored.getState().changeSets[0].changes[0].selected).toBe(false);
    restored.undo();
    expect(restored.getState().content).toEqual(createSeedContent());
    expect(saved.board.version).toBe(2);
  });
  it('keeps in-flight tool activity in flight while validating a save', async () => {
    store.recordActivity({ actor: 'agent', title: 'Reading the sources', detail: 'Tool call in progress.', status: 'running' });
    await create();
    expect((await (await request('/api/boards/research_one')).json()).session.activity[0].status).toBe('running');
  });
  it('round-trips a multi-chunk Unicode session without corrupting text', async () => {
    const content = createEmptyContent('Unicode research');
    content.nodes = Array.from({ length: 80 }, (_, index) => ({ id: `claim_${index}`, kind: 'claim' as const, title: `Research claim ${index}`, body: '🙂'.repeat(2999), confidence: 'medium' as const, createdBy: 'human' as const, createdAt: '2026-08-27T00:00:00.000Z', position: { x: 0, y: 0 } }));
    store = createBoardStore({ content, storage: null });
    expect((await create()).status).toBe(201);
    expect((await (await request('/api/boards/research_one')).json()).session).toEqual(session());
    expect((await db.prepare('SELECT part FROM board_chunks').all()).results.length).toBeGreaterThan(1);
  });
  it('rejects invalid graph data atomically and keeps the previous saved session', async () => {
    await create(); const bad = session(); bad.content.sources = [{ id: 'invalid' }];
    expect((await request('/api/boards/research_one', 'PUT', { version: 1, session: bad })).status).toBe(400);
    const record = await (await request('/api/boards/research_one')).json();
    expect(record.board.version).toBe(1); expect(record.session).toEqual(session());
  });
  it('requires a current version for deletion and removes all session chunks', async () => {
    await create();
    expect((await request('/api/boards/research_one', 'DELETE')).status).toBe(400);
    expect((await request('/api/boards/research_one', 'DELETE', undefined, 'alice', { 'If-Match': '2' })).status).toBe(409);
    expect((await request('/api/boards/research_one', 'DELETE', undefined, 'alice', { 'If-Match': '1' })).status).toBe(200);
    expect((await db.prepare('SELECT board_id FROM board_chunks').all()).results).toEqual([]);
    expect((await (await request('/api/workspace')).json()).boards).toEqual([]);
  });
});

describe('portable sample in an account workspace', () => {
  it('imports complete sample research for only the signed-in owner', async () => {
    store = createShowcaseStore();
    const original = session();
    expect((await create('research_imported')).status).toBe(201);
    const saved = await (await request('/api/boards/research_imported')).json();
    expect(saved.session).toEqual(original);
    expect((await request('/api/boards/research_imported', 'GET', undefined, 'bob')).status).toBe(404);
    expect((await (await request('/api/workspace', 'GET', undefined, 'bob')).json()).boards).toEqual([]);
  });

  it('persists selective review and restores exact accepted content after Undo', async () => {
    store = createShowcaseStore();
    const original = store.getState().content;
    await create('research_imported');
    const proposal = store.getState().changeSets[0];
    store.toggleChange(proposal.id, 'sample_change_gate');
    store.applyChangeSet(proposal.id);
    expect((await request('/api/boards/research_imported', 'PUT', { version: 1, session: session() })).status).toBe(200);
    const saved = await (await request('/api/boards/research_imported')).json();
    store = createBoardStore({ session: saved.session, storage: null });
    store.undo();
    expect((await request('/api/boards/research_imported', 'PUT', { version: 2, session: session() })).status).toBe(200);
    const restored = await (await request('/api/boards/research_imported')).json();
    expect(restored.session.content).toEqual(original);
    expect(restored.session.changeSets[0].status).toBe('undone');
  });
});
