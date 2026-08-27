import { useEffect, useId, useState, type FormEvent } from 'react';
import { ArrowDownToLine, ArrowRight, ArrowUpRight, BookOpen, Check, CheckCheck, Clipboard, Code2, FilePlus2, FileText, GitCompareArrows, Keyboard, Monitor, RefreshCw, Search, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import type { BoardNode, BoardState, BoardStore } from '../domain/types';
import { LIMITS } from '../domain/validation';
import { copy } from '../i18n/en-CA';
import { copyText, downloadText, errorMessage } from '../lib/format';
import { ExternalLink, Modal } from './ui';
import type { SaveState } from '../lib/workspace-api';
import { useDeviceStorage } from '../lib/storage-scope';

export interface NativeStatus { checking: boolean; supported: boolean; registered: number; error?: string }

export function SetupDialog({ open, onClose, status, retry }: { open: boolean; onClose: () => void; status: NativeStatus; retry: () => void }) {
  const [copied, setCopied] = useState('');
  const [error, setError] = useState('');
  async function copy(value: string, label: string) {
    try { await copyText(value); setCopied(label); setError(''); window.setTimeout(() => setCopied(''), 2500); }
    catch (err) { setError(errorMessage(err)); }
  }
  return <Modal open={open} onClose={onClose} title="A shared workspace. A real connection." subtitle="WebMCP is the bridge between this board and your browser’s agent." className="setup-modal" footer={<><ExternalLink href="https://developer.chrome.com/docs/ai/webmcp">Official WebMCP setup</ExternalLink><button className="button primary" onClick={onClose}>Continue to the board<ArrowRight size={16} /></button></>}>
    <div className={`native-status-card ${status.registered ? 'ready' : ''}`}><span className="native-status-icon"><Code2 size={24} /></span><div><h3>{status.checking ? 'Checking browser capabilities…' : status.registered ? `${status.registered} native tools registered` : status.error ? 'Tool registration needs attention' : 'The board is ready. Agent tools need WebMCP.'}</h3><p>{status.registered ? 'The page has registered tools with document.modelContext. This confirms tool availability, not that an external agent has connected.' : copyUnsupported()}</p></div></div>
    {status.error && <p className="form-error" role="alert">{status.error}</p>}
    <div className="setup-options"><article><span className="setup-number">01</span><div><h3>Open the board in an agent-enabled browser</h3><p>Use a current browser that exposes document.modelContext. The app targets the native document-based API; support depends on your actual browser build and configuration.</p><div className="copy-code"><code>chrome://flags/#enable-webmcp-testing</code><button className="icon-button" aria-label="Copy Chrome WebMCP flag" onClick={() => copy('chrome://flags/#enable-webmcp-testing', 'flag')}>{copied === 'flag' ? <Check size={16} /> : <Clipboard size={16} />}</button></div><p>Enable the flag, relaunch Chrome, then reopen this page. Availability varies by browser build; older navigator-only implementations are not supported. Public deployments may need an origin-trial token.</p><div className="button-row"><button className="button small secondary" onClick={() => copy(window.location.href, 'url')}>{copied === 'url' ? <Check size={14} /> : <Clipboard size={14} />}{copied === 'url' ? 'URL copied' : 'Copy this page’s URL'}</button><button className="button small ghost" onClick={retry}><RefreshCw size={14} />Check again</button></div></div></article><article><span className="setup-number">02</span><div><h3>Give your agent a question worth asking</h3><blockquote className="prompt-quote">{copyPrompt()}</blockquote><button className="button small secondary" onClick={() => copy(copyPrompt(), 'prompt')}>{copied === 'prompt' ? <Check size={14} /> : <Clipboard size={14} />}{copied === 'prompt' ? 'Prompt copied' : 'Copy suggested prompt'}</button></div></article><article><span className="setup-number">03</span><div><h3>Review before anything becomes evidence</h3><p>Your agent can inspect, connect, and propose. Only you can approve. The review tray shows exactly what is about to change.</p></div></article></div>
    <p className="inline-note"><ShieldCheck size={17} />There is no built-in model pretending to review your work. Manual research and evidence checks work in any browser; optional AI suggestions come from the browser agent you connect.</p>
    {error && <p role="alert" className="form-error">{error}</p>}
  </Modal>;
}
const copyPrompt = () => copy.demoPrompt;
const copyUnsupported = () => copy.unsupported;

export function WelcomeDialog({ open, onClose, onSetup }: { open: boolean; onClose: () => void; onSetup: () => void }) {
  const deviceOnly = useDeviceStorage();
  return <Modal open={open} onClose={onClose} title="Room for a better conclusion." subtitle="An evidence workspace for people who want to know why." className="welcome-modal" footer={<><span className="quiet">{deviceOnly ? 'This editable copy stays in your browser.' : 'Your sources and decisions are saved to your account.'}</span><button className="button primary" onClick={onClose}>Continue your research<ArrowRight size={16} /></button></>}>
    <div className="welcome-illustration" aria-hidden="true"><span className="welcome-node"><FileText size={20} />Evidence</span><i /><span className="welcome-node main"><BookOpen size={24} />A considered decision</span><i /><span className="welcome-node"><CheckCheck size={20} />Your judgement</span></div>
    <div className="welcome-steps"><article><span>01</span><h3>Follow the evidence</h3><p>Claims are ideas to test. Evidence supports or challenges them. Select a card to see the original source.</p></article><article><span>02</span><h3>Invite a second perspective</h3><p>A browser agent works on this same board through WebMCP. Its actions appear in a visible activity trail.</p></article><article><span>03</span><h3>Keep your judgement</h3><p>Review changes one by one, edit the wording, and accept only what belongs. Undo is always close by.</p></article></div>
    <button className="welcome-setup text-button" onClick={() => { onClose(); onSetup(); }}>Set up a real browser agent<ArrowUpRight size={15} /></button>
  </Modal>;
}

export function ConclusionDialog({ open, onClose, state, store }: { open: boolean; onClose: () => void; state: BoardState; store: BoardStore }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const formId = useId();
  useEffect(() => { if (open) { setText(state.content.conclusion); setError(''); } }, [open, state.content.conclusion]);
  function submit(event: FormEvent) {
    event.preventDefault();
    try { store.applyHumanOperations([{ type: 'set_conclusion', conclusion: text.trim() }], 'Updated the working conclusion'); store.generateBrief(); onClose(); }
    catch (err) { setError(errorMessage(err)); }
  }
  return <Modal open={open} onClose={onClose} title="Where does the evidence leave you?" subtitle="This is your working position, not an automatically verified finding." footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" type="submit" form={formId}>Save conclusion<Check size={16} /></button></>}><form id={formId} className="editor-form" onSubmit={submit}><label className="field-label">Current conclusion<textarea required rows={7} maxLength={3000} value={text} onChange={event => setText(event.target.value)} placeholder="Be specific about what the evidence supports, what it challenges, and what remains uncertain." /></label><p className="inline-note"><ShieldCheck size={16} />Your wording is saved with an audit entry. The brief will be refreshed from the accepted evidence.</p>{error && <p className="form-error" role="alert">{error}</p>}</form></Modal>;
}

export function SettingsDialog({ open, onClose, state, store, onBoards, save }: { open: boolean; onClose: () => void; state: BoardState; store: BoardStore; onBoards: () => void; save: SaveState }) {
  const [error, setError] = useState('');
  const deviceOnly = useDeviceStorage();
  const [title, setTitle] = useState(''); const [question, setQuestion] = useState(''); const [description, setDescription] = useState('');
  const formId = useId();
  useEffect(() => { if (open) { setTitle(state.content.title); setQuestion(state.content.question); setDescription(state.content.description); setError(''); } }, [open]);
  function exportFile(full: boolean) {
    try { downloadText(full ? store.exportSession() : store.exportBoard(), full ? 'evidence-board-full-backup.json' : 'evidence-board.json', 'application/json'); store.setNotice(full ? 'Full research backup exported.' : 'Accepted research exported.'); }
    catch (err) { setError(errorMessage(err)); }
  }
  return <Modal open={open} onClose={onClose} title="Your workspace, your record." subtitle={deviceOnly ? 'Research details, device saving, and portable backups.' : 'Research details, account saving, and portable backups.'} footer={<button className="button primary" onClick={onClose}>Done</button>}>
    <form id={formId} className="editor-form research-settings-form" onSubmit={event => { event.preventDefault(); try { store.updateMetadata({ title, question, description }); setError(''); } catch (err) { setError(errorMessage(err)); } }}><label className="field-label">Board title<input required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} /></label><label className="field-label">Research question<textarea required rows={2} maxLength={1000} value={question} onChange={event => setQuestion(event.target.value)} /></label><label className="field-label">Background<textarea rows={3} maxLength={6000} value={description} onChange={event => setDescription(event.target.value)} /></label><div className="button-row"><button type="submit" className="button secondary">Save research details</button><span className="quiet">Changes can be undone.</span></div></form>
    <div className="settings-section"><span className="settings-icon"><ShieldCheck size={22} /></span><div><h3>{deviceOnly ? 'Saved on this device' : 'Saved to your account'}</h3><p>{deviceOnly ? 'This sample, pending proposals, review choices, and undo history stay in this browser profile. They are not synced between devices. Shared profiles can expose edits; clearing browser data removes them. Export a backup to keep a separate copy.' : 'Your boards, sources, pending proposals, and recent undo history are saved privately online. A temporary device draft helps recover unsaved edits after a connection problem. There are no third-party analytics.'}</p><span className="settings-status" role="status">{save.status === 'saved' ? 'Your latest changes are saved' : save.status === 'saving' ? 'Saving your changes…' : 'Some changes have not been saved. Keep a backup.'}</span></div></div>
    <div className="settings-section"><span className="settings-icon"><ArrowDownToLine size={22} /></span><div><h3>Take your research with you</h3><p>A full backup includes pending proposals, review choices, activity, and undo history. The accepted-board export contains only the evidence record. {deviceOnly ? 'Sign in to a private workspace and import a backup there to create a separate account board.' : 'Import either from your workspace to create a separate board.'}</p><div className="button-row"><button className="button small secondary" onClick={() => exportFile(true)}><ArrowDownToLine size={14} />Export full backup</button><button className="button small secondary" onClick={() => exportFile(false)}>Export accepted board</button></div></div></div>
    <div className="settings-section"><span className="settings-icon"><Keyboard size={22} /></span><div><h3>Find your way around</h3><p>The structured list and evidence map show the same research. Motion follows your system preference.</p><dl className="shortcut-list"><div><dt>Search and commands</dt><dd><kbd>Ctrl / ⌘</kbd><kbd>K</kbd></dd></div><div><dt>Focus board search</dt><dd><kbd>/</kbd></dd></div><div><dt>Undo a board edit</dt><dd><kbd>Ctrl / ⌘</kbd><kbd>Z</kbd></dd></div><div><dt>Close a dialog</dt><dd><kbd>Esc</kbd></dd></div></dl><button className="text-button" onClick={() => { store.setView('list'); store.setPage('board'); onClose(); }}>Use the structured list<ArrowRight size={14} /></button></div></div>
    <div className="settings-section"><span className="settings-icon"><FilePlus2 size={22} /></span><div><h3>Keep different questions separate</h3><p>{deviceOnly ? 'Open sample options for a full backup or access to private account boards.' : 'Create, import, or reopen another research board without replacing this one.'}</p><button className="button small secondary" onClick={() => { onClose(); onBoards(); }}>{deviceOnly ? 'Open sample options' : 'Open all research boards'}<ArrowRight size={14} /></button></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </Modal>;
}

