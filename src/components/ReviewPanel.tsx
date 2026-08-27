import { useState } from 'react';
import { ArrowRight, Check, CheckCheck, CircleHelp, Eye, GitCompareArrows, Link2, Pencil, ShieldCheck, Sparkles, TriangleAlert, X } from 'lucide-react';
import type { BoardContent, BoardState, BoardStore, Operation, ProposedChange } from '../domain/types';
import { EmptyState, Modal } from './ui';
import { errorMessage } from '../lib/format';
import '../styles/review-details.css';

export function operationDetails(operation: Operation, content: BoardContent): { label: string; before: string; after: string; ids: string[] } {
  const title = (id: string) => content.nodes.find(node => node.id === id)?.title ?? id;
  switch (operation.type) {
    case 'create_node': {
      const source = operation.source ?? content.sources.find(item => item.id === operation.node.sourceId);
      return { label: `Add ${operation.node.kind === 'question' ? 'open question' : operation.node.kind}`, before: 'Not on the board', after: [operation.node.title, operation.node.body, `Confidence: ${operation.node.confidence}`, source ? `Source: ${source.title}${source.fictional ? ' (fictional)' : ''}` : ''].filter(Boolean).join('\n\n'), ids: [] };
    }
    case 'update_node': {
      const current = content.nodes.find(node => node.id === operation.nodeId);
      const fields = (['title', 'body', 'confidence'] as const).filter(field => operation.patch[field] !== undefined);
      const labels = { title: 'Title', body: 'Text', confidence: 'Confidence' };
      return { label: 'Refine an item', before: fields.map(field => `${labels[field]}: ${current?.[field] ?? '(Item no longer present)'}`).join('\n\n'), after: fields.map(field => `${labels[field]}: ${operation.patch[field]}`).join('\n\n'), ids: [operation.nodeId] };
    }
    case 'delete_node': return { label: 'Remove item', before: title(operation.nodeId), after: 'Removed, with its relationships', ids: [operation.nodeId] };
    case 'link_evidence': return { label: 'Connect evidence', before: 'No relationship', after: `${title(operation.link.evidenceId)} → ${operation.link.stance} → ${title(operation.link.claimId)}\n\nReason: ${operation.link.reason}`, ids: [operation.link.evidenceId, operation.link.claimId] };
    case 'unlink_evidence': {
      const link = content.links.find(item => item.id === operation.linkId);
      return { label: 'Remove relationship', before: link ? `${title(link.evidenceId)} → ${title(link.claimId)}` : operation.linkId, after: 'Relationship removed; evidence retained', ids: link ? [link.evidenceId, link.claimId] : [] };
    }
    case 'flag_conflict': return { label: 'Flag a contradiction', before: 'Not explicitly flagged', after: `${operation.conflict.title}\n\n${operation.conflict.description}\n\nRelated: ${operation.conflict.nodeIds.map(title).join('; ')}`, ids: operation.conflict.nodeIds };
    case 'resolve_conflict': return { label: operation.resolved ? 'Resolve conflict' : 'Reopen conflict', before: content.conflicts.find(conflict => conflict.id === operation.conflictId)?.title ?? operation.conflictId, after: operation.resolved ? 'Marked resolved' : 'Marked unresolved', ids: content.conflicts.find(conflict => conflict.id === operation.conflictId)?.nodeIds ?? [] };
    case 'set_conclusion': return { label: 'Update conclusion', before: content.conclusion, after: operation.conclusion, ids: [] };
  }
}

function editableText(operation: Operation): string | null {
  switch (operation.type) {
    case 'create_node': return operation.node.title;
    case 'update_node': return operation.patch.title ?? operation.patch.body ?? null;
    case 'link_evidence': return operation.link.reason;
    case 'flag_conflict': return operation.conflict.description;
    case 'set_conclusion': return operation.conclusion;
    default: return null;
  }
}

function replaceText(operation: Operation, text: string): Operation {
  switch (operation.type) {
    case 'create_node': return { ...operation, node: { ...operation.node, title: text } };
    case 'update_node': return { ...operation, patch: { ...operation.patch, ...(operation.patch.title ? { title: text } : { body: text }) } };
    case 'link_evidence': return { ...operation, link: { ...operation.link, reason: text } };
    case 'flag_conflict': return { ...operation, conflict: { ...operation.conflict, description: text } };
    case 'set_conclusion': return { ...operation, conclusion: text };
    default: return operation;
  }
}

