import { useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowRight, BookOpen, Check, CircleHelp, Clipboard, Code2, FileText, Flag, History, RefreshCw, Search, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { BoardState, BoardStore, Source } from '../domain/types';
import { copy } from '../i18n/en-CA';
import { copyText, downloadText, errorMessage, formatDate, formatTime, safeSourceUrl } from '../lib/format';
import { EmptyState, ExternalLink, Modal } from './ui';

export function SourcesView({ state, onSource, onAdd }: { state: BoardState; onSource: (source: Source) => void; onAdd: () => void }) {
  const [query, setQuery] = useState('');
  const sources = state.content.sources.filter(source => `${source.title} ${source.publisher} ${source.excerpt}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="sources-view"><div className="page-heading"><div><span className="eyebrow">THE FOUNDATION OF YOUR ARGUMENT</span><h1>Every source. In context.</h1><p>Keep the original material close to the conclusions it informs.</p></div><button className="button primary" onClick={onAdd}><FileText size={16} />Add evidence</button></div>
    <div className="sources-toolbar"><span>{state.content.sources.length} sources in this research</span><label className="search-field"><Search size={16} aria-hidden="true" /><input aria-label="Search sources" placeholder="Find a source…" value={query} onChange={event => setQuery(event.target.value)} /></label></div>
    {!sources.length ? <EmptyState icon={<BookOpen size={30} />} title={query ? 'No matching sources.' : 'Start with the original.'} action={<button className="button secondary" onClick={query ? () => setQuery('') : onAdd}>{query ? 'Clear search' : 'Add your first evidence'}</button>}>{query ? 'Try a source title, publisher, or a phrase from an excerpt.' : 'When you add evidence, its source appears here with its context intact.'}</EmptyState> : <div className="source-grid">{sources.map((source, index) => {
      const uses = state.content.nodes.filter(node => node.sourceId === source.id);
      return <button className="source-card" key={source.id} onClick={() => onSource(source)}><div className={`source-card-art tone-${index % 4}`} aria-hidden="true"><FileText size={36} strokeWidth={1.2} /><span className="document-lines"><i /><i /><i /></span><span className="document-number">{String(index + 1).padStart(2, '0')}</span></div><div className="source-card-body"><span className="source-publisher">{source.publisher}</span><h2>{source.title}</h2><p>{source.excerpt}</p><div className="source-card-footer"><span>{formatDate(source.date)}</span><span>{uses.length} {uses.length === 1 ? 'reference' : 'references'}<ArrowRight size={13} /></span></div>{source.fictional && <span className="fictional-label">Fictional demo source</span>}</div></button>;
    })}</div>}
  </section>;
}

export function SourceDialog({ source, state, store, onClose, onEdit }: { source: Source | null; state: BoardState; store: BoardStore; onClose: () => void; onEdit?: (source: Source) => void }) {
  const url = safeSourceUrl(source?.url);
  return <Modal open={Boolean(source)} onClose={onClose} title={source?.title ?? 'Source details'} subtitle={source ? `${source.publisher} · ${formatDate(source.date)}` : ''} className="source-modal" footer={<>{url ? <ExternalLink href={url}>Open original source</ExternalLink> : <span className="quiet">Original material is included below.</span>}<div className="button-row">{source && onEdit && <button className="button secondary" onClick={() => onEdit(source)}>Edit source</button>}<button className="button primary" onClick={onClose}>Back to research</button></div></>}>
    {source && <><div className="source-provenance"><span><ShieldCheck size={16} />{copy.confidence[source.reliability]} source confidence</span><span>{source.fictional ? 'Fictional demo material' : 'Researcher-provided source'}</span></div>{source.fictional && <p className="inline-note">This source was written for the demo. Its statistics do not describe a real institution.</p>}<span className="eyebrow">SOURCE EXCERPT</span><blockquote className="source-excerpt">{source.excerpt}</blockquote><div className="inspector-section"><h3>Evidence using this source</h3><div className="source-used-by">{state.content.nodes.filter(node => node.sourceId === source.id).map(node => <button key={node.id} onClick={() => { store.setPage('board'); store.selectNode(node.id); store.focusNodes([node.id]); onClose(); }}><FileText size={16} /><span>{node.title}</span><ArrowRight size={15} /></button>)}</div></div></>}
  </Modal>;
}

function inlineMarkdown(text: string): ReactNode[] {
  const literal = (value: string) => value.replace(/\\([\\`*_{}\[\]<>#|!~+.-])/g, '$1');
  return text.split(/((?<!\\)\*\*(?:\\.|[^*])+\*\*|(?<!\\)\[S?\d+\]|\[Open source\]\(<https?:\/\/[^<>]+>\))/g).map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={index}>{literal(part.slice(2, -2))}</strong>;
    if (/^\[S?\d+\]$/.test(part)) return <sup key={index} className="brief-citation">{part}</sup>;
    const sourceLink = part.match(/^\[Open source\]\(<(https?:\/\/[^<>]+)>\)$/);
    if (sourceLink) {
      const href = safeSourceUrl(sourceLink[1]);
      if (href) return <a key={index} href={href} target="_blank" rel="noopener noreferrer">Open source</a>;
    }
    return literal(part);
  });
}