export function CommandPalette({ open, onClose, state, store, onAdd, onCheck, onSetup }: { open: boolean; onClose: () => void; state: BoardState; store: BoardStore; onAdd: () => void; onCheck: () => void; onSetup: () => void }) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  useEffect(() => { if (open) { setQuery(''); setIndex(0); } }, [open]);
  const actions = [
    { id: 'add', title: 'Add evidence or a claim', icon: FilePlus2, run: onAdd },
    { id: 'check', title: 'Check the evidence structure', icon: ShieldCheck, run: onCheck },
    { id: 'brief', title: 'Create a decision brief', icon: FileText, run: () => { store.generateBrief(); store.setPage('brief'); } },
    { id: 'review', title: 'Review proposed changes', icon: GitCompareArrows, run: () => store.setReviewOpen(true) },
    { id: 'list', title: 'Switch to structured list', icon: BookOpen, run: () => { store.setPage('board'); store.setView('list'); } },
    { id: 'setup', title: 'Set up WebMCP', icon: Code2, run: onSetup },
  ].filter(action => action.title.toLowerCase().includes(query.toLowerCase()));
  const nodes = query ? state.content.nodes.filter(node => `${node.title} ${node.body}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8) : [];
  const items: Array<{ id: string; title: string; icon: typeof Search; run: () => void; kind?: string }> = [...actions, ...nodes.map((node: BoardNode) => ({ id: node.id, title: node.title, icon: FileText, kind: copy.kind[node.kind], run: () => { store.setPage('board'); store.setFilter('all'); store.setQuery(''); store.selectNode(node.id); store.focusNodes([node.id]); } }))];
  function execute(item: typeof items[number]) { onClose(); item.run(); }
  return <Modal open={open} onClose={onClose} title="Find something. Move the work forward." className="command-modal"><div className="command-search"><Search size={21} /><input aria-label="Search evidence and commands" autoFocus value={query} placeholder="Search evidence or type a command…" onChange={event => { setQuery(event.target.value); setIndex(0); }} onKeyDown={event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setIndex(current => Math.max(0, Math.min(items.length - 1, current + (event.key === 'ArrowDown' ? 1 : -1)))); }
    if (event.key === 'Enter' && items[index]) { event.preventDefault(); execute(items[index]); }
  }} /></div><div className="command-results" aria-label="Search results">{!items.length ? <p className="command-empty">No matches. Try a shorter phrase.</p> : items.map((item, i) => <button key={item.id} className={i === index ? 'highlighted' : ''} onMouseEnter={() => setIndex(i)} onClick={() => execute(item)}><item.icon size={18} /><span>{item.title}</span>{item.kind ? <small>{item.kind}</small> : <ArrowRight size={15} />}</button>)}</div><div className="command-footer"><span><kbd>↑</kbd><kbd>↓</kbd>to move</span><span><kbd>Enter</kbd>to select</span><span><kbd>Esc</kbd>to close</span></div></Modal>;
}
