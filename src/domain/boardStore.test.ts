import { describe, expect, it, vi } from 'vitest';
import { createSeedContent } from '../data/seed';
import { createShowcaseStore } from '../data/showcase';
import { checkEvidence } from './evidence-check';
import { BOARD_SCHEMA_VERSION, BOARD_STORAGE_KEY, createBoardStore } from '../state/boardStore';
import { escapeMarkdown, generateBrief } from './brief';
import { getBoardStats, getNodeRelations, getVisibleNodes } from './selectors';
import { portableExportSize } from './serialization';
import type { BoardContent, BoardNode, ChangeSet, Operation, ProposalInput } from './types';
import { DomainError, LIMITS, applyOperations, validateContent } from './validation';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

const fresh = () => createBoardStore({ storage: null });
const humanEdit = (title = 'A carefully revised claim'): Operation => ({ type: 'update_node', nodeId: 'claim_access', patch: { title } });
const challenge: Operation = {
  type: 'link_evidence',
  link: { id: 'link_after_midnight', evidenceId: 'evidence_turnstile', claimId: 'claim_demand', stance: 'challenges', reason: 'Observed entries after midnight are much lower than the general preference signal.', createdBy: 'human' },
};
const newQuestion = (id = 'question_new'): BoardNode => ({
  id,
  kind: 'question',
  title: 'What would we need to measure next?',
  body: 'Measure hourly occupancy and unmet access needs during a limited pilot.',
  confidence: 'low',
  createdBy: 'human',
  createdAt: '2026-08-27T10:00:00.000Z',
  position: { x: 200, y: 300 },
});

function proposal(operations: Operation[], revision = 1): ProposalInput {
  return {
    title: 'Challenge the working conclusion',
    summary: 'Review a missing relationship and a possible follow-up.',
    baseRevision: revision,
    changes: operations.map((operation, index) => ({ id: `change_${index}`, title: `Review change ${index + 1}`, rationale: 'Check this against the cited source before approving.', operation })),
  };
}

function boardFile(content: BoardContent, revision = 1) {
  return JSON.stringify({ format: 'evidence-board', version: BOARD_SCHEMA_VERSION, exportedAt: '2026-08-27T10:00:00.000Z', revision, content });
}

function expectCode(action: () => unknown, code: DomainError['code']) {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(DomainError);
  expect((caught as DomainError).code).toBe(code);
  return caught as DomainError;
}

/** A valid graph whose formatted export size can cross the aggregate capacity boundary. */
function capacityFixture(targetCharacters: number): BoardContent {
  const seed = createSeedContent();
  const longText = 'x'.repeat(6_000);
  const content: BoardContent = {
    ...seed,
    sources: Array.from({ length: 150 }, (_, index) => ({ ...seed.sources[0], id: `source_capacity_${index}`, excerpt: longText })),
    nodes: [
      ...Array.from({ length: 15 }, (_, index) => ({ ...seed.nodes[0], id: `claim_capacity_${index}`, title: `Claim ${index}`, body: longText })),
      ...Array.from({ length: 40 }, (_, index) => ({ ...seed.nodes[0], id: `evidence_capacity_${index}`, kind: 'evidence' as const, sourceId: `source_capacity_${index}`, title: `Evidence ${index}`, body: longText })),
    ],
    links: Array.from({ length: 600 }, (_, index) => ({ id: `link_capacity_${index}`, evidenceId: `evidence_capacity_${Math.floor(index / 15)}`, claimId: `claim_capacity_${index % 15}`, stance: 'context', reason: longText, createdBy: 'human' })),
    conflicts: Array.from({ length: 150 }, (_, index) => ({ id: `conflict_capacity_${index}`, title: `Conflict ${index}`, description: longText, nodeIds: ['claim_capacity_0', 'claim_capacity_1'], resolved: false, createdBy: 'human' })),
  };
  let surplus = portableExportSize(content) - targetCharacters;
  for (const source of content.sources) {
    const remove = Math.min(Math.max(0, surplus), source.excerpt.length - 1);
    source.excerpt = source.excerpt.slice(0, source.excerpt.length - remove);
    surplus -= remove;
  }
  for (const conflict of content.conflicts) {
    const remove = Math.min(Math.max(0, surplus), conflict.description.length - 1);
    conflict.description = conflict.description.slice(0, conflict.description.length - remove);
    surplus -= remove;
  }
  if (surplus !== 0) throw new Error('The capacity fixture could not reach the requested size.');
  return content;
}

