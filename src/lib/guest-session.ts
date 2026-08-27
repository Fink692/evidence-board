import { createShowcaseStore } from '../data/showcase';
import { createBoardStore } from '../state/boardStore';
import { parseUntrustedJson } from '../domain/validation';
import type { BoardStore } from '../domain/types';
import type { SaveState } from './workspace-api';

export const GUEST_SESSION_KEY = 'evidence-board.public-guest.v1';
type GuestStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export class GuestRecoveryError extends Error {
  constructor(public readonly backup: string) {
    super('This browser has a saved sample that could not be opened. It has not been replaced. Download it before choosing a fresh sample.');
  }
}

/** Device-only persistence. This controller never calls the account API. */
export class GuestSession {
  readonly store: BoardStore;
  private lastSaved: string | null = null;
  private stopStore?: () => void;
  private listeners = new Set<() => void>();
  private state: SaveState = { status: 'saving', message: '', updatedAt: '', recoveryAvailable: false };

  constructor(private readonly storage: GuestStorage | null) {
    try { this.lastSaved = storage?.getItem(GUEST_SESSION_KEY) ?? null; }
    catch { this.storage = null; }
    if (this.lastSaved !== null) {
      try { this.store = createBoardStore({ session: parseUntrustedJson(this.lastSaved, 8_000_000), storage: null }); }
      catch { throw new GuestRecoveryError(this.lastSaved); }
    } else this.store = createShowcaseStore();
  }

  getState = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  private update(state: SaveState) { this.state = state; this.listeners.forEach(listener => listener()); }
  isDirty = () => this.store.exportSession() !== this.lastSaved;

  start = () => {
    if (!this.stopStore) this.stopStore = this.store.subscribe(this.save);
    this.save();
    return this.stop;
  };
  stop = () => { this.stopStore?.(); this.stopStore = undefined; };

  checkOtherTab = () => {
    if (!this.storage || this.state.status === 'conflict') return false;
    try {
      if (this.storage.getItem(GUEST_SESSION_KEY) !== this.lastSaved) {
        this.update({ status: 'conflict', message: 'Another tab changed this browser copy. Automatic saving stopped. Export your edits before reloading; neither version will be silently overwritten.', updatedAt: this.state.updatedAt, recoveryAvailable: false });
        return false;
      }
      return true;
    } catch {
      this.update({ status: 'offline', message: 'This browser cannot read its saved copy. Keep this tab open and export a full backup.', updatedAt: this.state.updatedAt, recoveryAvailable: false });
      return false;
    }
  };

  save = () => {
    if (this.state.status === 'conflict') return;
    if (!this.storage) {
      this.update({ status: 'offline', message: 'Browser storage is unavailable. Your edits remain in this tab; export a full backup before closing.', updatedAt: this.state.updatedAt, recoveryAvailable: false });
      return;
    }
    if (!this.checkOtherTab()) return;
    const serialized = this.store.exportSession();
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      if (new TextEncoder().encode(serialized).byteLength > 8_000_000) throw new Error('Backup too large');
      if (serialized !== this.lastSaved) this.storage.setItem(GUEST_SESSION_KEY, serialized);
      this.lastSaved = serialized;
      if (this.state.status !== 'saved' || this.state.updatedAt === '' || !this.state.recoveryAvailable) {
        this.update({ status: 'saved', message: '', updatedAt: new Date().toISOString(), recoveryAvailable: true });
      }
    } catch {
      this.update({ status: 'offline', message: 'This browser could not save your latest edits. They remain in this tab. Export a full backup before closing or clearing browser data.', updatedAt: this.state.updatedAt, recoveryAvailable: false });
    }
  };
}