// Render a deliberately small Markdown subset as React text, never as source HTML.
function SafeMarkdown({ markdown }: { markdown: string }) {
  const blocks: ReactNode[] = [];
  const lines = markdown.split('\n');
  let list: string[] = [];
  function flushList(key: number) { if (list.length) { blocks.push(<ul key={`list-${key}`}>{list.map((item, index) => <li key={index}>{inlineMarkdown(item)}</li>)}</ul>); list = []; } }
  lines.forEach((line, index) => {
    if (/^[-*] /.test(line)) { list.push(line.slice(2)); return; }
    flushList(index);
    if (line.startsWith('### ')) blocks.push(<h3 key={index}>{inlineMarkdown(line.slice(4))}</h3>);
    else if (line.startsWith('## ')) blocks.push(<h2 key={index}>{inlineMarkdown(line.slice(3))}</h2>);
    else if (line.startsWith('# ')) blocks.push(<h1 key={index}>{line.slice(2)}</h1>);
    else if (line.startsWith('> ')) blocks.push(<blockquote key={index}>{inlineMarkdown(line.slice(2))}</blockquote>);
    else if (line.trim() && line !== '---') blocks.push(<p key={index}>{inlineMarkdown(line)}</p>);
    else if (line === '---') blocks.push(<hr key={index} />);
  });
  flushList(lines.length);
  return <div className="brief-markdown">{blocks}</div>;
}

export function BriefView({ state, store, onEditConclusion }: { state: BoardState; store: BoardStore; onEditConclusion: () => void }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const stale = state.brief && state.brief.revision !== state.revision;
  async function copyBrief() {
    if (!state.brief) return;
    try { await copyText(state.brief.markdown); setCopied(true); setError(''); window.setTimeout(() => setCopied(false), 2200); }
    catch (err) { setError(errorMessage(err)); }
  }
  function exportBrief() {
    if (!state.brief) return;
    try { downloadText(state.brief.markdown, 'evidence-board-decision-brief.md', 'text/markdown'); store.recordActivity({ actor: 'human', title: 'Exported the decision brief', detail: `Requested a local Markdown download from accepted revision ${state.brief.revision}.`, status: 'complete' }); store.setNotice('Decision brief exported as Markdown.'); }
    catch (err) { setError(errorMessage(err)); }
  }
  const counts = [{ label: 'Claims considered', count: state.content.nodes.filter(node => node.kind === 'claim').length, icon: Flag }, { label: 'Evidence items', count: state.content.nodes.filter(node => node.kind === 'evidence').length, icon: FileText }, { label: 'Open questions', count: state.content.nodes.filter(node => node.kind === 'question').length, icon: CircleHelp }, { label: 'Unresolved conflicts', count: state.content.conflicts.filter(conflict => !conflict.resolved).length, icon: TriangleAlert }];
  return <section className="brief-view"><div className="page-heading"><div><span className="eyebrow">THE RECORD BEHIND THE DECISION</span><h1>An argument you can stand behind.</h1><p>Evidence, counterpoints, and uncertainty. In one considered brief.</p></div><div className="button-row"><button className="button secondary" disabled={!state.brief || Boolean(stale)} onClick={copyBrief}>{copied ? <Check size={16} /> : <Clipboard size={16} />}{copied ? 'Copied' : 'Copy'}</button><button className="button primary" disabled={!state.brief || Boolean(stale)} onClick={exportBrief}><ArrowDownToLine size={16} />Export .md</button></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {stale && <div className="stale-banner" role="status"><TriangleAlert size={18} /><span>Your evidence has changed. Refresh this brief before sharing it.</span><button className="button small secondary" onClick={() => store.generateBrief()}><RefreshCw size={14} />Refresh brief</button></div>}
    {!state.brief ? <EmptyState icon={<FileText size={32} />} title="Bring the argument together." action={<button className="button primary" onClick={() => store.generateBrief()}>Create decision brief<ArrowRight size={16} /></button>}>Generate a cited snapshot of the accepted board. Pending and rejected proposals never enter the brief.</EmptyState> : <div className="brief-layout"><article className="brief-paper"><div className="brief-paper-meta"><span>EVIDENCE BOARD / DECISION MEMO</span><span>REV. {state.brief.revision}</span></div><SafeMarkdown markdown={state.brief.markdown} /><div className="brief-paper-footer"><ShieldCheck size={15} /><span>Generated from the accepted record · <time dateTime={state.brief.generatedAt}>{formatDate(state.brief.generatedAt)}</time></span></div></article><aside className="brief-sidebar"><span className="eyebrow">AT A GLANCE</span>{counts.map(({ label, count, icon: Icon }) => <div className="brief-stat" key={label}><Icon size={16} /><span>{label}</span><strong>{count}</strong></div>)}<div className="brief-assurance"><ShieldCheck size={24} strokeWidth={1.5} /><h3>Only what you accepted.</h3><p>This is a deterministic synthesis of your board, not a fresh AI answer. Every cited source belongs to the accepted record.</p></div><button className="button secondary full-width" onClick={onEditConclusion}>Edit working conclusion</button><button className="button ghost full-width" onClick={() => store.generateBrief()}><RefreshCw size={15} />Regenerate brief</button></aside></div>}
  </section>;
}

