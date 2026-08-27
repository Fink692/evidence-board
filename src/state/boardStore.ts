import { z } from 'zod';
import { createEmptyContent, createSeedContent } from '../data/seed';
import { generateBrief as buildBrief } from '../domain/brief';
import { BOARD_EXPORT_FORMAT, BOARD_SCHEMA_VERSION, serializeBoardExport } from '../domain/serialization';
import type {
  ActivityEntry, Actor, BoardContent, BoardState, BoardStore, ChangeSet, Operation,
} from '../domain/types';
import {
  DomainError, LIMITS, applyOperations, assertUniqueIds, changeSetSchema,
  contentSchema, deepFreeze, idSchema, makeId, operationSchema, parseUntrustedJson,
  parseValidated, proposalInputSchema, revisionSchema, timestampSchema, titleSchema,
  validateContent, withActor, sourceSchema,
} from '../domain/validation';

export const BOARD_STORAGE_KEY = 'evidence-board.workspace.v1';
export { BOARD_SCHEMA_VERSION };
const MAX_PERSISTED_CHARACTERS = 4_500_000;
const STORAGE_WARNING = 'Changes are safe in this tab, but browser storage could not save them. Export your board before closing or reloading.';

const activityInputSchema = z.object({
  actor: z.enum(['human', 'agent', 'sample', 'system', 'demo']),
  title: titleSchema,
  detail: z.string().max(6_000),
  status: z.enum(['running', 'complete', 'error', 'cancelled']),
  tool: z.string().min(1).max(160).optional(),
  durationMs: z.number().finite().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
}).strict();
const activitySchema = activityInputSchema.extend({ id: idSchema, timestamp: timestampSchema });

const undoEntrySchema = z.object({
  content: contentSchema,
  revision: revisionSchema,
  label: titleSchema,
  actor: z.enum(['human', 'agent', 'sample', 'system']),
  changeSetId: idSchema.optional(),
}).strict();
type UndoEntry = z.infer<typeof undoEntrySchema>;

const sessionSchema = z.object({
  format: z.literal('evidence-board-session'),
  version: z.literal(BOARD_SCHEMA_VERSION),
  revision: revisionSchema,
  content: contentSchema,
  changeSets: z.array(changeSetSchema).max(LIMITS.proposals),
  activity: z.array(activitySchema).max(LIMITS.activity),
  history: z.array(undoEntrySchema).max(LIMITS.history),
}).strict();

export const boardExportSchema = z.object({
  format: z.literal(BOARD_EXPORT_FORMAT),
  version: z.literal(BOARD_SCHEMA_VERSION),
  exportedAt: timestampSchema,
  revision: revisionSchema,
  content: contentSchema,
}).strict();

export interface BoardStoreOptions {
  /** An explicit starting board bypasses session hydration. */
  content?: BoardContent;
  /** A complete, validated session from the authenticated workspace service. */
  session?: unknown;
  preserveRunningActivity?: boolean;
  /** Omit for browser localStorage. Pass null for an intentionally ephemeral store. */
  storage?: Storage | null;
}

function sanitizePayload(value: unknown): unknown {
  if (value === undefined) return undefined;
  const seen = new WeakSet<object>();
  try {
    const serialized = JSON.stringify(value, (_key, item: unknown) => {
      if (typeof item === 'bigint') return String(item);
      if (item && typeof item === 'object') {
        if (seen.has(item)) return '[Circular]';
        seen.add(item);
      }
      return item;
    });
    if (serialized === undefined) return null;
    if (serialized.length > 12_000) return { truncated: true, preview: serialized.slice(0, 12_000) };
    try {
      return parseUntrustedJson(serialized);
    } catch {
      // Preserve the audit payload without allowing reserved object keys to
      // make our own persisted session unreadable on the next page load.
      return { format: 'json_text', value: serialized, note: 'Reserved object keys are displayed as inert JSON text.' };
    }
  } catch {
    return '[Unserializable activity detail]';
  }
}

function createActivity(entry: Omit<ActivityEntry, 'id' | 'timestamp'>): ActivityEntry {
  const parsed = parseValidated(activityInputSchema, entry, 'Activity');
  return {
    ...parsed,
    ...(parsed.input === undefined ? {} : { input: sanitizePayload(parsed.input) }),
    ...(parsed.output === undefined ? {} : { output: sanitizePayload(parsed.output) }),
    id: makeId('activity'),
    timestamp: new Date().toISOString(),
  };
}

