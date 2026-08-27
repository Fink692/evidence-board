import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyContent } from '../data/seed';
import { createBoardStore } from '../state/boardStore';
import { BoardSync, WorkspaceError, readRecoveryDraft, type BoardRecord, type workspaceRequest } from './workspace-api';
import { GuestRecoveryError, GuestSession, GUEST_SESSION_KEY } from './guest-session';

const syncs: BoardSync[] = [];
function record(): BoardRecord {
  const store = createBoardStore({ content: createEmptyContent('A real research question?'), storage: null });
  return { board: { id: 'research_test', title: store.getState().content.title, question: store.getState().content.question, nodeCount: 0, sourceCount: 0, version: 1, createdAt: '2026-08-27T00:00:00.000Z', updatedAt: '2026-08-27T00:00:00.000Z' }, session: JSON.parse(store.exportSession()) };
}
function setup(implementation: (...args: unknown[]) => Promise<unknown>, draft?: { version: number; session: unknown }) {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
  const request = vi.fn(implementation); const sync = new BoardSync(record(), draft, request as typeof workspaceRequest); syncs.push(sync); return { sync, request, values };
}
afterEach(() => { syncs.splice(0).forEach(sync => sync.dispose()); vi.unstubAllGlobals(); });
const edit = (sync: BoardSync, title: string) => sync.store.updateMetadata({ title, question: 'A real research question?', description: '' });

describe('account save lifecycle', () => {
  it('does not report saved before acknowledgement and clears recovery only after success', async () => {
    let acknowledge!: (value: unknown) => void;
    const { sync, values, request } = setup(() => new Promise(resolve => { acknowledge = resolve; }));
    edit(sync, 'Actual research');
    expect(sync.getState().status).toBe('saving'); expect(sync.isDirty()).toBe(true); expect(values.size).toBe(1);
    const save = sync.flush(); expect(request).toHaveBeenCalledOnce();
    acknowledge({ version: 2, updatedAt: '2026-08-27T01:00:00.000Z' }); await save;
    expect(sync.getState().status).toBe('saved'); expect(sync.isDirty()).toBe(false); expect(values.size).toBe(0);
  });
  it('serializes edits that arrive during an in-flight save using the acknowledged server version', async () => {
    let acknowledge!: (value: unknown) => void; let call = 0;
    const { sync, request } = setup(() => ++call === 1 ? new Promise(resolve => { acknowledge = resolve; }) : Promise.resolve({ version: 3, updatedAt: '2026-08-27T02:00:00.000Z' }));
    edit(sync, 'First edit'); const saving = sync.flush(); edit(sync, 'Second edit');
    acknowledge({ version: 2, updatedAt: '2026-08-27T01:00:00.000Z' }); await saving;
    expect(request).toHaveBeenCalledTimes(2);
    const second = JSON.parse((request.mock.calls[1][1] as RequestInit).body as string);
    expect(second.version).toBe(2); expect(second.session.content.title).toBe('Second edit'); expect(sync.isDirty()).toBe(false);
  });
  it('keeps a recovery draft after failure and can retry without dropping edits', async () => {
    let call = 0;
    const { sync, values } = setup(() => ++call === 1 ? Promise.reject(new TypeError('Network unavailable')) : Promise.resolve({ version: 2, updatedAt: '2026-08-27T01:00:00.000Z' }));
    edit(sync, 'Offline work'); await expect(sync.flush()).rejects.toThrow();
    expect(sync.getState().status).toBe('offline'); expect(readRecoveryDraft('research_test')).not.toBeNull();
    expect(sync.store.getState().content.title).toBe('Offline work');
    await sync.flush(); expect(sync.getState().status).toBe('saved'); expect(values.size).toBe(0);
  });
  it('stops retrying stale writes and never discards the local content', async () => {
    const { sync, request } = setup(() => Promise.reject(new WorkspaceError('Changed in another tab.', 409, 'SAVE_CONFLICT')));
    edit(sync, 'Keep my version'); await expect(sync.flush()).rejects.toThrow();
    expect(sync.getState().status).toBe('conflict');
    edit(sync, 'Another local edit'); await expect(sync.flush()).rejects.toThrow('Save a copy');
    expect(request).toHaveBeenCalledOnce(); expect(sync.store.getState().content.title).toBe('Another local edit');
  });
  it('saves pending proposals and review choices even without accepted-content edits', async () => {
    const { sync, request } = setup(() => Promise.resolve({ version: 2, updatedAt: '2026-08-27T01:00:00.000Z' }));
    const change = sync.store.proposeChangeSet({ title: 'Consider a conclusion', summary: 'A suggestion for review.', baseRevision: 1, changes: [{ title: 'Working position', rationale: 'The researcher should decide.', operation: { type: 'set_conclusion', conclusion: 'A possible conclusion.' } }] });
    sync.store.toggleChange(change.id, change.changes[0].id); await sync.flush();
    const payload = JSON.parse((request.mock.calls[0][1] as RequestInit).body as string);
    expect(payload.session.revision).toBe(1); expect(payload.session.changeSets[0].changes[0].selected).toBe(false);
  });
  it('does not save transient search, selection, or page state', async () => {
    const { sync, request } = setup(() => Promise.resolve({ version: 2 }));
    sync.store.setQuery('source'); sync.store.setPage('activity'); sync.store.setView('list'); await sync.flush();
    expect(request).not.toHaveBeenCalled(); expect(sync.isDirty()).toBe(false);
  });
});