describe('board content and immutable atomic operations', () => {
  it('seeds a complete, honestly fictional case with the demo evidence unlinked', () => {
    const content = validateContent(createSeedContent());
    expect(getBoardStats(content)).toMatchObject({ claims: 3, evidence: 8, questions: 2, sources: 8, conflicts: 1, unlinkedEvidence: 1 });
    expect(content.sources.every((source) => source.fictional && !source.url)).toBe(true);
    expect(content.links.some((link) => link.evidenceId === 'evidence_turnstile')).toBe(false);
  });

  it('provides cached frozen snapshots and synchronous subscriptions', () => {
    const store = fresh();
    const before = store.getState();
    const snapshots: string[] = [];
    const unsubscribe = store.subscribe(() => snapshots.push(store.getState().query));
    expect(store.getState()).toBe(before);
    store.setQuery('midnight');
    expect(snapshots).toEqual(['midnight']);
    expect(store.getState()).not.toBe(before);
    expect(store.getState().content).toBe(before.content);
    store.setQuery('midnight');
    expect(snapshots).toHaveLength(1);
    expect(() => { store.getState().content.nodes[0].title = 'External mutation'; }).toThrow();
    unsubscribe();
    store.setQuery('staff');
    expect(snapshots).toHaveLength(1);
  });

  it('isolates faulty subscribers without reporting a committed change as failed', () => {
    const store = fresh();
    const healthy = vi.fn();
    store.subscribe(() => { throw new Error('A view failed'); });
    store.subscribe(healthy);
    expect(() => store.applyHumanOperations([humanEdit()], 'Edited the claim')).not.toThrow();
    expect(healthy).toHaveBeenCalledTimes(1);
    expect(store.getState().revision).toBe(2);
  });

  it('creates a new revision without mutating the previous content', () => {
    const store = fresh();
    const before = store.getState();
    store.applyHumanOperations([humanEdit()], 'Edited the claim');
    expect(before.content.nodes[0].title).toBe('Longer hours improve student access');
    expect(store.getState().content.nodes[0].title).toBe('A carefully revised claim');
    expect(store.getState().revision).toBe(before.revision + 1);
    expect(store.getState().undoDepth).toBe(1);
    expect(store.getState().activity[0].actor).toBe('human');
  });

  it('rolls back the whole batch when a later relationship has invalid endpoint types', () => {
    const store = fresh();
    const before = store.getState();
    const invalid: Operation = { type: 'link_evidence', link: { ...challenge.link, evidenceId: 'claim_access' } };
    expectCode(() => store.applyHumanOperations([humanEdit(), invalid], 'Bad batch'), 'VALIDATION_ERROR');
    expect(store.getState()).toBe(before);
  });

  it('requires a real source record for evidence and rejects forged source IDs', () => {
    const content = createSeedContent();
    const evidence: BoardNode = { ...newQuestion(), kind: 'evidence' };
    expectCode(() => applyOperations(content, [{ type: 'create_node', node: evidence }], 'human'), 'VALIDATION_ERROR');
    expectCode(() => applyOperations(content, [{ type: 'create_node', node: { ...evidence, sourceId: 'missing_source' } }], 'human'), 'NOT_FOUND');
    expect(content.nodes).toHaveLength(13);
  });

  it('creates evidence and its source together, with provenance determined by the caller', () => {
    const store = fresh();
    const source = { ...createSeedContent().sources[0], id: 'source_new' };
    const evidence: BoardNode = { ...newQuestion('evidence_new'), kind: 'evidence', sourceId: source.id, createdBy: 'agent' };
    store.applyHumanOperations([{ type: 'create_node', node: evidence, source }], 'Added cited evidence');
    expect(store.getState().content.nodes.find((node) => node.id === evidence.id)?.createdBy).toBe('human');
    expect(store.getState().content.sources.some((entry) => entry.id === source.id)).toBe(true);
    expectCode(() => store.applyHumanOperations([{ type: 'create_node', node: { ...evidence, id: 'evidence_second' }, source }], 'Duplicate source'), 'DUPLICATE_ID');
  });

  it('rejects duplicate node IDs, relationship pairs, and conflict members', () => {
    const content = createSeedContent();
    expectCode(() => applyOperations(content, [{ type: 'create_node', node: content.nodes[0] }], 'human'), 'DUPLICATE_ID');
    expectCode(() => applyOperations(content, [{ type: 'link_evidence', link: { ...content.links[0], id: 'another_link', stance: 'challenges' } }], 'human'), 'DUPLICATE_ID');
    expectCode(() => applyOperations(content, [{ type: 'flag_conflict', conflict: { ...content.conflicts[0], id: 'conflict_new', nodeIds: ['claim_access', 'claim_access'] } }], 'human'), 'DUPLICATE_ID');
  });

  it.each([
    ['blank titles', { type: 'update_node', nodeId: 'claim_access', patch: { title: '   ' } }],
    ['empty patches', { type: 'update_node', nodeId: 'claim_access', patch: {} }],
    ['oversized bodies', { type: 'update_node', nodeId: 'claim_access', patch: { body: 'x'.repeat(6_001) } }],
    ['blank conclusions', { type: 'set_conclusion', conclusion: '' }],
    ['unknown edit fields', { type: 'update_node', nodeId: 'claim_access', patch: { sourceId: 'source_usage' } }],
  ])('rejects %s without changing state', (_label, operation) => {
    const store = fresh();
    const before = store.getState();
    expectCode(() => store.applyHumanOperations([operation as Operation], 'Invalid edit'), 'VALIDATION_ERROR');
    expect(store.getState()).toBe(before);
  });

  it('deletes incident relationships and safely repairs conflicts, then restores them exactly on undo', () => {
    const store = fresh();
    const before = store.getState().content;
    store.selectNode('claim_cost');
    store.applyHumanOperations([{ type: 'delete_node', nodeId: 'claim_cost' }], 'Deleted a claim');
    expect(store.getState().selectedNodeId).toBeNull();
    expect(store.getState().content.links.some((link) => link.claimId === 'claim_cost')).toBe(false);
    expect(store.getState().content.conflicts[0].nodeIds).toEqual(['evidence_staffing', 'evidence_budget']);
    store.undo();
    expect(store.getState().content).toEqual(before);
    expect(store.getState().revision).toBe(3);
  });
});

