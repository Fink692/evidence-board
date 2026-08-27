import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDownRight, ArrowRight, BookOpen, Check, CircleHelp, FileText, Flag, Link2, Link2Off, Pencil, ShieldCheck, Sparkles, Trash2, TriangleAlert, X } from 'lucide-react';
import type { BoardNode, BoardState, BoardStore, Source } from '../domain/types';
import { copy } from '../i18n/en-CA';
import { formatDate } from '../lib/format';
import { IconButton, StanceTag } from './ui';

export function Inspector({ state, store, onEdit, onDelete, onLink, onConflict, onSource, onCheck }: { state: BoardState; store: BoardStore; onEdit: (node: BoardNode) => void; onDelete: (node: BoardNode) => void; onLink: (node: BoardNode) => void; onConflict: (node: BoardNode) => void; onSource: (source: Source) => void; onCheck: () => void }) {
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 899px)').matches);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openDialogRef = useRef<HTMLDialogElement | null>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const lastDialogNode = useRef<string | null>(null);
  const titleId = useId();
  const node = state.content.nodes.find(item => item.id === state.selectedNodeId);

  useEffect(() => {
    const query = window.matchMedia('(max-width: 899px)');
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const closeDrawer = useCallback(() => {
    const dialog = openDialogRef.current;
    if (!dialog) return;
    openDialogRef.current = null;
    lastDialogNode.current = null;
    const invoker = returnFocusRef.current;
    returnFocusRef.current = null;
    if (dialog.open) dialog.close();
    // Native close normally restores focus. Also cover an invoker removed by an edit,
    // a responsive layout change, or a dialog that was unmounted by navigation.
    requestAnimationFrame(() => {
      if (document.querySelector('dialog[open]')) return;
      const target = invoker?.isConnected ? invoker
        : document.querySelector<HTMLElement>('[aria-label="Workspace view"] button[aria-pressed="true"]');
      target?.focus({ preventScroll: true });
    });
  }, []);

  useLayoutEffect(() => {
    if (!narrow || !node || state.reviewOpen) {
      closeDrawer();
      // The review tray takes over the narrow workspace. Do not leave an invisible
      // Inspector modal waiting underneath it when the user returns to the board.
      if (narrow && node && state.reviewOpen) store.selectNode(null);
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) {
      const active = document.activeElement;
      const invoker = active instanceof HTMLElement && active !== document.body && !dialog.contains(active)
        ? active
        : Array.from(document.querySelectorAll<HTMLElement>('[data-node-id]')).find(element => element.dataset.nodeId === node.id) ?? null;
      returnFocusRef.current = invoker;
      openDialogRef.current = dialog;
      dialog.showModal();
    }
    if (lastDialogNode.current !== node.id) {
      lastDialogNode.current = node.id;
      dialog.scrollTop = 0;
      dialog.querySelector<HTMLButtonElement>('.inspector-dialog-close')?.focus({ preventScroll: true });
    }
  }, [narrow, node?.id, state.reviewOpen, store, closeDrawer]);

  useEffect(() => () => closeDrawer(), [closeDrawer]);

  const links = node ? state.content.links.filter(link => link.claimId === node.id || link.evidenceId === node.id) : [];
  const conflicts = node ? state.content.conflicts.filter(conflict => conflict.nodeIds.includes(node.id) && !conflict.resolved) : [];
  const source = state.content.sources.find(item => item.id === node?.sourceId);
  const claims = state.content.nodes.filter(item => item.kind === 'claim');
  const evidence = state.content.nodes.filter(item => item.kind === 'evidence');
  const questions = state.content.nodes.filter(item => item.kind === 'question');
  const unlinked = evidence.filter(item => !state.content.links.some(link => link.evidenceId === item.id));
  const Icon = node?.kind === 'claim' ? Flag : node?.kind === 'question' ? CircleHelp : FileText;
  const content = <>
    <div className="inspector-label"><span>{node ? 'The detail behind the argument' : 'The bigger picture'}</span>{node && <IconButton label="Close inspector" className="inspector-dialog-close" autoFocus={narrow} onClick={() => store.selectNode(null)}><X size={16} /></IconButton>}</div>
    {!node ? <>
      <div className="overview-heading"><span className="overview-icon"><BookOpen size={22} strokeWidth={1.5} /></span><h2>Good research leaves<br />room for doubt.</h2><p>A conclusion is only as strong as the evidence you can trace.</p></div>
      <div className="overview-stats"><div><strong>{claims.length}</strong><span>Claims to test</span></div><div><strong>{evidence.length}</strong><span>Evidence items</span></div><div><strong>{questions.length}</strong><span>Open questions</span></div></div>
      <div className="inspector-section"><div className="section-heading"><span className="eyebrow">CURRENT CONCLUSION</span><button className="text-button" onClick={() => store.setPage('brief')} aria-label="Open decision brief"><ArrowUpRightIcon /></button></div><p className="conclusion-preview">{state.content.conclusion || 'No conclusion yet. Start by adding a claim and the evidence behind it.'}</p><span className="small-label"><Pencil size={12} />Recorded working position</span></div>
      <div className="insight-card"><span className="insight-eyebrow"><TriangleAlert size={14} />A useful loose end</span><h3>{unlinked.length ? `${unlinked.length} evidence ${unlinked.length === 1 ? 'item is' : 'items are'} still unlinked.` : 'What would change your mind?'}</h3><p>{unlinked.length ? 'An unconnected source may be the one that changes the story.' : 'Ask which claims lack a counterpoint before treating them as settled.'}</p>{unlinked[0] && <button className="text-button" onClick={() => { store.selectNode(unlinked[0].id); store.focusNodes([unlinked[0].id]); }}>Take a closer look<ArrowRight size={14} /></button>}</div>
      <div className="inspector-agent"><span className="agent-glyph"><ShieldCheck size={18} /></span><h3>What’s missing?</h3><p>Find unsupported claims, loose connections, and questions that still need an answer.</p><button className="button secondary full-width" onClick={onCheck}>Check the evidence<ArrowRight size={15} /></button><span className="tiny-label">STRUCTURE CHECK · NO CLAIM OF FACTUAL VERIFICATION</span></div>
      <div className="quiet-tip"><ArrowDownRight size={16} /><span>Select any card to follow its sources and reasoning.</span></div>
    </> : <>
      <div className="node-inspector-title"><span className={`node-type ${node.kind}`}><Icon size={14} />{copy.kind[node.kind]}</span><h2 id={titleId}>{node.title}</h2><div className="inspector-meta"><span className={`confidence ${node.confidence}`}>{copy.confidence[node.confidence]} confidence</span><span>{node.createdBy === 'sample' ? 'Sample · prepared by Codex' : node.createdBy === 'agent' ? 'Agent · reviewed by you' : 'Added by you'}</span></div></div>
      <div className="inspector-actions"><button className="button small secondary" onClick={() => onEdit(node)}><Pencil size={14} />Edit</button>{node.kind !== 'question' && <button className="button small secondary" onClick={() => onLink(node)}><Link2 size={14} />Connect</button>}<IconButton label={`Delete ${node.title}`} className="delete-button" onClick={() => onDelete(node)}><Trash2 size={15} /></IconButton></div>
      <div className="inspector-section"><span className="eyebrow">{node.kind === 'evidence' ? 'THE EVIDENCE' : 'CONTEXT & REASONING'}</span><p className={node.kind === 'evidence' ? 'evidence-quote' : 'inspector-body'}>{node.body}</p></div>
      {source && <div className="inspector-section"><span className="eyebrow">FOLLOW THE SOURCE</span><button className="source-reference" onClick={() => onSource(source)}><span className="source-file-icon"><FileText size={18} /></span><span><strong>{source.title}</strong><small>{source.publisher} · {formatDate(source.date)}</small></span><ArrowRight size={15} /></button>{source.fictional && <p className="small-label">Fictional material created for this demo.</p>}</div>}
      {node.kind !== 'question' && <div className="inspector-section"><div className="section-heading"><span className="eyebrow">{node.kind === 'claim' ? 'EVIDENCE CONNECTIONS' : 'CONNECTED CLAIMS'}</span><span className="count-pill">{links.length}</span></div>{!links.length ? <div className="unlinked-note"><Link2 size={17} /><p>This item is not connected yet. Make the reasoning explicit by adding a relationship.</p><button className="text-button" onClick={() => onLink(node)}>Add a relationship<ArrowRight size={13} /></button></div> : <div className="relation-stack">{links.map(link => {
        const related = state.content.nodes.find(item => item.id === (node.kind === 'claim' ? link.evidenceId : link.claimId));
        return related && <div key={link.id} className="relation-card"><button className="relation-main" onClick={() => store.selectNode(related.id)}><StanceTag stance={link.stance} /><strong>{related.title}</strong><span>{link.reason}</span></button><button className="text-button relation-unlink" aria-label={`Remove relationship to ${related.title}`} onClick={() => store.applyHumanOperations([{ type: 'unlink_evidence', linkId: link.id }], 'Removed an evidence relationship')}><Link2Off size={13} />Remove relationship</button></div>;
      })}</div>}</div>}
      <div className="inspector-section"><div className="section-heading"><span className="eyebrow">CONTRADICTIONS TO CONSIDER</span></div>{conflicts.map(conflict => <div className="conflict-note" key={conflict.id}><TriangleAlert size={16} /><div><strong>{conflict.title}</strong><p>{conflict.description}</p><button className="text-button" onClick={() => store.applyHumanOperations([{ type: 'resolve_conflict', conflictId: conflict.id, resolved: true }], 'Marked conflict resolved')}><Check size={13} />Mark resolved</button></div></div>)}<button className="text-button flag-conflict-button" onClick={() => onConflict(node)}><TriangleAlert size={14} />Flag a contradiction</button></div>
      <div className="provenance-note"><ShieldCheck size={17} /><div><strong>Part of the accepted record</strong><p>Added <time dateTime={node.createdAt}>{formatDate(node.createdAt)}</time>. Changes can be traced in activity.</p></div></div>
    </>}
  </>;

  if (!narrow) return <aside className={`inspector ${node ? 'has-selection' : ''}`} aria-label={node ? `${copy.kind[node.kind]} inspector` : 'Research overview'}>{content}</aside>;

  return <dialog
    ref={dialogRef}
    className={`inspector inspector-dialog${node ? ' has-selection' : ''}`}
    aria-labelledby={node ? titleId : undefined}
    onCancel={event => { event.preventDefault(); store.selectNode(null); }}
    onKeyDown={event => {
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return;
      const dialog = event.currentTarget;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'))
        .filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls.at(-1);
      // showModal makes the background inert; wrap its boundary controls as well,
      // so Chromium does not insert a browser-chrome focus stop into this cycle.
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault(); last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus();
      }
    }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const bounds = event.currentTarget.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) store.selectNode(null);
    }}
  >{node ? content : null}</dialog>;
}

function ArrowUpRightIcon() { return <ArrowRight size={15} style={{ transform: 'rotate(-35deg)' }} />; }