const guests: GuestSession[] = [];
afterEach(() => guests.splice(0).forEach(guest => guest.stop()));
function guestStorage() {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: vi.fn((key: string, value: string) => { values.set(key, value); }), removeItem: (key: string) => { values.delete(key); } };
  const open = () => { const guest = new GuestSession(storage); guests.push(guest); guest.start(); return guest; };
  return { values, storage, open };
}

describe('device-only guest persistence', () => {
  it('restores edited research instead of reseeding and never calls the account API', () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const { open } = guestStorage();
    const guest = open();
    guest.store.updateMetadata({ title: 'My own pilot question', question: 'What should we measure?', description: 'A visitor edit.' });
    const restored = open();
    expect(restored.store.getState().content.title).toBe('My own pilot question');
    expect(restored.store.getState().content.sources).toEqual(guest.store.getState().content.sources);
    expect(restored.getState().status).toBe('saved');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves selective review, accepted content, and exact Undo across reloads', () => {
    const { open } = guestStorage();
    let guest = open();
    const original = guest.store.getState().content;
    const proposal = guest.store.getState().changeSets[0];
    guest.store.toggleChange(proposal.id, 'sample_change_gate');
    guest.stop(); guest = open();
    expect(guest.store.getState().changeSets[0].changes.find(change => change.id === 'sample_change_gate')?.selected).toBe(false);
    expect(guest.store.applyChangeSet(proposal.id)).toEqual({ accepted: 2, rejected: 1 });
    guest.stop(); guest = open();
    expect(guest.store.getState().content.links.length).toBe(original.links.length + 1);
    guest.store.undo();
    guest.stop(); guest = open();
    expect(guest.store.getState().content).toEqual(original);
    expect(guest.store.getState().changeSets[0].status).toBe('undone');
  });

  it('leaves malformed saved data intact for recovery rather than silently replacing it', () => {
    const { values, storage } = guestStorage();
    values.set(GUEST_SESSION_KEY, '{invalid JSON');
    expect(() => new GuestSession(storage)).toThrow(GuestRecoveryError);
    expect(values.get(GUEST_SESSION_KEY)).toBe('{invalid JSON');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('keeps unsaved edits and the previous stored copy when storage refuses a write', () => {
    const { open, values, storage } = guestStorage();
    const guest = open();
    const previous = values.get(GUEST_SESSION_KEY);
    storage.setItem.mockImplementation(() => { throw new Error('Quota denied'); });
    guest.store.updateMetadata({ title: 'Keep these edits', question: 'Can we preserve work?', description: '' });
    expect(guest.getState().status).toBe('offline');
    expect(guest.getState().recoveryAvailable).toBe(false);
    expect(guest.isDirty()).toBe(true);
    expect(values.get(GUEST_SESSION_KEY)).toBe(previous);
    expect(JSON.parse(guest.store.exportSession()).content.title).toBe('Keep these edits');
  });

  it('does not overwrite a competing tab and keeps both versions available', () => {
    const { open, values } = guestStorage();
    const first = open(); const second = open();
    second.store.updateMetadata({ title: 'Other tab', question: 'Another question?', description: '' });
    first.store.updateMetadata({ title: 'This tab', question: 'Keep both?', description: '' });
    expect(first.getState().status).toBe('conflict');
    expect(JSON.parse(values.get(GUEST_SESSION_KEY)!).content.title).toBe('Other tab');
    expect(first.store.getState().content.title).toBe('This tab');
    first.save();
    expect(JSON.parse(values.get(GUEST_SESSION_KEY)!).content.title).toBe('Other tab');
  });

  it('survives effect teardown/restart and avoids writes for transient navigation', () => {
    const { open, storage } = guestStorage(); const guest = open();
    guest.stop(); guest.start(); storage.setItem.mockClear();
    guest.store.setQuery('source'); guest.store.setView('list'); guest.store.setPage('activity');
    expect(storage.setItem).not.toHaveBeenCalled();
    guest.store.updateMetadata({ title: 'After remount', question: 'Does saving continue?', description: '' });
    expect(storage.setItem).toHaveBeenCalledOnce();
  });

  it('offers in-memory work without reporting saved when browser storage is unavailable', () => {
    const guest = new GuestSession(null); guests.push(guest); guest.start();
    expect(guest.getState().status).toBe('offline');
    expect(guest.getState().recoveryAvailable).toBe(false);
    expect(JSON.parse(guest.store.exportSession()).content.sources.length).toBeGreaterThan(0);
  });
});
