import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ArrowRight, BookOpen, FolderOpen, GitCompareArrows, LoaderCircle, LockKeyhole, Plus, RefreshCw, Trash2, Upload } from 'lucide-react';
import { App } from './App';
import { createBoardStore } from './state/boardStore';
import { createEmptyContent } from './data/seed';
import { parseUntrustedJson } from './domain/validation';
import { EvidenceMark, IconButton, Modal } from './components/ui';
import { BoardSync, clearRecoveryDraft, createSavedBoard, readRecoveryDraft, workspaceRequest, WorkspaceError, type BoardRecord, type BoardSummary, type RecoveryDraft, type WorkspaceData } from './lib/workspace-api';
import { errorMessage, formatDate } from './lib/format';
import './styles/workspace.css';
import './styles/cloud-workspace.css';

function ActiveResearch({ sync, onBoards, onSaveCopy, user }: { sync: BoardSync; onBoards: () => void; onSaveCopy: () => void; user: string }) {
  const save = useSyncExternalStore(sync.subscribe, sync.getState, sync.getState);
  return <App key={sync.record.board.id} store={sync.store} save={save} onBoards={onBoards} onRetrySave={() => void sync.flush().catch(() => {})} onSaveCopy={onSaveCopy} user={user} />;
}

export function Workspace() {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [active, setActive] = useState<BoardSync | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [signedOut, setSignedOut] = useState(false);
  const [question, setQuestion] = useState('');
  const [title, setTitle] = useState('');
  const [context, setContext] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<BoardSummary | null>(null);
  const [recovery, setRecovery] = useState<{ record: BoardRecord; draft: RecoveryDraft } | null>(null);
  const initial = useRef(false);

  function activate(record: BoardRecord, draft?: RecoveryDraft) {
    setActive(new BoardSync(record, draft)); setError(''); setRecovery(null);
    window.history.replaceState(null, '', `/?board=${encodeURIComponent(record.board.id)}`);
  }
  async function refresh() {
    setError(''); setLoading(true);
    try { const data = await workspaceRequest<WorkspaceData>('/api/workspace'); setWorkspace(data); setSignedOut(false); return data; }
    catch (err) { setSignedOut(err instanceof WorkspaceError && err.status === 401); setError(errorMessage(err)); return null; }
    finally { setLoading(false); }
  }
  async function openBoard(id: string) {
    setBusy(true); setError('');
    try {
      const record = await workspaceRequest<BoardRecord>(`/api/boards/${encodeURIComponent(id)}`);
      const draft = readRecoveryDraft(id);
      if (draft && JSON.stringify(draft.session) !== JSON.stringify(record.session)) setRecovery({ record, draft });
      else { clearRecoveryDraft(id); activate(record); }
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    if (initial.current) return; initial.current = true;
    void refresh().then(data => { const id = new URLSearchParams(window.location.search).get('board'); if (data && id) void openBoard(id); });
  }, []);
  useEffect(() => () => active?.dispose(), [active]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (active?.isDirty()) { event.preventDefault(); event.returnValue = ''; } };
    const reconnect = () => { if (active?.getState().status === 'offline') void active.flush().catch(() => {}); };
    window.addEventListener('beforeunload', beforeUnload); window.addEventListener('online', reconnect);
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('online', reconnect); };
  }, [active]);

  async function create() {
    setBusy(true); setError('');
    try {
      const content = createEmptyContent(question.trim());
      content.title = title.trim() || question.trim().slice(0, 160); content.description = context.trim();
      const store = createBoardStore({ content, storage: null });
      store.recordActivity({ actor: 'human', title: 'Started a research board', detail: 'Created a private board for your own question and sources.', status: 'complete' });
      activate(await createSavedBoard(store)); setTitle(''); setQuestion(''); setContext('');
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }
  async function importBoard(file?: File) {
    if (!file) return; setBusy(true); setError('');
    try {
      if (file.size > 8_000_000) throw new Error('Choose an Evidence Board JSON export smaller than 8 MB.');
      const text = await file.text();
      const parsed = parseUntrustedJson(text, 8_000_000) as { format?: string };
      const store = parsed.format === 'evidence-board-session' ? createBoardStore({ session: parsed, storage: null }) : createBoardStore({ content: createEmptyContent(), storage: null });
      if (parsed.format !== 'evidence-board-session') store.importBoard(text);
      activate(await createSavedBoard(store));
    } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function goHome() {
    if (busy) return; setBusy(true); setError('');
    try { await active?.flush(); setActive(null); window.history.replaceState(null, '', '/?workspace=1'); await refresh(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function saveCopy() {
    if (!active || busy) return; setBusy(true); setError('');
    try { const previousId = active.record.board.id; const record = await createSavedBoard(active.store); const latest = active.store.exportSession(); clearRecoveryDraft(previousId); activate(record, latest !== JSON.stringify(record.session) ? { version: record.board.version, session: JSON.parse(latest) } : undefined); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }
  async function deleteBoard() {
    if (!deleting) return; setBusy(true); setError('');
    try { await workspaceRequest(`/api/boards/${deleting.id}`, { method: 'DELETE', headers: { 'If-Match': String(deleting.version) } }); clearRecoveryDraft(deleting.id); setDeleting(null); await refresh(); }
    catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  }

  if (active) return <><ActiveResearch sync={active} onBoards={() => void goHome()} onSaveCopy={() => void saveCopy()} user={workspace?.user.name ?? 'Your account'} />{busy && <div className="workspace-progress" role="status"><LoaderCircle size={16} />Saving your research…</div>}{error && <div className="workspace-operation-error" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}</>;
  return <main className="research-home">
    <header className="research-home-header"><a className="research-brand" href="/"><EvidenceMark /><span>Evidence Board</span></a><span className="private-label"><LockKeyhole size={14} />{workspace ? workspace.user.name : 'Your private research workspace'}{workspace && <a className="signout-link" href="/signout-with-chatgpt?return_to=/">Sign out</a>}</span></header>
    <section className="research-intro"><span className="eyebrow">A CLEARER WAY TO THINK</span><h1>Good decisions start<br />with <em>better questions.</em></h1><p>Bring your sources together. See what supports your thinking, what challenges it, and what you still need to know.</p></section>
    {loading ? <div className="workspace-loading" role="status"><LoaderCircle size={20} />Opening your research workspace…</div> : signedOut ? <section className="sign-in-card"><LockKeyhole size={25} /><h2>A private place for your research.</h2><p>Sign in to save boards, sources, and decisions to your account and return to them on another device.</p><a className="button primary" href="/signin-with-chatgpt?return_to=%2F%3Fworkspace%3D1">Sign in with ChatGPT<ArrowRight size={16} /></a>{['localhost', '127.0.0.1'].includes(location.hostname) && <small>Local preview: sign-in here uses a development account.</small>}</section> : !workspace ? <div className="workspace-load-error" role="alert"><p>{error || 'Your workspace could not be opened.'}</p><button className="button secondary" onClick={() => void refresh()}><RefreshCw size={16} />Try again</button></div> : <>
      {error && <p className="workspace-form-error" role="alert">{error}</p>}
      <form className="new-research-card" onSubmit={event => { event.preventDefault(); void create(); }}>
        <label htmlFor="research-question">What are you trying to understand?</label><textarea id="research-question" required minLength={3} maxLength={1000} placeholder="Should we change how our team works?" value={question} onChange={event => setQuestion(event.target.value)} rows={3} />
        <details className="research-details"><summary>Add a title and background <span>(optional)</span></summary><label className="field-label">Board title<input maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder="Give this research a short name" /></label><label className="field-label">Background<textarea rows={3} maxLength={6000} value={context} onChange={event => setContext(event.target.value)} placeholder="What prompted this question? What constraints matter?" /></label></details>
        <div><span><LockKeyhole size={12} />Saved privately to your account.</span><button className="button primary" disabled={busy || workspace.boards.length >= workspace.maxBoards} type="submit">{busy ? <LoaderCircle size={17} /> : <Plus size={17} />}Create research board<ArrowRight size={17} /></button></div>
      </form>
      <section className="saved-research" aria-label="Your saved research"><header><div><span className="eyebrow">YOUR WORKSPACE</span><h2>{workspace.boards.length ? 'Pick up a thread.' : 'Room for your next good question.'}</h2></div><label className={`button small secondary file-button ${busy ? 'disabled' : ''}`}><Upload size={14} />Import board<input disabled={busy} type="file" accept="application/json,.json" aria-label="Import a research board" onChange={event => { void importBoard(event.target.files?.[0]); event.target.value = ''; }} /></label></header>
        {workspace.boards.length ? <div className="saved-board-grid">{workspace.boards.map(board => <article className="saved-board-card" key={board.id}><button className="saved-board-open" disabled={busy} onClick={() => void openBoard(board.id)}><span className="saved-board-icon"><FolderOpen size={20} /></span><h3>{board.title}</h3><p>{board.question}</p><span className="saved-board-stats">{board.nodeCount} items<span>·</span>{board.sourceCount} sources<ArrowRight size={15} /></span></button><footer><span>Updated {formatDate(board.updatedAt)}</span><IconButton label={`Delete ${board.title}`} disabled={busy} onClick={() => setDeleting(board)}><Trash2 size={14} /></IconButton></footer></article>)}</div> : <div className="no-saved-boards"><BookOpen size={22} /><p>Create a board above, or import an Evidence Board JSON export.<br /><span>Your boards stay separate. Starting something new won’t replace your work.</span></p></div>}
      </section>
    </>}
    <section className="research-principles"><div><BookOpen size={19} /><h2>Keep the original source</h2><p>Separate what a source says from what you think it means.</p></div><div><GitCompareArrows size={19} /><h2>Make the reasoning visible</h2><p>Connect evidence to claims. Keep disagreements in the record.</p></div><div><LockKeyhole size={19} /><h2>You decide what stays</h2><p>Review every browser-agent proposal before it changes your board.</p></div></section>
    <Modal open={Boolean(deleting)} onClose={() => { if (!busy) setDeleting(null); }} title="Delete this research board?" subtitle={deleting?.title} footer={<><button className="button secondary" disabled={busy} onClick={() => setDeleting(null)}>Keep board</button><button className="button danger" disabled={busy} onClick={() => void deleteBoard()}>Delete board</button></>}><p>This permanently removes the board, its sources, proposals, and history from your account. Export a backup from the board first if you want to keep a copy.</p>{error && <p className="form-error" role="alert">{error}</p>}</Modal>
    <Modal open={Boolean(recovery)} onClose={() => setRecovery(null)} title="You have unsaved edits." subtitle="A recovery draft was found on this device. Your saved board has not been replaced." footer={<><button className="button secondary" onClick={() => { if (recovery) { clearRecoveryDraft(recovery.record.board.id); activate(recovery.record); } }}>Open saved version</button><button className="button primary" onClick={() => { if (recovery) activate(recovery.record, recovery.draft); }}>Recover my edits</button></>}><p>{recovery?.draft.version !== recovery?.record.board.version ? 'The saved board has also changed. Recover your edits, then choose “Save a copy” to keep both versions.' : 'Recover your edits to continue saving them, or discard the draft and open the last saved version.'}</p></Modal>
  </main>;
}
