import { useEffect, useState, useSyncExternalStore } from 'react';
import { ArrowRight, ArrowUpRight, BookOpen, Download, GitCompareArrows, Globe2, LockKeyhole, RotateCcw, ShieldCheck } from 'lucide-react';
import { App } from './App';
import { Workspace } from './Workspace';
import { EvidenceMark, Modal } from './components/ui';
import { GuestRecoveryError, GuestSession, GUEST_SESSION_KEY } from './lib/guest-session';
import { StorageScope } from './lib/storage-scope';
import { downloadText, errorMessage } from './lib/format';
import './styles/public-entry.css';

function openGuest() {
  try {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* The in-memory workspace still works. */ }
    const session = new GuestSession(storage);
    // Set the initial mobile view before App can request the lazy map chunk.
    if (window.matchMedia('(max-width: 767px)').matches) session.store.setView('list');
    return { session, error: null };
  } catch (error) { return { session: null, error }; }
}

function GuestResearch({ session }: { session: GuestSession }) {
  const save = useSyncExternalStore(session.subscribe, session.getState, session.getState);
  const [menu, setMenu] = useState(false);
  const [reset, setReset] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => session.start(), [session]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => { if (session.isDirty()) { event.preventDefault(); event.returnValue = ''; } };
    const changed = (event: StorageEvent) => { if (event.key === GUEST_SESSION_KEY || event.key === null) session.checkOtherTab(); };
    const focus = () => session.checkOtherTab();
    window.addEventListener('beforeunload', beforeUnload); window.addEventListener('storage', changed); window.addEventListener('focus', focus);
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('storage', changed); window.removeEventListener('focus', focus); };
  }, [session]);
  const backup = () => { try { downloadText(session.store.exportSession(), 'evidence-board-full-backup.json', 'application/json'); } catch (e) { setError(errorMessage(e)); } };
  const restart = () => { try { localStorage.removeItem(GUEST_SESSION_KEY); window.location.assign('/?guest=1'); } catch (e) { setError(errorMessage(e)); } };
  return <StorageScope.Provider value="device"><div className="guest-shell">
    <div className="guest-topbar"><span><Globe2 size={14} /><strong>Your own editable sample</strong><span className="guest-storage-note">Changes stay in this browser.</span></span><button onClick={() => setMenu(true)}>Sample options<ArrowRight size={13} /></button></div>
    <App store={session.store} save={save} onBoards={() => setMenu(true)} onRetrySave={session.save} onSaveCopy={backup} user="Guest" />
    <Modal open={menu} onClose={() => { setMenu(false); setReset(false); setError(''); }} title="Your own copy. Room to explore." subtitle="Real tools and editable research, with no access to anyone else's boards." footer={<button className="button primary" onClick={() => setMenu(false)}>Back to the evidence<ArrowRight size={15} /></button>}>
      <p className="guest-explanation">This sample is saved in this browser profile, not to an account. It is not synced between devices. Anyone using this browser profile may see it; clearing browser data removes it. Account workspaces use separate private storage.</p>
      <div className="guest-menu-actions"><button className="button secondary" onClick={backup}><Download size={16} />Export full backup</button><a className="button secondary" href="/?workspace=1"><LockKeyhole size={16} />Open private boards</a><a className="button secondary" href="/">About Evidence Board<ArrowUpRight size={15} /></a></div>
      <p className="guest-explanation">The sources are published research; the scenario and prepared suggestions are illustrative. Native WebMCP tools work when your browser supports them. No built-in model or automatic fact checking is running.</p>
      {!reset ? <button className="text-button" onClick={() => setReset(true)}><RotateCcw size={15} />Start a fresh sample</button> : <div className="guest-reset"><p>Replace this browser's sample and its edits? Export a backup first. This will not affect account boards.</p><div className="button-row"><button className="button secondary" onClick={() => setReset(false)}>Keep my edits</button><button className="button danger" onClick={restart}>Replace with fresh sample</button></div></div>}
      {error && <p role="alert" className="form-error">{error}</p>}
    </Modal>
  </div></StorageScope.Provider>;
}

