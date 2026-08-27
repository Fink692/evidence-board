import { useEffect, useId, useState, type FormEvent } from 'react';
import { FileText, Flag, Link2, MessageCircleQuestion, Plus, Save } from 'lucide-react';
import type { BoardNode, BoardState, BoardStore, Confidence, NodeKind, Operation, Source, Stance } from '../domain/types';
import { Modal } from './ui';
import { copy } from '../i18n/en-CA';
import { errorMessage, makeId } from '../lib/format';
import { useDeviceStorage } from '../lib/storage-scope';

// Colon is excluded by the domain ID schema, so an imported source can never
// collide with the form's create-source option.
const NEW_SOURCE_OPTION = 'new:source';

export function NodeEditor({ open, onClose, state, store, node, defaultKind = 'evidence' }: {
  open: boolean; onClose: () => void; state: BoardState; store: BoardStore; node?: BoardNode; defaultKind?: NodeKind;
}) {
  const deviceOnly = useDeviceStorage();
  const formId = useId();
  const [kind, setKind] = useState<NodeKind>(defaultKind);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [confidence, setConfidence] = useState<Confidence>('medium');
  const [sourceId, setSourceId] = useState(NEW_SOURCE_OPTION);
  const [sourceTitle, setSourceTitle] = useState('');
  const [publisher, setPublisher] = useState('');
  const [url, setUrl] = useState('');
  const [sourceDate, setSourceDate] = useState('');
  const [excerpt, setExcerpt] = useState('');
  const [sourceConfidence, setSourceConfidence] = useState<Confidence>('medium');
  const [linkReason, setLinkReason] = useState('');
  const [claimId, setClaimId] = useState('');
  const [stance, setStance] = useState<Stance>('supports');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setKind(node?.kind ?? defaultKind); setTitle(node?.title ?? ''); setBody(node?.body ?? '');
    setConfidence(node?.confidence ?? 'medium'); setSourceId(node?.sourceId ?? NEW_SOURCE_OPTION);
    setSourceTitle(''); setPublisher(''); setUrl(''); setClaimId(''); setStance('supports'); setError('');
    setSourceDate(''); setExcerpt(''); setSourceConfidence('medium'); setLinkReason('');
  }, [open, node, defaultKind]);
  function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    try {
      const operations: Operation[] = [];
      if (node) {
        operations.push({ type: 'update_node', nodeId: node.id, patch: { title: title.trim(), body: body.trim(), confidence } });
      } else {
        let source: Source | undefined;
        let resolvedSource = sourceId;
        if (kind === 'evidence' && sourceId === NEW_SOURCE_OPTION) {
          if (!sourceTitle.trim() || !publisher.trim()) throw new Error('Give the source a title and publisher so this evidence can be traced.');
          resolvedSource = makeId('source');
          source = { id: resolvedSource, title: sourceTitle.trim(), publisher: publisher.trim(), date: sourceDate, excerpt: excerpt.trim(), reliability: sourceConfidence, fictional: false, ...(url.trim() ? { url: url.trim() } : {}) };
        }
        const newNode: BoardNode = { id: makeId(kind), kind, title: title.trim(), body: body.trim(), confidence, createdBy: 'human', createdAt: new Date().toISOString(), position: { x: 0, y: 0 }, ...(kind === 'evidence' ? { sourceId: resolvedSource } : {}) };
        operations.push({ type: 'create_node', node: newNode, ...(source ? { source } : {}) });
        if (kind === 'evidence' && claimId) operations.push({ type: 'link_evidence', link: { id: makeId('link'), evidenceId: newNode.id, claimId, stance, reason: linkReason.trim(), createdBy: 'human' } });
      }
      store.applyHumanOperations(operations, node ? `Edited ${copy.kind[kind].toLowerCase()}` : `Added ${copy.kind[kind].toLowerCase()}`);
      onClose();
    } catch (err) { setError(errorMessage(err)); }
  }
  const selectedSource = state.content.sources.find(source => source.id === node?.sourceId);
  return <Modal open={open} onClose={onClose} title={node ? `Edit ${copy.kind[kind].toLowerCase()}` : 'Add to the evidence board'} subtitle="A clear record makes a stronger argument."
    footer={<><span className="quiet">{deviceOnly ? 'Changes stay in this browser copy. You can undo this.' : 'Changes sync to your account. You can undo this.'}</span><div className="button-row"><button className="button secondary" onClick={onClose}>Cancel</button><button type="submit" form={formId} className="button primary">{node ? <Save size={16} /> : <Plus size={16} />}{node ? 'Save changes' : 'Add to board'}</button></div></>}>
    <form id={formId} onSubmit={submit} className="editor-form">
      {!node && <fieldset className="kind-selector"><legend className="field-label">What are you adding?</legend>{(['evidence', 'claim', 'question'] as const).map(value => {
        const Icon = value === 'evidence' ? FileText : value === 'claim' ? Flag : MessageCircleQuestion;
        return <label key={value} className={kind === value ? 'selected' : ''}><input type="radio" name="kind" value={value} checked={kind === value} onChange={() => setKind(value)} /><Icon size={18} />{copy.kind[value]}</label>;
      })}</fieldset>}
      <label className="field-label">{kind === 'question' ? 'Your open question' : 'Title'}<input autoComplete="off" required maxLength={160} value={title} onChange={event => setTitle(event.target.value)} placeholder={kind === 'claim' ? 'What conclusion are you testing?' : kind === 'question' ? 'What do we still need to understand?' : 'What does this evidence tell us?'} /></label>
      <label className="field-label">{kind === 'evidence' ? 'Your interpretation or observation' : 'Context and notes'}<textarea required rows={3} maxLength={5000} value={body} onChange={event => setBody(event.target.value)} placeholder="Add the context someone else would need to evaluate this." /></label>
      <label className="field-label">Confidence<select value={confidence} onChange={event => setConfidence(event.target.value as Confidence)}>{(['high', 'medium', 'low'] as const).map(value => <option key={value} value={value}>{copy.confidence[value]}</option>)}</select></label>
      {kind === 'evidence' && !node && <div className="source-form"><div className="section-heading"><FileText size={16} /><h3>Keep the source attached</h3></div><label className="field-label">Source<select value={sourceId} onChange={event => setSourceId(event.target.value)}><option value={NEW_SOURCE_OPTION}>Add a new source</option>{state.content.sources.map(source => <option value={source.id} key={source.id}>{source.title}</option>)}</select></label>{sourceId === NEW_SOURCE_OPTION && <><label className="field-label">Source title<input required value={sourceTitle} maxLength={160} onChange={event => setSourceTitle(event.target.value)} placeholder="e.g. Annual report, interview, or field notes" /></label><div className="form-grid"><label className="field-label">Publisher or author<input required value={publisher} maxLength={160} onChange={event => setPublisher(event.target.value)} placeholder="Who produced it?" /></label><label className="field-label">Source URL <span className="optional">(optional)</span><input type="url" value={url} onChange={event => setUrl(event.target.value)} placeholder="https://" /></label></div></>}
        {sourceId === NEW_SOURCE_OPTION && <><div className="form-grid"><label className="field-label">Publication or observation date <span className="optional">(if known)</span><input type="date" value={sourceDate} onChange={event => setSourceDate(event.target.value)} /></label><label className="field-label">Source confidence<select value={sourceConfidence} onChange={event => setSourceConfidence(event.target.value as Confidence)}>{(['high', 'medium', 'low'] as const).map(value => <option key={value} value={value}>{copy.confidence[value]}</option>)}</select></label></div><label className="field-label">Original excerpt or field notes<textarea required maxLength={6000} rows={4} value={excerpt} onChange={event => setExcerpt(event.target.value)} placeholder="Paste the original passage or your original observation. Keep your interpretation in the notes above." /></label></>}
        <div className="form-grid"><label className="field-label">Connect to a claim<select value={claimId} onChange={event => setClaimId(event.target.value)}><option value="">Leave unlinked for now</option>{state.content.nodes.filter(item => item.kind === 'claim').map(claim => <option key={claim.id} value={claim.id}>{claim.title}</option>)}</select></label><label className="field-label">Relationship<select value={stance} disabled={!claimId} onChange={event => setStance(event.target.value as Stance)}>{Object.entries(copy.stance).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label></div>
      {claimId && <label className="field-label">Why does this evidence have that relationship?<textarea required maxLength={1000} rows={2} value={linkReason} onChange={event => setLinkReason(event.target.value)} placeholder="Explain the connection in your own words." /></label>}
      </div>}
      {node?.kind === 'evidence' && selectedSource && <div className="inline-note"><FileText size={16} />Source retained: {selectedSource.title}</div>}
      {error && <p role="alert" className="form-error">{error}</p>}
    </form>
  </Modal>;
}

