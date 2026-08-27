import { createBoardStore } from '../state/boardStore';
import { makeId, parseUntrustedJson } from '../domain/validation';
import type { BoardStore } from '../domain/types';

export interface BoardSummary { id: string; title: string; question: string; nodeCount: number; sourceCount: number; version: number; createdAt: string; updatedAt: string }
export interface WorkspaceData { user: { name: string; email: string }; boards: BoardSummary[]; maxBoards: number }
export interface BoardRecord { board: BoardSummary; session: unknown }
export class WorkspaceError extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } }
export async function workspaceRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, { ...options, credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Evidence-Board': '1', ...options.headers }, signal: options.signal ?? AbortSignal.timeout(30_000) });
  let result;
  try { result = await response.json(); } catch { throw new WorkspaceError('Your workspace did not respond. Check your connection and retry.', response.status); }
  if (!response.ok) throw new WorkspaceError(result.error || 'Your workspace could not complete that action.', response.status, result.code);
  return result as T;
}
export async function createSavedBoard(store: BoardStore): Promise<BoardRecord> {
  const id = makeId('research');
  const session = JSON.parse(store.exportSession());
  const content = store.getState().content;
  const result = await workspaceRequest<{ version: number; updatedAt: string }>('/api/boards', { method: 'POST', body: JSON.stringify({ id, session }) });
  return { board: { id, title: content.title, question: content.question, nodeCount: content.nodes.length, sourceCount: content.sources.length, version: result.version, updatedAt: result.updatedAt, createdAt: result.updatedAt }, session };
}

export interface SaveState { status: 'saved' | 'saving' | 'offline' | 'conflict'; message: string; updatedAt: string; recoveryAvailable: boolean }
export interface RecoveryDraft { version: number; session: unknown }
const draftKey = (id: string) => `evidence-board.unsaved.v1.${id}`;
export function readRecoveryDraft(id: string): RecoveryDraft | null {
  try {
    const raw = localStorage.getItem(draftKey(id)); if (!raw) return null;
    const draft = parseUntrustedJson(raw, 8_001_000) as RecoveryDraft;
    if (!Number.isSafeInteger(draft.version) || draft.version < 1 || !draft.session) return null;
    createBoardStore({ session: draft.session, storage: null });
    return draft;
  } catch { return null; }
}
export function clearRecoveryDraft(id: string) { try { localStorage.removeItem(draftKey(id)); } catch { /* saving does not depend on device storage */ } }

/** Serial writes plus a separate server version protect accepted and pending work. */
export class BoardSync {
  readonly store: BoardStore;
  private version: number;
  private saved: string;
  private latest: string;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inflight: Promise<void> | null = null;
  private unsubscribe: () => void;
  private disposed = false;
  private state: SaveState;
  constructor(readonly record: BoardRecord, draft?: RecoveryDraft, private request = workspaceRequest) {
    this.store = createBoardStore({ session: draft?.session ?? record.session, storage: null });
    this.version = draft?.version ?? record.board.version;
    this.latest = this.store.exportSession();
    this.saved = draft ? createBoardStore({ session: record.session, storage: null }).exportSession() : this.latest;
    this.state = { status: draft && draft.version !== record.board.version ? 'conflict' : 'saved', message: '', updatedAt: record.board.updatedAt, recoveryAvailable: true };
    let last = this.store.getState();
    this.unsubscribe = this.store.subscribe(() => {
      const next = this.store.getState();
      if (last.content === next.content && last.changeSets === next.changeSets && last.activity === next.activity && last.undoDepth === next.undoDepth) return;
      last = next;
      this.latest = this.store.exportSession();
      this.keepDraft();
      if (this.state.status !== 'conflict') { this.set({ status: 'saving', message: '' }); this.schedule(); }
    });
    if (draft && this.latest !== this.saved && this.state.status !== 'conflict') { this.set({ status: 'saving' }); this.schedule(); }
  }
  getState = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  isDirty = () => this.latest !== this.saved;
  private set(patch: Partial<SaveState>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  private keepDraft() {
    try { localStorage.setItem(draftKey(this.record.board.id), JSON.stringify({ version: this.version, session: JSON.parse(this.latest) })); this.set({ recoveryAvailable: true }); }
    catch { this.set({ recoveryAvailable: false }); }
  }
  private schedule() { clearTimeout(this.timer); this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, 650); }
  flush = async (): Promise<void> => {
    clearTimeout(this.timer);
    if (this.inflight) { await this.inflight; if (this.isDirty()) return this.flush(); return; }
    if (!this.isDirty()) return;
    if (this.state.status === 'conflict') throw new Error('Save a copy of your edits before switching boards.');
    this.inflight = this.save();
    try { await this.inflight; } finally { this.inflight = null; }
  };
  private async save() {
    this.set({ status: 'saving', message: '' });
    while (this.latest !== this.saved && !this.disposed) {
      const snapshot = this.latest;
      try {
        const result = await this.request<{ version: number; updatedAt: string }>(`/api/boards/${this.record.board.id}`, { method: 'PUT', body: JSON.stringify({ version: this.version, session: JSON.parse(snapshot) }) });
        this.version = result.version; this.saved = snapshot;
        this.set({ updatedAt: result.updatedAt });
        if (this.latest === this.saved) clearRecoveryDraft(this.record.board.id); else this.keepDraft();
      } catch (error) {
        this.keepDraft();
        this.set({ status: error instanceof WorkspaceError && error.status === 409 ? 'conflict' : 'offline', message: error instanceof Error ? error.message : 'Check your connection and retry saving.' });
        throw error;
      }
    }
    this.set({ status: 'saved', message: '' });
  }
  dispose() { this.disposed = true; clearTimeout(this.timer); this.unsubscribe(); this.listeners.clear(); }
}