function sameContent(a: BoardContent, b: BoardContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pruneChangeSets(changeSets: ChangeSet[]): ChangeSet[] {
  const next = [...changeSets];
  while (next.length > LIMITS.proposals) {
    let oldestFinished = -1;
    for (let index = next.length - 1; index >= 0; index -= 1) {
      if (next[index].status !== 'pending') { oldestFinished = index; break; }
    }
    if (oldestFinished < 0) throw new DomainError('INVALID_STATE', 'Review or reject an existing proposal before requesting another.');
    next.splice(oldestFinished, 1);
  }
  return next;
}

export function createBoardStore(options: BoardStoreOptions = {}): BoardStore {
  let storage: Storage | null = null;
  let startupNotice: string | null = null;
  let startupStorageError = false;
  if (options.storage !== undefined) storage = options.storage;
  else {
    try {
      storage = typeof window === 'undefined' ? null : window.localStorage;
    } catch {
      startupStorageError = true;
      startupNotice = 'Browser storage is unavailable. Your board works in memory; export it before closing this tab.';
    }
  }

  let history: UndoEntry[] = [];
  let state: BoardState = {
    content: validateContent(options.content ?? createSeedContent()),
    revision: 1,
    selectedNodeId: null,
    focusedNodeIds: [],
    filter: 'all',
    query: '',
    view: 'map',
    page: 'board',
    changeSets: [],
    reviewOpen: false,
    activity: [],
    brief: null,
    undoDepth: 0,
    notice: startupNotice,
    storageStatus: startupStorageError ? 'error' : storage ? 'saved' : 'memory',
  };

  if (options.session !== undefined || (storage && options.content === undefined)) {
    try {
      const stored = options.session !== undefined ? JSON.stringify(options.session) : storage!.getItem(BOARD_STORAGE_KEY);
      if (stored) {
        const session = parseValidated(sessionSchema, parseUntrustedJson(stored, options.session !== undefined ? 8_000_000 : LIMITS.importCharacters), 'Saved session');
        const content = validateContent(session.content);
        assertUniqueIds(session.changeSets, 'Saved proposals');
        assertUniqueIds(session.activity, 'Saved activity');
        for (const changeSet of session.changeSets) {
          assertUniqueIds(changeSet.changes, 'Proposed changes');
          if (changeSet.baseRevision > session.revision) throw new DomainError('INVALID_STATE', 'A saved proposal refers to a future revision.');
          if (changeSet.status === 'pending' && changeSet.baseRevision === session.revision) {
            applyOperations(content, changeSet.changes.map((change) => change.operation), 'agent');
          }
        }
        let previousHistoryRevision = 0;
        for (const entry of session.history) {
          validateContent(entry.content);
          if (entry.revision >= session.revision || entry.revision <= previousHistoryRevision) {
            throw new DomainError('INVALID_STATE', 'Saved undo history has invalid revision ordering.');
          }
          previousHistoryRevision = entry.revision;
        }
        history = session.history;
        state = {
          ...state,
          content,
          revision: session.revision,
          changeSets: session.changeSets.map((changeSet) => changeSet.status === 'pending' && changeSet.baseRevision !== session.revision
            ? { ...changeSet, status: 'rejected' as const }
            : changeSet),
          activity: session.activity.map((entry) => entry.status === 'running' && !options.preserveRunningActivity
            ? { ...entry, status: 'cancelled' as const, detail: `${entry.detail}\nThe previous tab closed before this operation completed.`.slice(0, 6_000) }
            : entry),
          undoDepth: history.length,
        };
      }
    } catch (error) {
      if (options.session !== undefined) throw error;
      startupStorageError = true;
      state = {
        ...state,
        storageStatus: 'error',
        notice: 'The saved session could not be read safely. The demo is available in memory; import a valid export to recover your board. The unreadable saved value has not been overwritten.',
      };
    }
  }

  const listeners = new Set<() => void>();

  function serializeSession(next: BoardState, undoHistory: UndoEntry[]): string {
    return JSON.stringify({
      format: 'evidence-board-session',
      version: BOARD_SCHEMA_VERSION,
      revision: next.revision,
      content: next.content,
      changeSets: next.changeSets,
      activity: next.activity,
      history: undoHistory,
    });
  }

  function persist(next: BoardState): BoardState {
    const storageError = (): BoardState => ({
      ...next,
      storageStatus: 'error',
      notice: [next.notice?.replace(STORAGE_WARNING, '').trim().slice(0, 1_000), STORAGE_WARNING].filter(Boolean).join(' '),
    });
    if (!storage) return startupStorageError ? storageError() : { ...next, storageStatus: 'memory' };
    try {
      let serialized = serializeSession(next, history);
      // Content and pending proposals are never discarded to satisfy a quota.
      // Older undo snapshots are the first expendable records.
      while (serialized.length > MAX_PERSISTED_CHARACTERS && history.length > 0) {
        history = history.slice(1);
        next = { ...next, undoDepth: history.length };
        serialized = serializeSession(next, history);
      }
      if (serialized.length > MAX_PERSISTED_CHARACTERS) throw new Error('Session exceeds browser storage budget.');
      storage.setItem(BOARD_STORAGE_KEY, serialized);
      startupStorageError = false;
      return { ...next, storageStatus: 'saved' };
    } catch {
      return storageError();
    }
  }

  function publish(next: BoardState, save = false): void {
    if (next === state) return;
    state = deepFreeze(save ? persist(next) : next);
    for (const listener of [...listeners]) {
      // A UI subscriber must not turn a successful domain commit into a reported
      // failure or prevent the remaining subscribers from seeing that commit.
      try { listener(); } catch { /* isolate subscriber failures */ }
    }
  }

  function addActivity(entry: Omit<ActivityEntry, 'id' | 'timestamp'>, previous = state.activity): ActivityEntry[] {
    return [createActivity(entry), ...previous].slice(0, LIMITS.activity);
  }

  function advanceRevision(): number {
    if (state.revision >= Number.MAX_SAFE_INTEGER - 1) {
      throw new DomainError('INVALID_STATE', 'The board revision limit was reached. Export your board and begin a new workspace.');
    }
    return state.revision + 1;
  }

  function pendingChangeSet(setId: string): ChangeSet {
    const changeSet = state.changeSets.find((entry) => entry.id === setId);
    if (!changeSet) throw new DomainError('NOT_FOUND', 'This proposal does not exist.');
    if (changeSet.baseRevision !== state.revision && changeSet.status !== 'applied' && changeSet.status !== 'undone') {
      throw new DomainError('STALE_REVISION', `This proposal was prepared for revision ${changeSet.baseRevision}; the board is now at revision ${state.revision}. Ask for a fresh proposal.`);
    }
    if (changeSet.status !== 'pending') throw new DomainError('INVALID_STATE', `This proposal is ${changeSet.status} and can no longer be edited or applied.`);
    return changeSet;
  }

  function commit(
    content: BoardContent,
    label: string,
    actor: Actor | 'system',
    details: { changeSetId?: string; detail?: string; resetView?: boolean } = {},
  ): void {
    const validated = validateContent(content);
    const safeLabel = parseValidated(titleSchema, label, 'Action label');
    const revision = advanceRevision();
    const staleCount = state.changeSets.filter((entry) => entry.status === 'pending' && entry.id !== details.changeSetId).length;
    const staleNotice = staleCount ? `${staleCount} pending proposal${staleCount === 1 ? ' was' : 's were'} rejected because the board changed. Request a fresh proposal to review the updated evidence.` : '';
    const changeSets = state.changeSets.map((entry): ChangeSet => {
      if (entry.id === details.changeSetId) return { ...entry, status: 'applied' };
      if (entry.status === 'pending') return { ...entry, status: 'rejected' };
      return entry;
    });
    const activity = addActivity({
      actor,
      title: safeLabel,
      status: 'complete',
      detail: `${details.detail ?? `Accepted content updated to revision ${revision}.`} ${staleNotice}`.trim(),
    });
    history = [...history, {
      content: state.content,
      revision: state.revision,
      label: safeLabel,
      actor,
      ...(details.changeSetId ? { changeSetId: details.changeSetId } : {}),
    }].slice(-LIMITS.history);
    const validNodeIds = new Set(validated.nodes.map((node) => node.id));
    publish({
      ...state,
      content: validated,
      revision,
      changeSets,
      activity,
      brief: null,
      undoDepth: history.length,
      selectedNodeId: state.selectedNodeId && validNodeIds.has(state.selectedNodeId) ? state.selectedNodeId : null,
      focusedNodeIds: state.focusedNodeIds.filter((id) => validNodeIds.has(id)),
      notice: `${safeLabel}. Revision ${revision}. ${staleNotice}`.trim(),
      ...(details.resetView ? { selectedNodeId: null, focusedNodeIds: [], filter: 'all' as const, query: '', page: 'board' as const, reviewOpen: false } : {}),
    }, true);
  }

  if (!startupStorageError && storage) state = persist(state);
  state = deepFreeze(state);

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    selectNode(id) {
      if (id !== null && !state.content.nodes.some((node) => node.id === id)) throw new DomainError('NOT_FOUND', 'The selected node does not exist.');
      if (state.selectedNodeId !== id) publish({ ...state, selectedNodeId: id });
    },
    focusNodes(ids) {
      const parsed = parseValidated(z.array(idSchema).max(LIMITS.nodes), ids, 'Focus');
      const unique = [...new Set(parsed)];
      if (unique.some((id) => !state.content.nodes.some((node) => node.id === id))) throw new DomainError('NOT_FOUND', 'One of the nodes to focus does not exist.');
      publish({ ...state, focusedNodeIds: unique, selectedNodeId: unique[0] ?? null, page: 'board', filter: 'all', query: '' });
    },
    setFilter(filter) {
      const value = parseValidated(z.enum(['all', 'claim', 'evidence', 'question', 'conflicts', 'gaps']), filter, 'Filter');
      if (state.filter !== value) publish({ ...state, filter: value });
    },
    setQuery(query) {
      const value = parseValidated(z.string().max(300), query, 'Search');
      if (state.query !== value) publish({ ...state, query: value });
    },
    setView(view) {
      const value = parseValidated(z.enum(['map', 'list']), view, 'View');
      if (state.view !== value) publish({ ...state, view: value });
    },
    setPage(page) {
      const value = parseValidated(z.enum(['board', 'sources', 'brief', 'activity']), page, 'Page');
      if (state.page !== value) publish({ ...state, page: value,
        ...(value === 'brief' && !state.brief ? { brief: buildBrief(state.content, state.revision) } : {}),
      });
    },
    setReviewOpen(open) {
      const value = parseValidated(z.boolean(), open, 'Review state');
      if (state.reviewOpen !== value) publish({ ...state, reviewOpen: value });
    },
    setNotice(notice) {
      const value = parseValidated(z.string().max(1_200).nullable(), notice, 'Notice');
      if (state.notice !== value) publish({ ...state, notice: value });
    },
    applyHumanOperations(operations, label) {
      const content = applyOperations(state.content, operations, 'human');
      if (sameContent(state.content, content)) return;
      commit(content, label, 'human');
    },
    proposeChangeSet(proposal, origin = 'agent') {
      const parsedOrigin = parseValidated(z.enum(['agent', 'demo', 'sample']), origin, 'Proposal origin');
      const activityActor = parsedOrigin === 'sample' ? 'system' : parsedOrigin;
      const provenance = parsedOrigin === 'sample' ? 'Illustrative sample prepared by Codex; not a recorded browser-agent session. ' : parsedOrigin === 'demo' ? 'Deterministic rehearsal. ' : '';
      const parsed = parseValidated(proposalInputSchema, proposal, 'Proposal');
      if (parsed.baseRevision !== state.revision) {
        throw new DomainError('STALE_REVISION', `Expected revision ${state.revision}, received ${parsed.baseRevision}. Read the board again before proposing changes.`);
      }
      const changes = parsed.changes.map((change) => ({
        ...change,
        id: change.id ?? makeId('change'),
        selected: change.selected ?? true,
        operation: withActor(change.operation, 'agent'),
      }));
      assertUniqueIds(changes, 'Proposed changes');
      const preview = applyOperations(state.content, changes.map((change) => change.operation), 'agent');
      if (sameContent(state.content, preview)) throw new DomainError('INVALID_STATE', 'This proposal does not change the board.');
      const changeSet: ChangeSet = {
        id: makeId('proposal'),
        title: parsed.title,
        summary: parsed.summary,
        baseRevision: parsed.baseRevision,
        changes,
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
      const changeSets = pruneChangeSets([changeSet, ...state.changeSets]);
      publish({
        ...state,
        changeSets,
        reviewOpen: true,
        notice: `${changes.length} proposed change${changes.length === 1 ? '' : 's'} ready for your review. Accepted content has not changed.`,
        activity: addActivity({ actor: activityActor, title: 'Proposal ready for review', detail: `${provenance}${parsed.title}: ${parsed.summary}`.slice(0, 6_000), status: 'complete' }),
      }, true);
      return state.changeSets.find((entry) => entry.id === changeSet.id)!;
    },
    toggleChange(setId, changeId) {
      const changeSet = pendingChangeSet(setId);
      if (!changeSet.changes.some((change) => change.id === changeId)) throw new DomainError('NOT_FOUND', 'This proposed change does not exist.');
      publish({ ...state, changeSets: state.changeSets.map((entry) => entry.id === setId
        ? { ...entry, changes: entry.changes.map((change) => change.id === changeId ? { ...change, selected: !change.selected } : change) }
        : entry) }, true);
    },
    editChange(setId, changeId, operation) {
      const changeSet = pendingChangeSet(setId);
      if (!changeSet.changes.some((change) => change.id === changeId)) throw new DomainError('NOT_FOUND', 'This proposed change does not exist.');
      const parsed = withActor(parseValidated(operationSchema, operation, 'Edited operation'), 'agent');
      const changes = changeSet.changes.map((change) => change.id === changeId ? { ...change, operation: parsed } : change);
      applyOperations(state.content, changes.map((change) => change.operation), 'agent');
      publish({
        ...state,
        changeSets: state.changeSets.map((entry) => entry.id === setId ? { ...entry, changes } : entry),
        activity: addActivity({ actor: 'human', title: 'Edited a proposed change', detail: 'The edit is saved in the review tray. Accepted content has not changed.', status: 'complete' }),
      }, true);
    },
    applyChangeSet(setId) {
      const changeSet = pendingChangeSet(setId);
      const selected = changeSet.changes.filter((change) => change.selected);
      if (!selected.length) throw new DomainError('EMPTY_SELECTION', 'Select at least one proposed change to apply, or reject the proposal.');
      const content = applyOperations(state.content, selected.map((change) => change.operation), 'agent');
      if (sameContent(state.content, content)) throw new DomainError('INVALID_STATE', 'The selected operations do not change the board.');
      const accepted = selected.length;
      const rejected = changeSet.changes.length - accepted;
      commit(content, `Approved ${accepted} proposed change${accepted === 1 ? '' : 's'}`, 'human', {
        changeSetId: setId,
        detail: `Human approval of “${changeSet.title}”. ${accepted} operation${accepted === 1 ? '' : 's'} accepted; ${rejected} not accepted. New records retain agent creation provenance.`,
      });
      return { accepted, rejected };
    },
    rejectChangeSet(setId) {
      const changeSet = state.changeSets.find((entry) => entry.id === setId);
      if (!changeSet) throw new DomainError('NOT_FOUND', 'This proposal does not exist.');
      if (changeSet.status === 'rejected') return;
      if (changeSet.status !== 'pending') throw new DomainError('INVALID_STATE', 'An approved or undone proposal cannot be rejected. Use Undo to reverse an approval.');
      publish({
        ...state,
        changeSets: state.changeSets.map((entry) => entry.id === setId ? { ...entry, status: 'rejected' } : entry),
        notice: 'Proposal rejected. Accepted board content is unchanged.',
        activity: addActivity({ actor: 'human', title: 'Proposal rejected', detail: `“${changeSet.title}” was rejected in full. No accepted content changed.`, status: 'complete' }),
      }, true);
    },
    undo() {
      const previous = history.at(-1);
      if (!previous) return;
      const revision = advanceRevision();
      const content = validateContent(previous.content);
      const validNodeIds = new Set(content.nodes.map((node) => node.id));
      const staleCount = state.changeSets.filter((entry) => entry.status === 'pending').length;
      const changeSets = state.changeSets.map((entry): ChangeSet => {
        if (entry.id === previous.changeSetId && entry.status === 'applied') return { ...entry, status: 'undone' };
        if (entry.status === 'pending') return { ...entry, status: 'rejected' };
        return entry;
      });
      const activity = addActivity({
        actor: 'human',
        title: 'Undid the last accepted change',
        detail: `Reversed “${previous.label}” and restored exactly the content from revision ${previous.revision}. The current revision is ${revision}. Pending proposals were invalidated; an undone approval must be proposed again before applying.`,
        status: 'complete',
      });
      history = history.slice(0, -1);
      publish({
        ...state,
        content,
        revision,
        changeSets,
        activity,
        brief: null,
        undoDepth: history.length,
        selectedNodeId: state.selectedNodeId && validNodeIds.has(state.selectedNodeId) ? state.selectedNodeId : null,
        focusedNodeIds: state.focusedNodeIds.filter((id) => validNodeIds.has(id)),
        notice: `Undone. Previous content restored at revision ${revision}.${staleCount ? ` ${staleCount} pending proposal${staleCount === 1 ? ' was' : 's were'} rejected because the board changed. Request a fresh proposal to review the restored evidence.` : ''}`,
      }, true);
    },
    generateBrief() {
      if (state.brief?.revision === state.revision) return state.brief;
      const brief = buildBrief(state.content, state.revision);
      publish({ ...state, brief });
      return state.brief!;
    },
    recordActivity(entry) {
      const activity = createActivity(entry);
      publish({ ...state, activity: [activity, ...state.activity].slice(0, LIMITS.activity) }, true);
      return activity.id;
    },
    updateActivity(id, patch) {
      const previous = state.activity.find((entry) => entry.id === id);
      // A bounded log can evict a long-running event before its completion.
      if (!previous) return;
      if ((patch.id !== undefined && patch.id !== id)
        || (patch.timestamp !== undefined && patch.timestamp !== previous.timestamp)
        || (patch.actor !== undefined && patch.actor !== previous.actor)
        || ('tool' in patch && patch.tool !== previous.tool)) {
        throw new DomainError('VALIDATION_ERROR', 'Activity identity, time, actor, and tool cannot be rewritten.');
      }
      const merged = parseValidated(activitySchema, { ...previous, ...patch }, 'Updated activity');
      const updated: ActivityEntry = {
        ...merged,
        ...(merged.input === undefined ? {} : { input: sanitizePayload(merged.input) }),
        ...(merged.output === undefined ? {} : { output: sanitizePayload(merged.output) }),
      };
      publish({ ...state, activity: state.activity.map((entry) => entry.id === id ? updated : entry) }, true);
    },
    resetDemo() {
      commit(createSeedContent(), 'Reset the fictional library case', 'human', { resetView: true });
    },
    startEmpty(question) {
      const content = validateContent(createEmptyContent(question));
      commit(content, 'Started an empty evidence board', 'human', { resetView: true });
    },
    exportBoard() {
      return serializeBoardExport(state.content, state.revision);
    },
    exportSession() {
      return serializeSession(state, history);
    },
    updateMetadata(patch) {
      const parsed = parseValidated(contentSchema.pick({ title: true, question: true, description: true }), patch, 'Research details');
      commit({ ...state.content, ...parsed }, 'Updated research details', 'human');
    },
    updateSource(input) {
      const source = parseValidated(sourceSchema, input, 'Source');
      const previous = state.content.sources.find(item => item.id === source.id);
      if (!previous) throw new DomainError('NOT_FOUND', 'This source no longer exists.');
      if (source.fictional !== previous.fictional) throw new DomainError('VALIDATION_ERROR', 'Source provenance cannot be rewritten.');
      commit({ ...state.content, sources: state.content.sources.map(item => item.id === source.id ? source : item) }, 'Updated source details', 'human');
    },
    importBoard(json) {
      let content: BoardContent;
      try {
        const imported = parseValidated(boardExportSchema, parseUntrustedJson(json), 'Board export');
        content = validateContent(imported.content);
      } catch (error) {
        throw new DomainError('INVALID_IMPORT', error instanceof Error ? error.message : 'This file is not a valid board export.');
      }
      commit(content, 'Imported an evidence board', 'human', { resetView: true, detail: 'Imported accepted content after validating its schema, sources, and relationships. Import does not carry pending proposals or execute instructions in text.' });
    },
  };
}