describe('agent proposals and human review', () => {
  it('keeps proposed changes separate from content, revision, history, and existing briefs', () => {
    const store = fresh();
    const brief = store.generateBrief();
    const before = store.getState();
    const input = proposal([challenge]);
    const pending = store.proposeChangeSet(input);
    expect(store.getState().content).toBe(before.content);
    expect(store.getState().revision).toBe(before.revision);
    expect(store.getState().undoDepth).toBe(0);
    expect(store.getState().brief).toBe(brief);
    expect(pending.status).toBe('pending');
    expect(pending.changes[0].operation).toMatchObject({ link: { createdBy: 'agent' } });
    input.changes[0].title = 'Changed outside the store';
    expect(pending.changes[0].title).toBe('Review change 1');
    expect(() => { pending.title = 'Rewrite'; }).toThrow();
  });

  it('rejects stale initial proposals and duplicate change IDs atomically', () => {
    const store = fresh();
    store.applyHumanOperations([humanEdit()], 'Human edit');
    const before = store.getState();
    expectCode(() => store.proposeChangeSet(proposal([challenge], 1)), 'STALE_REVISION');
    const duplicate = proposal([challenge, { type: 'create_node', node: newQuestion() }], 2);
    duplicate.changes[1].id = duplicate.changes[0].id;
    expectCode(() => store.proposeChangeSet(duplicate), 'DUPLICATE_ID');
    expect(store.getState()).toBe(before);
  });

  it('invalidates pending proposals after a human edit and refuses stale edits or application', () => {
    const store = fresh();
    const pending = store.proposeChangeSet(proposal([challenge]));
    store.applyHumanOperations([humanEdit()], 'Human edit');
    const before = store.getState();
    expect(before.changeSets[0].status).toBe('rejected');
    expect(before.notice).toContain('1 pending proposal was rejected because the board changed');
    expectCode(() => store.editChange(pending.id, pending.changes[0].id, challenge), 'STALE_REVISION');
    expectCode(() => store.applyChangeSet(pending.id), 'STALE_REVISION');
    expect(store.getState()).toBe(before);
  });

  it('selectively accepts a relationship and leaves a deselected conclusion out of content and exports', () => {
    const store = fresh();
    const beforeConclusion = store.getState().content.conclusion;
    const pending = store.proposeChangeSet(proposal([challenge, { type: 'set_conclusion', conclusion: 'UNAPPROVED_CONCLUSION_MARKER' }]));
    store.toggleChange(pending.id, pending.changes[1].id);
    expect(store.applyChangeSet(pending.id)).toEqual({ accepted: 1, rejected: 1 });
    expect(store.getState().content.links.find((link) => link.id === challenge.link.id)?.createdBy).toBe('agent');
    expect(store.getState().content.conclusion).toBe(beforeConclusion);
    expect(store.generateBrief().markdown).not.toContain('UNAPPROVED_CONCLUSION_MARKER');
    expect(store.exportBoard()).not.toContain('UNAPPROVED_CONCLUSION_MARKER');
    expect(store.getState().changeSets[0]).toMatchObject({ status: 'applied', changes: [{ selected: true }, { selected: false }] });
  });

  it('edits a proposal without changing accepted content and applies the edited value', () => {
    const store = fresh();
    const pending = store.proposeChangeSet(proposal([{ type: 'create_node', node: newQuestion() }]));
    const beforeContent = store.getState().content;
    store.editChange(pending.id, pending.changes[0].id, { type: 'create_node', node: { ...newQuestion(), body: 'A human-refined measurement plan.' } });
    expect(store.getState().content).toBe(beforeContent);
    const beforeInvalidEdit = store.getState();
    expectCode(() => store.editChange(pending.id, pending.changes[0].id, { type: 'create_node', node: { ...newQuestion(), kind: 'evidence' } }), 'VALIDATION_ERROR');
    expect(store.getState()).toBe(beforeInvalidEdit);
    store.applyChangeSet(pending.id);
    expect(store.getState().content.nodes.find((node) => node.id === 'question_new')).toMatchObject({ body: 'A human-refined measurement plan.', createdBy: 'agent' });
  });

  it('rejects an empty selection without changing review or content state', () => {
    const store = fresh();
    const pending = store.proposeChangeSet(proposal([challenge]));
    store.toggleChange(pending.id, pending.changes[0].id);
    const before = store.getState();
    expectCode(() => store.applyChangeSet(pending.id), 'EMPTY_SELECTION');
    expect(store.getState()).toBe(before);
  });

  it('rolls back selected operations when a deselected dependency is required', () => {
    const store = fresh();
    const pending = store.proposeChangeSet(proposal([
      humanEdit('Should never partially commit'),
      { type: 'create_node', node: newQuestion() },
      { type: 'flag_conflict', conflict: { id: 'conflict_dependency', title: 'A follow-up is needed', description: 'The new question must be present before it can participate in a conflict.', nodeIds: ['claim_access', 'question_new'], resolved: false, createdBy: 'agent' } },
    ]));
    store.toggleChange(pending.id, pending.changes[1].id);
    const before = store.getState();
    expectCode(() => store.applyChangeSet(pending.id), 'NOT_FOUND');
    expect(store.getState()).toBe(before);
  });

  it('requires a selected source-creating operation before dependent evidence can be accepted', () => {
    const store = fresh();
    const source = { ...createSeedContent().sources[0], id: 'source_proposed' };
    const first: BoardNode = { ...newQuestion('evidence_first'), kind: 'evidence', sourceId: source.id };
    const second: BoardNode = { ...newQuestion('evidence_second'), kind: 'evidence', sourceId: source.id };
    const pending = store.proposeChangeSet(proposal([
      { type: 'create_node', node: first, source },
      { type: 'create_node', node: second },
    ]));
    store.toggleChange(pending.id, pending.changes[0].id);
    const before = store.getState();
    expectCode(() => store.applyChangeSet(pending.id), 'NOT_FOUND');
    expect(store.getState()).toBe(before);
    store.toggleChange(pending.id, pending.changes[0].id);
    expect(store.applyChangeSet(pending.id)).toEqual({ accepted: 2, rejected: 0 });
    expect(store.getState().content.nodes.filter((node) => node.sourceId === source.id)).toHaveLength(2);
    expect(store.getState().content.sources.filter((entry) => entry.id === source.id)).toHaveLength(1);
  });

  it('labels deterministic proposal activity as rehearsal without changing creation provenance', () => {
    const store = fresh();
    const pending = store.proposeChangeSet(proposal([challenge]), 'demo');
    expect(store.getState().activity[0]).toMatchObject({ actor: 'demo', detail: expect.stringContaining('Deterministic rehearsal') });
    store.applyChangeSet(pending.id);
    expect(store.getState().activity[0].actor).toBe('human');
    expect(store.getState().content.links.find((link) => link.id === challenge.link.id)?.createdBy).toBe('agent');
  });

  it('rejects a proposal without mutating accepted content or invalidating the brief', () => {
    const store = fresh();
    const brief = store.generateBrief();
    const pending = store.proposeChangeSet(proposal([challenge]));
    const content = store.getState().content;
    store.rejectChangeSet(pending.id);
    expect(store.getState().content).toBe(content);
    expect(store.getState().revision).toBe(1);
    expect(store.getState().undoDepth).toBe(0);
    expect(store.generateBrief()).toBe(brief);
    expectCode(() => store.applyChangeSet(pending.id), 'INVALID_STATE');
    const after = store.getState();
    store.rejectChangeSet(pending.id);
    expect(store.getState()).toBe(after);
  });

  it('restores exact prior content, records the approval as undone, and never silently reapplies it', () => {
    const store = fresh();
    const before = structuredClone(store.getState().content);
    const pending = store.proposeChangeSet(proposal([challenge, { type: 'create_node', node: newQuestion() }]));
    store.applyChangeSet(pending.id);
    const acceptedBrief = store.generateBrief();
    expect(acceptedBrief.revision).toBe(2);
    store.undo();
    expect(store.getState().content).toEqual(before);
    expect(store.getState().revision).toBe(3);
    expect(store.getState().changeSets[0].status).toBe('undone');
    expect(store.getState().brief).toBeNull();
    expectCode(() => store.applyChangeSet(pending.id), 'INVALID_STATE');
    expect(store.getState().activity[0]).toMatchObject({ actor: 'human', title: 'Undid the last accepted change' });
    const after = store.getState();
    store.undo();
    expect(store.getState()).toBe(after);
  });

  it('invalidates proposals created after a change that is then undone', () => {
    const store = fresh();
    store.applyHumanOperations([humanEdit()], 'Human edit');
    const pending = store.proposeChangeSet(proposal([challenge], 2));
    store.undo();
    expect(store.getState().changeSets[0].status).toBe('rejected');
    expect(store.getState().notice).toContain('1 pending proposal was rejected because the board changed');
    expectCode(() => store.applyChangeSet(pending.id), 'STALE_REVISION');
  });
});