export function LinkEditor({ open, onClose, state, store, node }: { open: boolean; onClose: () => void; state: BoardState; store: BoardStore; node?: BoardNode }) {
  const formId = useId();
  const [evidenceId, setEvidenceId] = useState('');
  const [claimId, setClaimId] = useState('');
  const [stance, setStance] = useState<Stance>('supports');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setEvidenceId(node?.kind === 'evidence' ? node.id : ''); setClaimId(node?.kind === 'claim' ? node.id : ''); setStance('supports'); setReason(''); setError(''); } }, [open, node]);
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      store.applyHumanOperations([{ type: 'link_evidence', link: { id: makeId('link'), evidenceId, claimId, stance, reason: reason.trim(), createdBy: 'human' } }], 'Connected evidence to a claim');
      onClose();
    } catch (err) { setError(errorMessage(err)); }
  }
  return <Modal open={open} onClose={onClose} title="Connect the evidence" subtitle="Make the reasoning between a source and a claim explicit." footer={<><button className="button secondary" onClick={onClose}>Cancel</button><button className="button primary" form={formId} type="submit"><Link2 size={16} />Add relationship</button></>}>
    <form id={formId} className="editor-form" onSubmit={submit}>
      <label className="field-label">Evidence<select required value={evidenceId} onChange={event => setEvidenceId(event.target.value)}><option value="">Choose an evidence item</option>{state.content.nodes.filter(item => item.kind === 'evidence').map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label className="field-label">Relationship<select value={stance} onChange={event => setStance(event.target.value as Stance)}>{Object.entries(copy.stance).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field-label">Claim<select required value={claimId} onChange={event => setClaimId(event.target.value)}><option value="">Choose a claim</option>{state.content.nodes.filter(item => item.kind === 'claim').map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      <label className="field-label">Reason<textarea required rows={3} maxLength={1000} value={reason} onChange={event => setReason(event.target.value)} placeholder="Explain why this evidence supports, challenges, or gives context to the claim." /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  </Modal>;
}
