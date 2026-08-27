import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArrowRight, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Clipboard, FilePlus2, FileText, Flag, FolderOpen, GitCompareArrows, HelpCircle, History, LayoutGrid, List, LoaderCircle, Menu, Network, Plus, Search, Settings2, ShieldCheck, SlidersHorizontal, Sparkles, TriangleAlert, Undo2, X } from 'lucide-react';
import type { BoardFilter, BoardNode, BoardStore, NodeKind, Source, WorkspacePage } from './domain/types';
import { createToolRegistry, registerWebMCP } from './webmcp';
const EvidenceMap = lazy(() => import('./components/EvidenceMap').then(module => ({ default: module.EvidenceMap })));
import { EvidenceList } from './components/EvidenceList';
import { Inspector } from './components/Inspector';
import { NodeEditor, LinkEditor } from './components/NodeEditor';
import { ReviewPanel } from './components/ReviewPanel';
import { ConflictEditor } from './components/ConflictEditor';
import { ActivityView, BriefView, SourcesView, SourceDialog } from './components/ArtifactViews';
import { CommandPalette, ConclusionDialog, SettingsDialog, SetupDialog, WelcomeDialog, type NativeStatus } from './components/WorkspaceDialogs';
import { EvidenceMark, IconButton, Modal } from './components/ui';
import { copy } from './i18n/en-CA';
import { copyText, errorMessage } from './lib/format';
import { EvidenceCheck } from './components/EvidenceCheck';
import { SourceEditor } from './components/SourceEditor';
import type { SaveState } from './lib/workspace-api';
import { useDeviceStorage } from './lib/storage-scope';

function MobileNavigation({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openDialogRef = useRef<HTMLDialogElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const closeDialog = useCallback(() => {
    const dialog = openDialogRef.current;
    if (!dialog) return;
    openDialogRef.current = null;
    const invoker = returnFocusRef.current;
    returnFocusRef.current = null;
    if (dialog.open) dialog.close();
    requestAnimationFrame(() => {
      // A nested settings/editor dialog owns focus until it closes.
      if (document.querySelector('dialog[open]')) return;
      if (window.matchMedia('(max-width: 767px)').matches) {
        if (invoker?.isConnected && invoker.getClientRects().length) invoker.focus({ preventScroll: true });
      } else {
        document.querySelector<HTMLElement>('aside.sidebar .main-nav [aria-current="page"]')?.focus({ preventScroll: true });
      }
    });
  }, []);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) { closeDialog(); return; }
    if (!dialog.open) {
      returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      openDialogRef.current = dialog;
      dialog.scrollTop = 0;
      dialog.querySelector<HTMLElement>('.mobile-navigation-close')?.focus({ preventScroll: true });
    }
  }, [open, closeDialog]);
  useEffect(() => () => closeDialog(), [closeDialog]);

  return <dialog ref={dialogRef} id="mobile-navigation" className={`sidebar mobile-navigation-dialog${open ? ' is-open' : ''}`} aria-label="Workspace navigation"
    onCancel={event => { event.preventDefault(); onClose(); }}
    onKeyDown={event => {
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
      const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      // Native modality makes the page inert; wrap the boundary controls so Tab
      // stays in the navigation instead of reaching browser chrome.
      if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
    }}>
    <div className="mobile-navigation-header"><span>YOUR WORKSPACE</span><IconButton label="Close navigation" className="mobile-navigation-close" onClick={onClose}><X size={19} /></IconButton></div>
    {children}
  </dialog>;
}