describe('history, persistence, and imports', () => {
  it('rejects oversized mutations and proposals atomically while keeping accepted backups reimportable', () => {
    const original = capacityFixture(LIMITS.importCharacters - 100);
    const store = createBoardStore({ content: original, storage: null });
    store.applyHumanOperations([{ type: 'update_node', nodeId: 'claim_capacity_0', patch: { title: 'A reviewed claim' } }], 'Reviewed a claim');
    const before = store.getState();
    expect(before.undoDepth).toBe(1);
    const operation: Operation = { type: 'set_conclusion', conclusion: 'A'.repeat(6_000) };
    const mutationError = expectCode(() => store.applyHumanOperations([operation], 'Too much content'), 'VALIDATION_ERROR');
    expect(mutationError.message).toContain('portable backup capacity');
    expectCode(() => store.proposeChangeSet(proposal([operation], before.revision)), 'VALIDATION_ERROR');
    expect(store.getState()).toBe(before);
    const exported = store.exportBoard();
    expect(exported.length).toBeLessThanOrEqual(LIMITS.importCharacters);
    const restored = fresh();
    restored.importBoard(exported);
    expect(restored.getState().content).toEqual(before.content);
    store.undo();
    expect(store.getState().content).toEqual(original);
  });

  it('rejects a compact import whose formatted backup would exceed capacity without losing undo history', () => {
    const store = fresh();
    store.applyHumanOperations([humanEdit()], 'Existing accepted edit');
    const before = store.getState();
    const oversized = capacityFixture(LIMITS.importCharacters + 1_000);
    const compact = boardFile(oversized);
    expect(compact.length).toBeLessThan(LIMITS.importCharacters);
    const error = expectCode(() => store.importBoard(compact), 'INVALID_IMPORT');
    expect(error.message).toContain('portable backup capacity');
    expect(store.getState()).toBe(before);
    expect(store.getState().undoDepth).toBe(1);
  });

  it('keeps revision numbers increasing across reset, empty boards, import, and undo', () => {
    const store = fresh();
    const exported = store.exportBoard();
    store.applyHumanOperations([humanEdit()], 'Edit');
    store.resetDemo();
    store.startEmpty('Should we run a smaller pilot?');
    expect(store.getState()).toMatchObject({ revision: 4, content: { nodes: [], sources: [], question: 'Should we run a smaller pilot?' } });
    store.importBoard(exported);
    expect(store.getState().revision).toBe(5);
    expect(store.getState().content.nodes).toHaveLength(13);
    store.undo();
    expect(store.getState().revision).toBe(6);
    expect(store.getState().content.nodes).toHaveLength(0);
  });

  it('bounds undo history and retains the latest reversible changes', () => {
    const store = fresh();
    for (let index = 0; index < LIMITS.history + 3; index += 1) {
      store.applyHumanOperations([humanEdit(`Revision title ${index}`)], 'Edit');
    }
    expect(store.getState().undoDepth).toBe(LIMITS.history);
    for (let index = 0; index < LIMITS.history; index += 1) store.undo();
    expect(store.getState().content.nodes[0].title).toBe('Revision title 2');
    expect(store.getState().undoDepth).toBe(0);
  });

  it('hydrates accepted content, selective review choices, and exact undo history', () => {
    const storage = new MemoryStorage();
    const store = createBoardStore({ storage });
    store.applyHumanOperations([humanEdit()], 'Edited the claim');
    const pending = store.proposeChangeSet(proposal([challenge, { type: 'create_node', node: newQuestion() }], 2));
    store.toggleChange(pending.id, pending.changes[1].id);
    const restored = createBoardStore({ storage });
    expect(restored.getState().content).toEqual(store.getState().content);
    expect(restored.getState().changeSets).toEqual(store.getState().changeSets);
    expect(restored.getState()).toMatchObject({ revision: 2, undoDepth: 1, storageStatus: 'saved' });
    restored.applyChangeSet(pending.id);
    const reloaded = createBoardStore({ storage });
    reloaded.undo();
    expect(reloaded.getState().content).toEqual(store.getState().content);
    expect(reloaded.getState().changeSets[0].status).toBe('undone');
    expect(reloaded.getState().revision).toBe(4);
  });

  it('marks interrupted tool log entries cancelled after reloading', () => {
    const storage = new MemoryStorage();
    const store = createBoardStore({ storage });
    store.recordActivity({ actor: 'agent', title: 'Reading evidence', detail: 'In progress', status: 'running', tool: 'list_evidence' });
    const restored = createBoardStore({ storage });
    expect(restored.getState().activity[0]).toMatchObject({ status: 'cancelled', tool: 'list_evidence' });
    expect(restored.getState().activity[0].detail).toContain('previous tab closed');
  });

  it('continues in memory when writes are blocked and provides a recoverable export', () => {
    const storage = new MemoryStorage();
    vi.spyOn(storage, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
    const store = createBoardStore({ storage });
    expect(store.getState().storageStatus).toBe('error');
    store.proposeChangeSet(proposal([challenge]));
    store.applyHumanOperations([humanEdit()], 'Edit despite blocked storage');
    expect(store.getState()).toMatchObject({ revision: 2, undoDepth: 1, storageStatus: 'error' });
    expect(store.getState().notice).toContain('Export');
    expect(store.getState().notice).toContain('1 pending proposal was rejected because the board changed');
    expect(JSON.parse(store.exportBoard()).content.nodes[0].title).toBe('A carefully revised claim');
    store.undo();
    expect(store.getState().content.nodes[0].title).toBe('Longer hours improve student access');
  });

  it.each(['not JSON', '{"format":"evidence-board-session","version":999}', '{"__proto__":{"polluted":true}}'])('preserves corrupt storage and falls back safely: %s', (corrupt) => {
    const storage = new MemoryStorage();
    storage.setItem(BOARD_STORAGE_KEY, corrupt);
    const store = createBoardStore({ storage });
    expect(store.getState().storageStatus).toBe('error');
    expect(store.getState().content).toEqual(createSeedContent());
    expect(storage.getItem(BOARD_STORAGE_KEY)).toBe(corrupt);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  type SavedSession = {
    content: BoardContent;
    revision: number;
    changeSets: ChangeSet[];
    history: Array<{ content: BoardContent; revision: number }>;
  };

  it.each([
    ['dangling accepted citations', (session: SavedSession) => { session.content.sources = []; }],
    ['future proposal revisions', (session: SavedSession) => { session.changeSets[0].baseRevision = session.revision + 1; }],
    ['invalid undo graph references', (session: SavedSession) => { session.history[0].content.links[0].claimId = 'missing_claim'; }],
    ['nonhistorical undo revisions', (session: SavedSession) => { session.history[0].revision = session.revision; }],
  ])('rejects saved sessions with %s and preserves the unreadable value', (_label, corrupt) => {
    const storage = new MemoryStorage();
    const store = createBoardStore({ storage });
    store.applyHumanOperations([humanEdit()], 'Human edit');
    store.proposeChangeSet(proposal([challenge], 2));
    const session = JSON.parse(storage.getItem(BOARD_STORAGE_KEY)!) as SavedSession;
    corrupt(session);
    const serialized = JSON.stringify(session);
    storage.setItem(BOARD_STORAGE_KEY, serialized);
    const restored = createBoardStore({ storage });
    expect(restored.getState().storageStatus).toBe('error');
    expect(restored.getState().content).toEqual(createSeedContent());
    expect(storage.getItem(BOARD_STORAGE_KEY)).toBe(serialized);
  });

  it('exports only accepted data and ignores an imported revision as a local revision number', () => {
    const store = fresh();
    store.proposeChangeSet(proposal([{ type: 'set_conclusion', conclusion: 'PENDING_EXPORT_MARKER' }]));
    const exported = store.exportBoard();
    expect(exported).not.toContain('PENDING_EXPORT_MARKER');
    const imported = fresh();
    imported.applyHumanOperations([humanEdit()], 'Edit before import');
    imported.importBoard(exported);
    expect(imported.getState().revision).toBe(3);
    expect(imported.getState().changeSets).toEqual([]);
    expect(imported.getState().content).toEqual(store.getState().content);
  });

  it.each([
    ['an executable source URL', (content: BoardContent) => { content.sources[0].url = 'javascript:alert(1)'; }],
    ['a URL with credentials', (content: BoardContent) => { content.sources[0].url = 'https://user:secret@example.com/source'; }],
    ['a missing cited source', (content: BoardContent) => { content.sources = []; }],
    ['an invalid relationship direction', (content: BoardContent) => { content.links[0].evidenceId = 'claim_access'; }],
    ['a duplicate node ID', (content: BoardContent) => { content.nodes.push({ ...content.nodes[0] }); }],
    ['a conflict pointing outside the board', (content: BoardContent) => { content.conflicts[0].nodeIds = ['claim_cost', 'missing']; }],
    ['an impossible date', (content: BoardContent) => { content.sources[0].date = '2026-02-30'; }],
    ['an unknown executable-shaped field', (content: BoardContent) => { (content as BoardContent & { onload?: string }).onload = 'alert(1)'; }],
  ])('atomically rejects imports with %s', (_label, corrupt) => {
    const store = fresh();
    const content = createSeedContent();
    corrupt(content);
    const before = store.getState();
    expectCode(() => store.importBoard(boardFile(content)), 'INVALID_IMPORT');
    expect(store.getState()).toBe(before);
  });

  it('rejects pollution keys, unsupported versions, and oversized JSON before any mutation', () => {
    const store = fresh();
    const before = store.getState();
    const valid = JSON.parse(store.exportBoard());
    expectCode(() => store.importBoard(JSON.stringify({ ...valid, version: 2 })), 'INVALID_IMPORT');
    expectCode(() => store.importBoard(store.exportBoard().replace('"content": {', '"content": {"__proto__":{"polluted":true},')), 'INVALID_IMPORT');
    expectCode(() => store.importBoard(' '.repeat(LIMITS.importCharacters + 1)), 'INVALID_IMPORT');
    expect(store.getState()).toBe(before);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe('decision briefs, selectors, and observable activity', () => {
  it('cites every accepted source, including unlinked evidence, and includes caveats and open questions', () => {
    const content = createSeedContent();
    const brief = generateBrief(content, 7, '2026-08-27T10:00:00.000Z');
    expect(brief.revision).toBe(7);
    expect(brief.sourceIds).toEqual(content.sources.map((source) => source.id));
    for (const [index, source] of content.sources.entries()) {
      expect(brief.markdown).toContain(`[S${index + 1}]`);
      expect(brief.markdown).toContain(source.title);
      expect(brief.markdown).toContain(source.excerpt);
    }
    expect(brief.markdown).toContain('## Working conclusion');
    expect(brief.markdown).toContain('Fictional case material');
    expect(brief.markdown).toContain('## Counterevidence');
    expect(brief.markdown).toContain('Only 8% of entries occur after midnight');
    expect(brief.markdown).toContain('Unresolved: The overnight estimate exceeds the contingency');
    expect(brief.markdown).toContain('What would a 2 a.m. pilot actually cost?');
    expect(brief.markdown).toContain('Who can safely use the extra hours?');
  });

  it('invalidates a cached brief only after accepted content changes', () => {
    const store = fresh();
    const initial = store.generateBrief();
    store.setQuery('night');
    store.setPage('brief');
    expect(store.generateBrief()).toBe(initial);
    const pending = store.proposeChangeSet(proposal([challenge]));
    expect(store.generateBrief()).toBe(initial);
    store.applyChangeSet(pending.id);
    expect(store.getState().brief).toBeNull();
    const updated = store.generateBrief();
    expect(updated.revision).toBe(2);
    expect(updated.markdown).toContain('Challenges “Demand justifies overnight opening”');
    expect(updated).not.toBe(initial);
  });

  it('keeps imported markup inert in exported briefs and preserves safe citation links', () => {
    const content = createSeedContent();
    content.nodes[0].title = '<script>alert(1)</script> [claim](javascript:alert(2))';
    content.sources[0].excerpt = '![tracking](https://example.invalid/pixel) <img src=x onerror=alert(3)>';
    content.sources[0].url = 'https://example.invalid/report_(draft)';
    const brief = generateBrief(validateContent(content), 1);
    expect(brief.markdown).not.toContain('<script>');
    expect(brief.markdown).not.toMatch(/(?<!\\)<img\b/);
    expect(brief.markdown).not.toContain('![tracking]');
    expect(brief.markdown).toContain('\\<script\\>');
    expect(brief.markdown).toContain('[Open source](<https://example.invalid/report_%28draft%29>)');
    expect(escapeMarkdown('### heading\n- list')).toBe('\\#\\#\\# heading\n\\- list');
    expect(escapeMarkdown('Heading\n===\n---\n~~strike~~')).toBe('Heading\n\\===\n\\---\n\\~\\~strike\\~\\~');
  });

  it('keeps map and list filters aligned, including conflicts, gaps, and source-aware search', () => {
    const store = fresh();
    expect(getBoardStats(store.getState().content).gaps).toBe(4);
    store.setFilter('gaps');
    expect(getVisibleNodes(store.getState()).map((node) => node.id)).toEqual(['claim_cost', 'evidence_turnstile', 'question_staffing', 'question_equity']);
    store.setFilter('conflicts');
    expect(getVisibleNodes(store.getState()).map((node) => node.id)).toEqual(['claim_cost', 'evidence_staffing', 'evidence_budget']);
    store.setFilter('evidence');
    store.setQuery('LIBRARY OPERATIONS');
    expect(getVisibleNodes(store.getState()).map((node) => node.id)).toEqual(['evidence_turnstile']);
    store.focusNodes(['claim_access']);
    expect(getVisibleNodes(store.getState())).toHaveLength(13);
    expect(store.getState().revision).toBe(1);
  });

  it('returns incident links, unique neighbours, source details, and conflicts without changing data', () => {
    const content = createSeedContent();
    const relations = getNodeRelations(content, 'evidence_survey');
    expect(relations.links).toHaveLength(2);
    expect(relations.linkedNodes.map((node) => node.id)).toEqual(['claim_access', 'claim_demand']);
    expect(relations.source?.id).toBe('source_survey');
    expect(getNodeRelations(content, 'claim_cost').conflicts).toHaveLength(1);
    expect(getNodeRelations(content, 'missing')).toEqual({ links: [], linkedNodes: [], conflicts: [], source: null });
  });

  it('removes resolved conflicts from counts and filters without removing their record from the brief', () => {
    const store = fresh();
    store.applyHumanOperations([{ type: 'resolve_conflict', conflictId: 'conflict_cost_assumption', resolved: true }], 'Reviewed conflict');
    store.setFilter('conflicts');
    expect(getBoardStats(store.getState().content).conflicts).toBe(0);
    expect(getVisibleNodes(store.getState())).toEqual([]);
    expect(store.generateBrief().markdown).toContain('Resolved: The overnight estimate exceeds the contingency');
  });

  it('bounds activity, safely captures cyclic data, and preserves log provenance on completion', () => {
    const store = fresh();
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    const id = store.recordActivity({ actor: 'agent', title: 'A tool call', detail: 'Reading', status: 'running', tool: 'get_board_summary', input: cyclic });
    const original = store.getState().activity[0];
    expect(original.input).toEqual({ self: '[Circular]' });
    store.updateActivity(id, { status: 'complete', durationMs: 24, output: { revision: 1 } });
    expect(store.getState().activity[0]).toMatchObject({ id, timestamp: original.timestamp, actor: 'agent', status: 'complete', durationMs: 24 });
    expectCode(() => store.updateActivity(id, { actor: 'human' }), 'VALIDATION_ERROR');
    expectCode(() => store.updateActivity(id, { tool: 'apply_approval' }), 'VALIDATION_ERROR');
    expectCode(() => store.updateActivity(id, { tool: undefined }), 'VALIDATION_ERROR');
    for (let index = 0; index < LIMITS.activity; index += 1) {
      store.recordActivity({ actor: 'system', title: `Entry ${index}`, detail: '', status: 'complete' });
    }
    expect(store.getState().activity).toHaveLength(LIMITS.activity);
    expect(() => store.updateActivity(id, { status: 'cancelled' })).not.toThrow();
    expect(store.getState().revision).toBe(1);
  });

  it('records reserved-key payloads as inert text without poisoning a later reload', () => {
    const storage = new MemoryStorage();
    const store = createBoardStore({ storage });
    store.applyHumanOperations([humanEdit()], 'Human edit');
    const payload: unknown = JSON.parse('{"__proto__":{"polluted":true},"nested":{"constructor":"untrusted source text"}}');
    const id = store.recordActivity({ actor: 'agent', title: 'Untrusted tool detail', detail: 'Kept as data', status: 'running', input: payload });
    store.updateActivity(id, { status: 'complete', output: payload });
    expect(store.getState().activity[0].input).toMatchObject({ format: 'json_text', value: JSON.stringify(payload) });
    const restored = createBoardStore({ storage });
    expect(restored.getState()).toMatchObject({ storageStatus: 'saved', revision: 2 });
    expect(restored.getState().content).toEqual(store.getState().content);
    expect(restored.getState().activity[0]).toEqual(store.getState().activity[0]);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });
});

describe('published-research sample workspace', () => {
  it('contains traceable evidence, honest provenance, and useful unresolved work', () => {
    const store = createShowcaseStore();
    const { content, activity, changeSets, undoDepth } = store.getState();
    expect(validateContent(content)).toEqual(content);
    expect(content.nodes.filter(node => node.kind === 'claim')).toHaveLength(6);
    expect(content.nodes.filter(node => node.kind === 'evidence')).toHaveLength(13);
    expect(content.nodes.filter(node => node.kind === 'question')).toHaveLength(4);
    expect(content.sources).toHaveLength(8);
    expect(content.links).toHaveLength(25);
    expect(content.nodes.every(node => node.createdBy === 'sample')).toBe(true);
    expect(content.sources.every(source => source.url?.startsWith('https://') && !source.fictional)).toBe(true);
    expect(content.sources.find(source => source.id === 'source_enterprise_trials')).toMatchObject({ date: '', excerpt: expect.stringContaining('June 2025') });
    expect(activity.every(entry => entry.actor === 'system' && !entry.tool)).toBe(true);
    expect(activity.some(entry => entry.detail.includes('not a recorded browser-agent session'))).toBe(true);
    expect(changeSets).toHaveLength(1);
    expect(changeSets[0]).toMatchObject({ status: 'pending', title: expect.stringContaining('Sample review') });
    expect(changeSets[0].changes).toHaveLength(3);
    expect(undoDepth).toBe(4);
    const findings = checkEvidence(content);
    expect(findings.filter(item => item.category === 'unlinked').map(item => item.nodeIds)).toEqual([['evidence_trust']]);
    expect(findings.filter(item => item.category === 'unsupported').map(item => item.nodeIds)).toEqual([['claim_agents']]);
    expect(findings.filter(item => item.category === 'conflict')).toHaveLength(3);
  });

  it('opens a complete brief after reload without including unapproved suggestions', () => {
    const store = createShowcaseStore();
    const restored = createBoardStore({ session: JSON.parse(store.exportSession()), storage: null });
    restored.setPage('brief');
    const brief = restored.getState().brief!;
    expect(brief.sourceIds).toHaveLength(8);
    expect(brief.markdown).toContain('**Illustrative sample:**');
    expect(brief.markdown).toContain('## Research context');
    expect(brief.markdown).toContain('No pilot results or savings have been collected');
    expect(brief.markdown).toContain('[S8]');
    expect(brief.markdown).not.toContain('Sample expansion gate:');
    expect(brief.markdown).not.toContain('human-authored');
    expect(restored.getState().content).toEqual(store.getState().content);
  });

  it('supports editing, selective approval, persistence, and an exact undo', () => {
    const store = createShowcaseStore();
    const original = store.getState().content;
    const proposal = store.getState().changeSets[0];
    store.editChange(proposal.id, 'sample_change_agents', { type: 'update_node', nodeId: 'claim_agents', patch: { body: 'My edited hypothesis still needs local measurement.' } });
    store.toggleChange(proposal.id, 'sample_change_gate');
    expect(store.applyChangeSet(proposal.id)).toEqual({ accepted: 2, rejected: 1 });
    expect(store.getState().content.nodes.find(node => node.id === 'claim_agents')?.body).toBe('My edited hypothesis still needs local measurement.');
    expect(store.getState().content.links.find(link => link.evidenceId === 'evidence_trust')).toMatchObject({ stance: 'context', createdBy: 'agent' });
    expect(store.getState().content.conclusion).toBe(original.conclusion);
    const reopened = createBoardStore({ session: JSON.parse(store.exportSession()), storage: null });
    reopened.undo();
    expect(reopened.getState().content).toEqual(original);
    expect(reopened.getState().changeSets[0].status).toBe('undone');
    expect(reopened.getState().undoDepth).toBe(4);
  });
});