function GuestWorkspace() {
  const [{ session, error }] = useState(openGuest);
  const [resetError, setResetError] = useState('');
  if (session) return <GuestResearch session={session} />;
  return <main className="guest-recovery"><EvidenceMark /><h1>Your saved copy is still here.</h1><p>{errorMessage(error)}</p><div className="button-row">{error instanceof GuestRecoveryError && <button className="button primary" onClick={() => downloadText(error.backup, 'evidence-board-recovery.json', 'application/json')}>Download saved data</button>}<button className="button secondary" onClick={() => { if (!window.confirm('Remove this browser copy and start a fresh sample? Download the saved data first.')) return; try { localStorage.removeItem(GUEST_SESSION_KEY); window.location.reload(); } catch (e) { setResetError(errorMessage(e)); } }}>Discard and start fresh</button><a href="/">Back</a></div>{resetError && <p role="alert">{resetError}</p>}</main>;
}

export function PublicEntry() {
  const query = new URLSearchParams(window.location.search);
  if (query.has('guest')) return <GuestWorkspace />;
  if (query.has('workspace') || query.has('board')) return <Workspace />;
  return <main className="public-home">
    <header className="public-header"><a className="research-brand" href="/"><EvidenceMark /><span>Evidence Board</span></a><a className="public-account" href="/?workspace=1"><LockKeyhole size={15} />Private workspace<ArrowUpRight size={14} /></a></header>
    <section className="public-hero"><span className="eyebrow">RESEARCH YOU CAN REASON WITH</span><h1>Better evidence.<br /><em>Clearer decisions.</em></h1><p>Put your sources, claims, and questions on the same page. Let a browser agent lend a hand. Keep the final judgement yours.</p><div className="public-actions"><a className="button primary" href="/?guest=1">Open editable sample<ArrowRight size={17} /></a><a className="button secondary" href="/?workspace=1">Start your own research<ArrowUpRight size={16} /></a></div><small>No sign-in needed for the sample. Your edits stay in your browser.</small></section>
    <section className="public-example" aria-labelledby="example-title"><div className="public-example-heading"><span className="eyebrow">A REAL QUESTION. DIFFERENT PERSPECTIVES.</span><h2 id="example-title">Should a small software team<br />adopt AI coding tools?</h2><p>One editable research record, built from published evidence. An illustrative decision, with uncertainty left in view.</p></div><div className="public-reasoning"><article><span className="reasoning-kind">THE CLAIM</span><h3>Start with a measured pilot.</h3><p>Investigate the benefits before a blanket rollout. Track accepted delivery, review effort, and quality.</p><span className="reasoning-confidence">Working recommendation · medium confidence</span></article><div className="public-evidence-pair"><article><span className="reasoning-kind supports">SUPPORTS</span><h3>Faster on a bounded task.</h3><p>A controlled Copilot experiment found a 55.8% task-time reduction among completers.</p><small>Peng et al. · one task, older tooling</small></article><article><span className="reasoning-kind challenges">CHALLENGES</span><h3>Slower in familiar repositories.</h3><p>METR's early-2025 study found experienced maintainers took 19% longer with AI.</p><small>METR · specific cohort and tools</small></article></div></div><footer><span>8 published sources</span><span>23 research cards</span><span>3 unresolved tensions</span><a href="/?guest=1">Inspect the reasoning<ArrowRight size={14} /></a></footer></section>
    <section className="public-principles"><article><BookOpen size={23} /><h2>Keep the source in sight.</h2><p>Separate recorded evidence from your interpretation. Follow every citation back to its publication.</p></article><article><GitCompareArrows size={23} /><h2>Review what changes.</h2><p>Ten native WebMCP tools let compatible agents inspect and propose. You decide what enters the record.</p></article><article><ShieldCheck size={23} /><h2>Keep your judgement.</h2><p>Preserve contradictions. Export a cited brief. Undo accepted changes. Evidence checks expose gaps, not verified truth.</p></article></section>
    <footer className="public-footer"><span>Evidence Board · Built for The WebMCP Challenge</span><span>Native tools. Human approval. No built-in model.</span></footer>
  </main>;
}