export interface ToolInfo { name: string; description: string; title?: string; inputSchema?: unknown; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean } }

export function ActivityView({ state, tools }: { state: BoardState; tools: ToolInfo[] }) {
  const [tab, setTab] = useState<'activity' | 'tools'>('activity');
  return <section className="activity-view"><div className="page-heading"><div><span className="eyebrow">NOTHING HAPPENS BEHIND THE CURTAIN</span><h1>A visible trail of the work.</h1><p>Every operation, its source, and what it changed.</p></div><span className="local-badge"><ShieldCheck size={14} />Saved with your research</span></div><div className="activity-tabs" role="group" aria-label="Activity display"><button aria-pressed={tab === 'activity'} onClick={() => setTab('activity')}><History size={16} />Activity<span>{state.activity.length}</span></button><button aria-pressed={tab === 'tools'} onClick={() => setTab('tools')}><Code2 size={16} />Tool catalogue<span>{tools.length}</span></button></div>
    {tab === 'tools' ? <div className="tool-catalogue"><div className="inline-note"><ShieldCheck size={17} />Write tools prepare proposals. No tool can approve, delete, or reset the accepted board directly.</div>{tools.map(tool => <details className="tool-definition" key={tool.name}><summary><span className={`tool-method ${tool.annotations?.readOnlyHint ? 'read' : 'propose'}`}>{tool.annotations?.readOnlyHint ? 'READ' : 'ACTION'}</span><code>{tool.name}</code><span>{tool.title ?? 'View schema'}</span></summary><p>{tool.description}</p>{tool.annotations?.untrustedContentHint && <p className="small-label">Source content is explicitly marked as untrusted.</p>}<pre>{JSON.stringify(tool.inputSchema, null, 2)}</pre></details>)}</div> : !state.activity.length ? <EmptyState icon={<History size={30} />} title="A clean page." action={<span className="quiet">Your next action will appear here.</span>}>Edits, tool calls, reviews, and exports leave a readable trail as you work.</EmptyState> : <div className="activity-timeline">{state.activity.map(entry => <details key={entry.id} className={`activity-entry ${entry.status}`}><summary><span className="timeline-icon">{entry.status === 'error' ? <TriangleAlert size={16} /> : entry.status === 'complete' ? <Check size={16} /> : <History size={16} />}</span><span className="timeline-main"><strong>{entry.title}</strong><span>{entry.detail}</span></span><span className="timeline-meta"><span className={`actor-badge ${entry.actor}`}>{entry.actor === 'demo' ? 'Demo rehearsal' : entry.actor === 'agent' ? (entry.tool ? 'Browser agent' : 'AI contribution') : entry.actor === 'sample' ? 'Sample' : entry.actor === 'human' ? 'You' : 'System'}</span><time dateTime={entry.timestamp}>{formatTime(entry.timestamp)}</time></span></summary><div className="activity-details"><div className="activity-details-meta"><span>Status: {entry.status}</span>{entry.tool && <code>{entry.tool}</code>}{entry.durationMs !== undefined && <span>{Math.round(entry.durationMs)} ms</span>}</div>{entry.input !== undefined && <><h4>Input</h4><pre>{JSON.stringify(entry.input, null, 2)}</pre></>}{entry.output !== undefined && <><h4>Result</h4><pre>{JSON.stringify(entry.output, null, 2)}</pre></>}</div></details>)}</div>}
  </section>;
}