function ChangeCard({ change, setId, state, store, onError }: { change: ProposedChange; setId: string; state: BoardState; store: BoardStore; onError: (message: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const details = operationDetails(change.operation, state.content);
  const editable = editableText(change.operation);
  const Icon = change.operation.type === 'link_evidence' ? Link2 : change.operation.type === 'flag_conflict' ? TriangleAlert : change.operation.type === 'create_node' ? CircleHelp : GitCompareArrows;
  function saveEdit() {
    try { store.editChange(setId, change.id, replaceText(change.operation, draft.trim())); setEditing(false); onError(''); }
    catch (error) { onError(errorMessage(error)); }
  }
  return <article className={`change-card ${change.selected ? 'selected' : ''}`}>
    <div className="change-check"><input type="checkbox" aria-label={`Accept: ${change.title}`} checked={change.selected} onChange={() => store.toggleChange(setId, change.id)} /></div>
    <div className="change-content"><span className={`change-type ${change.operation.type}`}><Icon size={14} aria-hidden="true" />{details.label}</span><h3>{change.title}</h3><p className="change-rationale">{change.rationale}</p>
      <div className="change-diff"><div><span>Before</span><p>{details.before}</p></div><ArrowRight size={16} aria-hidden="true" /><div><span>After your approval</span><p>{details.after}</p></div></div>
      <details className="change-operation"><summary>Inspect full proposed change</summary><p>All proposed fields, including source material when supplied. Nothing here is accepted until you approve it.</p><pre tabIndex={0} aria-label={`Complete proposed operation: ${change.title}`}>{JSON.stringify(change.operation, null, 2)}</pre></details>
      {editing ? <div className="change-edit"><label className="field-label">Your wording<textarea value={draft} rows={3} maxLength={change.operation.type === 'create_node' ? 160 : 1000} onChange={event => setDraft(event.target.value)} /></label><div className="button-row"><button className="button small secondary" onClick={() => setEditing(false)}>Cancel edit</button><button className="button small primary" onClick={saveEdit}><Check size={14} />Save wording</button></div></div> : <div className="change-actions">
        {details.ids.length > 0 && <button className="text-button" onClick={() => { store.focusNodes(details.ids); store.selectNode(details.ids[0]); store.setPage('board'); store.setReviewOpen(false); }}><Eye size={14} />Show on board</button>}
        {editable !== null && <button className="text-button" onClick={() => { setDraft(editable); setEditing(true); }}><Pencil size={14} />Edit wording</button>}
      </div>}
    </div>
  </article>;
}

export function ReviewPanel({ state, store }: { state: BoardState; store: BoardStore }) {
  const [error, setError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const pending = state.changeSets.filter(set => set.status === 'pending');
  const proposal = pending.find(set => set.id === activeId) ?? pending[0];
  const selected = proposal?.changes.filter(change => change.selected).length ?? 0;
  const stale = proposal && proposal.baseRevision !== state.revision;
  function apply() {
    if (!proposal) return;
    try { store.applyChangeSet(proposal.id); setError(''); }
    catch (err) { setError(errorMessage(err)); }
  }
  return <Modal open={state.reviewOpen} onClose={() => { store.setReviewOpen(false); setError(''); }} title="Your judgement. A stronger board." subtitle="Review proposed changes" className="review-modal" footer={proposal ? <>
    <button className="button ghost danger-text" onClick={() => { store.rejectChangeSet(proposal.id); setError(''); }}><X size={15} />Reject all</button>
    <div className="review-apply"><span>{selected} of {proposal.changes.length} selected</span><button className="button primary" disabled={selected === 0 || Boolean(stale)} onClick={apply}><CheckCheck size={17} />Apply selected{selected > 0 ? ` (${selected})` : ''}</button></div>
  </> : <button className="button primary" onClick={() => store.setReviewOpen(false)}>Back to the board</button>}>
    {!proposal ? <EmptyState icon={<CheckCheck size={30} />} title="Everything is reviewed." action={<button className="button secondary" onClick={() => store.setReviewOpen(false)}>Continue researching<ArrowRight size={16} /></button>}>Your accepted changes are part of the evidence record. Rejected changes stay out of the brief.</EmptyState> : <>
      {pending.length > 1 && <div className="proposal-tabs" role="group" aria-label="Pending change sets">{pending.map((set, i) => <button key={set.id} className={`button small ${set.id === proposal.id ? 'primary' : 'secondary'}`} onClick={() => { setActiveId(set.id); setError(''); }}>Proposal {i + 1}<span>{set.changes.length}</span></button>)}</div>}
      <div className="review-intro"><span className="agent-orb"><Sparkles size={22} /></span><div><h3>{proposal.title}</h3><p>{proposal.summary}</p></div><span className="proposal-count">{proposal.changes.length} proposed</span></div>
      <div className="review-safety"><ShieldCheck size={17} /><span>Nothing has changed yet. Keep what helps. Edit what needs care. Leave the rest.</span></div>
      {stale && <div className="form-error" role="alert"><strong>This proposal is out of date.</strong> The board changed after it was prepared (revision {proposal.baseRevision} → {state.revision}). Reject it and ask for a fresh proposal; it cannot be applied to changed evidence.</div>}
      <div className="change-stack">{proposal.changes.map(change => <ChangeCard key={change.id} change={change} setId={proposal.id} state={state} store={store} onError={setError} />)}</div>
      {error && <p role="alert" className="form-error">{error}</p>}
      <p className="review-footnote">Unselected changes are rejected when you apply. You can undo the accepted set in one step.</p>
    </>}
  </Modal>;
}