export function App({ store: boardStore, save, onBoards, onRetrySave, onSaveCopy, user }: { store: BoardStore; save: SaveState; onBoards: () => void; onRetrySave: () => void; onSaveCopy: () => void; user: string }) {
  const deviceOnly = useDeviceStorage();
  const registry = useMemo(() => createToolRegistry(boardStore), [boardStore]);
  const state = useSyncExternalStore(boardStore.subscribe, boardStore.getState, boardStore.getState);
  const [native, setNative] = useState<NativeStatus>({ checking: true, supported: false, registered: 0 });
  const [registrationVersion, setRegistrationVersion] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [welcomeOpen, setWelcomeOpen] = useState(new URLSearchParams(window.location.search).has('welcome'));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [conclusionOpen, setConclusionOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorNode, setEditorNode] = useState<BoardNode | undefined>();
  const [editorKind, setEditorKind] = useState<NodeKind>('evidence');
  const [linkNode, setLinkNode] = useState<BoardNode | undefined>();
  const [linkOpen, setLinkOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [conflictNode, setConflictNode] = useState<BoardNode | undefined>();
  const [source, setSource] = useState<Source | null>(null);
  const [confirm, setConfirm] = useState<BoardNode | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<Source | null>(null);
  const [actionError, setActionError] = useState('');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(() => window.matchMedia('(max-width: 767px)').matches);
  const [promptCopied, setPromptCopied] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const pending = state.changeSets.filter(set => set.status === 'pending');
  const pendingCount = pending.reduce((total, set) => total + set.changes.length, 0);
  const claims = state.content.nodes.filter(node => node.kind === 'claim').length;
  const evidence = state.content.nodes.filter(node => node.kind === 'evidence').length;
  const questions = state.content.nodes.filter(node => node.kind === 'question').length;
  const conflicts = state.content.conflicts.filter(conflict => !conflict.resolved).length;
  const lastActivity = state.activity[0];

  useEffect(() => {
    let active = true;
    setNative({ checking: true, supported: false, registered: 0 });
    const registration = registerWebMCP(registry);
    void registration.ready.then(() => {
      if (active) setNative({ checking: false, supported: registration.supported, registered: registration.registered, error: registration.error });
    }).catch(error => { if (active) setNative({ checking: false, supported: false, registered: 0, error: errorMessage(error) }); });
    return () => { active = false; registration.dispose(); };
  }, [registrationVersion, registry]);

  useEffect(() => {
    const narrow = window.matchMedia('(max-width: 767px)');
    const adapt = () => {
      setMobileViewport(narrow.matches);
      if (narrow.matches) boardStore.setView('list');
      else setMobileNavOpen(false);
    };
    adapt(); narrow.addEventListener('change', adapt);
    return () => narrow.removeEventListener('change', adapt);
  }, []);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      const dialogOpen = Boolean(document.querySelector('dialog[open]'));
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && !dialogOpen) { event.preventDefault(); setCommandOpen(true); }
      if (event.key === '/' && !editing && !dialogOpen && state.page === 'board') { event.preventDefault(); searchRef.current?.focus(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.shiftKey && !editing && !dialogOpen && state.undoDepth > 0) { event.preventDefault(); boardStore.undo(); }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [state.page, state.undoDepth]);

  useEffect(() => {
    if (!state.notice) return;
    const timer = window.setTimeout(() => boardStore.setNotice(null), 6500);
    return () => window.clearTimeout(timer);
  }, [state.notice]);


  function addNode(kind: NodeKind = 'evidence') { setEditorNode(undefined); setEditorKind(kind); setEditorOpen(true); }
  function navigate(page: WorkspacePage) {
    boardStore.setPage(page); setMobileNavOpen(false);
    if (page === 'brief' && !state.brief) boardStore.generateBrief();
  }
  function check() {
    setCheckOpen(true);
    boardStore.recordActivity({ actor: 'system', title: 'Checked the evidence structure', detail: `Checked recorded support, connections, questions, and source details at revision ${state.revision}. No factual verification or AI analysis was performed.`, status: 'complete' });
  }
  async function copyPrompt() {
    try { await copyText(copy.demoPrompt); setPromptCopied(true); boardStore.setNotice('Prompt copied. Paste it into your browser agent.'); window.setTimeout(() => setPromptCopied(false), 2500); }
    catch (error) { boardStore.setNotice(errorMessage(error)); setSetupOpen(true); }
  }
  function confirmAction() {
    try {
      if (confirm) boardStore.applyHumanOperations([{ type: 'delete_node', nodeId: confirm.id }], `Deleted ${confirm.kind}`);
      setConfirm(null); setActionError('');
    } catch (error) { setActionError(errorMessage(error)); }
  }
  const navItems: Array<{ page: WorkspacePage; title: string; icon: typeof Network; count?: number }> = [
    { page: 'board', title: 'Evidence board', icon: Network },
    { page: 'sources', title: 'Source library', icon: BookOpen, count: state.content.sources.length },
    { page: 'brief', title: 'Decision brief', icon: FileText },
    { page: 'activity', title: 'Activity & tools', icon: History },
  ];
  const filterItems: Array<{ value: BoardFilter; label: string; icon: typeof Network; count: number }> = [
    { value: 'all', label: 'Everything', icon: LayoutGrid, count: state.content.nodes.length },
    { value: 'claim', label: 'Claims', icon: Flag, count: claims },
    { value: 'evidence', label: 'Evidence', icon: FileText, count: evidence },
    { value: 'question', label: 'Open questions', icon: CircleHelp, count: questions },
    { value: 'conflicts', label: 'Contradictions', icon: TriangleAlert, count: conflicts },
  ];

  const navigation = <>
      <button className="brand" onClick={onBoards} aria-label="Evidence Board home"><EvidenceMark /><span>evidence<span>board</span></span></button>
      <button className="workspace-picker" onClick={onBoards} aria-label={deviceOnly ? 'Open sample options' : 'Open your saved research boards'}><span className="workspace-avatar">{user.slice(0, 1).toUpperCase()}</span><span>{deviceOnly ? 'Your browser copy' : 'Your workspace'}<small>{deviceOnly ? 'Sample and backup options' : 'All your research boards'}</small></span><ChevronDown size={14} /></button>
      <button className="sidebar-search" aria-label="Find anything" onClick={() => setCommandOpen(true)}><Search size={16} /><span>Find anything</span><kbd>⌘ K</kbd></button>
      <nav className="main-nav" aria-label="Research views">{navItems.map(({ page, title, icon: Icon, count }) => <button key={page} aria-label={title} className={state.page === page ? 'active' : ''} aria-current={state.page === page ? 'page' : undefined} onClick={() => navigate(page)}><Icon size={18} strokeWidth={1.7} /><span>{title}</span>{count !== undefined && <span className="nav-count">{count}</span>}</button>)}</nav>
      <div className="sidebar-divider" />
      <div className="sidebar-section-label"><span>ON THIS BOARD</span><button aria-label="Add to the board" onClick={() => addNode()}><Plus size={15} /></button></div>
      <nav className="board-filters" aria-label="Filter evidence">{filterItems.map(({ value, label, icon: Icon, count }) => <button key={value} aria-label={`${label}: ${count}`} className={state.page === 'board' && state.filter === value ? 'active' : ''} aria-pressed={state.page === 'board' && state.filter === value} onClick={() => { boardStore.setPage('board'); boardStore.setFilter(value); setMobileNavOpen(false); }}><Icon size={15} /><span>{label}</span><span>{count}</span></button>)}</nav>
      <button className="gap-review-link" onClick={() => { boardStore.setPage('board'); boardStore.setFilter('gaps'); setMobileNavOpen(false); }}><span className="gap-dot" />Look for the gaps<ArrowRight size={14} /></button>
      <div className="sidebar-spacer" />
      <div className="sidebar-note"><span className="note-corner" aria-hidden="true" /><span className="eyebrow">BETTER TOGETHER</span><p>Let your agent<br />challenge your thinking.</p><button onClick={() => setSetupOpen(true)}>Connect with WebMCP<ArrowRight size={14} /></button></div>
      <div className="sidebar-bottom"><button aria-label="A quick introduction" onClick={() => setWelcomeOpen(true)}><HelpCircle size={17} /><span>A quick introduction</span></button><button aria-label="Workspace settings" onClick={() => setSettingsOpen(true)}><Settings2 size={17} /><span>Workspace settings</span></button></div>
      <div className="sidebar-footer"><span className="profile-avatar">Y</span><span>Your research<small>{deviceOnly ? 'On this device only.' : 'Saved to your account.'}</small></span><span className="profile-dot" /></div>
    </>;

  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Skip to research workspace</a>
    {mobileViewport ? <MobileNavigation open={mobileNavOpen} onClose={() => setMobileNavOpen(false)}>{navigation}</MobileNavigation> : <aside className="sidebar" aria-label="Workspace navigation">{navigation}</aside>}

    <header className="topbar"><div className="topbar-path"><IconButton label="Open navigation" className="mobile-menu" aria-haspopup="dialog" aria-expanded={mobileNavOpen} aria-controls={mobileViewport ? 'mobile-navigation' : undefined} onClick={event => { event.currentTarget.focus(); setMobileNavOpen(true); }}><Menu size={20} /></IconButton><FolderOpen size={17} className="folder-icon" /><span className="breadcrumb-muted">Workspace</span><ChevronRight size={14} /><strong>{state.content.title}</strong><span className="demo-case-badge">Research board</span></div><div className="topbar-actions"><button className={`agent-status ${native.registered ? 'ready' : 'manual'}`} onClick={() => setSetupOpen(true)}><span className="status-dot" /><span>{native.checking ? 'Checking WebMCP' : native.registered ? `${native.registered} agent tools ready` : 'Agent setup'}</span><ChevronDown size={13} /></button><span className="topbar-separator" /><button className="button small primary create-brief-top" onClick={() => { boardStore.generateBrief(); navigate('brief'); }}><FileText size={15} />Create brief<ArrowRight size={14} /></button></div></header>

    <main id="main-content" className={`workspace-content page-${state.page}`} tabIndex={-1}>
      {state.page === 'board' ? <div className="board-layout"><section className="board-main" aria-label="Evidence workspace"><div className="workspace-heading"><div className="workspace-eyebrow"><span className="project-symbol"><BookOpen size={14} /></span><span>YOUR RESEARCH / THE EVIDENCE RECORD</span><span className="research-state"><span />In progress</span></div><h1>{state.content.question}</h1><p>{state.content.description || 'Follow the sources. Test the claims. Make room for a better conclusion.'}</p><div className="research-meta"><span className="mini-avatars" aria-hidden="true"><i>Y</i><i><Sparkles size={11} /></i></span><span>Your working record</span><span className="meta-dot">·</span><span>{state.content.sources.length} sources</span><span className="meta-dot">·</span><span className="save-state"><Check size={13} />{save.status === 'saved' ? (deviceOnly ? 'Saved on this device' : 'Saved to your account') : save.status === 'saving' ? 'Saving…' : save.status === 'conflict' ? 'Save conflict — keep a copy' : 'Not saved — retry'}</span><span className="revision-tag">v{state.revision}</span></div></div>
        <div className="board-toolbar"><div className="view-toggle" role="group" aria-label="Workspace view"><button aria-pressed={state.view === 'map'} onClick={() => boardStore.setView('map')}><Network size={15} />Map</button><button aria-pressed={state.view === 'list'} onClick={() => boardStore.setView('list')}><List size={16} />List</button></div><span className="toolbar-divider" /><label className="board-search"><Search size={16} aria-hidden="true" /><input ref={searchRef} aria-label="Search board" placeholder="Search the board…" value={state.query} onChange={event => boardStore.setQuery(event.target.value)} /><kbd>/</kbd>{state.query && <button aria-label="Clear board search" onClick={() => boardStore.setQuery('')}><X size={13} /></button>}</label><label className="filter-control"><SlidersHorizontal size={15} /><select aria-label="Filter board" value={state.filter} onChange={event => boardStore.setFilter(event.target.value as BoardFilter)}><option value="all">All items</option><option value="claim">Claims</option><option value="evidence">Evidence</option><option value="question">Questions</option><option value="conflicts">Conflicts</option><option value="gaps">Gaps</option></select></label><button className="button small secondary add-evidence" aria-label="Add evidence" onClick={() => addNode()}><Plus size={16} /><span>Add evidence</span></button></div>
        <div className="board-content">{!state.content.nodes.length ? <div className="board-start"><span className="eyebrow">BEGIN WITH WHAT YOU KNOW</span><h2>Put your first idea on the board.</h2><p>Add a claim to test, then bring in the sources that support or challenge it.</p><div className="button-row"><button className="button primary" onClick={() => addNode('claim')}><Flag size={16} />Add a claim</button><button className="button secondary" onClick={() => addNode()}><FileText size={16} />Add evidence</button></div><button className="text-button" onClick={() => addNode('question')}>Or start with an open question<ArrowRight size={14} /></button></div> : state.view === 'map' ? <Suspense fallback={<div className="map-loading" role="status"><Network size={25} /><span>Arranging the evidence map…</span></div>}><EvidenceMap state={state} store={boardStore} /></Suspense> : <EvidenceList state={state} store={boardStore} />}</div>
        <div className="board-bottom-note"><span><ShieldCheck size={13} />Your sources. Clear reasoning. Your judgement.</span><button className="text-button" onClick={copyPrompt}>{promptCopied ? <Check size={13} /> : <Clipboard size={13} />}{promptCopied ? 'Prompt copied' : 'Copy agent prompt'}</button></div>
      </section><Inspector state={state} store={boardStore} onEdit={node => { setEditorNode(node); setEditorOpen(true); }} onDelete={node => { setActionError(''); setConfirm(node); }} onLink={node => { setLinkNode(node); setLinkOpen(true); }} onSource={setSource} onConflict={node => { setConflictNode(node); setConflictOpen(true); }} onCheck={check} /></div>
      : state.page === 'sources' ? <SourcesView state={state} onSource={setSource} onAdd={() => addNode()} />
      : state.page === 'brief' ? <BriefView state={state} store={boardStore} onEditConclusion={() => setConclusionOpen(true)} />
      : <ActivityView state={state} tools={registry.tools} />}
    </main>

    <footer className={`activity-bar ${pendingCount ? 'has-proposals' : ''}`}><button className="activity-bar-status" onClick={() => navigate('activity')}><span className="activity-status-icon">{pendingCount ? <GitCompareArrows size={17} /> : <ShieldCheck size={17} />}</span><span><strong>{pendingCount ? `${pendingCount} changes ready for your judgement` : 'Your evidence, kept in context.'}</strong><small>{pendingCount ? 'Nothing enters the evidence record without your approval.' : lastActivity ? lastActivity.title : 'Add your first claim or source to begin.'}</small></span></button><div className="activity-bar-actions">{pendingCount ? <button className="button small primary" onClick={() => boardStore.setReviewOpen(true)}>Review changes<span className="button-count">{pendingCount}</span><ArrowRight size={14} /></button> : <button className="button small secondary evidence-check-button" onClick={check}><ShieldCheck size={14} />Check evidence<ArrowRight size={14} /></button>}<span className="footer-divider" /><button className="undo-control" aria-label="Undo" disabled={!state.undoDepth} onClick={() => boardStore.undo()}><Undo2 size={16} /><span>Undo</span></button></div></footer>
    {(save.status === 'offline' || save.status === 'conflict') && <div className="cloud-save-warning" role="alert"><TriangleAlert size={19} /><div><strong>{save.status === 'conflict' ? 'Your edits need a separate copy.' : 'Your latest edits are not saved yet.'}</strong><p>{save.message || 'This board changed elsewhere. Save a copy to keep your edits.'}{!save.recoveryAvailable && ' Device recovery is also unavailable; export a backup before closing.'}</p><div className="button-row">{save.status !== 'conflict' && <button className="button small secondary" onClick={onRetrySave}>Retry saving</button>}<button className="button small primary" onClick={onSaveCopy}>{deviceOnly ? 'Export a copy' : 'Save a copy'}</button><button className="text-button" onClick={() => setSettingsOpen(true)}>Export backup</button></div></div></div>}

    {state.notice && <div className="toast" role="status"><span><Check size={16} /></span><p>{state.notice}</p><IconButton label="Dismiss notification" onClick={() => boardStore.setNotice(null)}><X size={15} /></IconButton></div>}

    <NodeEditor open={editorOpen} onClose={() => setEditorOpen(false)} state={state} store={boardStore} node={editorNode} defaultKind={editorKind} />
    <LinkEditor open={linkOpen} onClose={() => setLinkOpen(false)} state={state} store={boardStore} node={linkNode} />
    <ConflictEditor open={conflictOpen} onClose={() => setConflictOpen(false)} state={state} store={boardStore} node={conflictNode} />
    <SourceDialog source={source} state={state} store={boardStore} onClose={() => setSource(null)} onEdit={item => { setSource(null); setEditingSource(item); }} />
    <SourceEditor source={editingSource} store={boardStore} onClose={() => setEditingSource(null)} />
    <EvidenceCheck open={checkOpen} onClose={() => setCheckOpen(false)} state={state} store={boardStore} onAdd={() => addNode()} />
    <ReviewPanel state={state} store={boardStore} />
    <SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} status={native} retry={() => setRegistrationVersion(value => value + 1)} />
    <WelcomeDialog open={welcomeOpen} onClose={() => setWelcomeOpen(false)} onSetup={() => setSetupOpen(true)} />
    <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} state={state} store={boardStore} onBoards={onBoards} save={save} />
    <ConclusionDialog open={conclusionOpen} onClose={() => setConclusionOpen(false)} state={state} store={boardStore} />
    <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} state={state} store={boardStore} onAdd={() => addNode()} onCheck={check} onSetup={() => setSetupOpen(true)} />
    <Modal open={Boolean(confirm)} onClose={() => { setConfirm(null); setActionError(''); }} title="Remove this item from the record?" subtitle={confirm?.title} footer={<><button autoFocus className="button secondary" onClick={() => { setConfirm(null); setActionError(''); }}>Keep item</button><button className="button danger" onClick={confirmAction}>Remove item</button></>}>
      <p className="confirm-copy">Its evidence relationships and related conflict references will be removed as well. The original source will be retained.</p>
      <p className="inline-note"><Undo2 size={16} />You can undo this action. Other pending proposals may become out of date.</p>{actionError && <p className="form-error" role="alert">{actionError}</p>}
    </Modal>
  </div>;
}
