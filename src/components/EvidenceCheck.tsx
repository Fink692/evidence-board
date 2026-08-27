import { ArrowRight, Check, CircleHelp, FileText, Flag, Link2, TriangleAlert } from 'lucide-react';
import { checkEvidence, type EvidenceFinding } from '../domain/evidence-check';
import type { BoardState, BoardStore } from '../domain/types';
import { Modal } from './ui';
const categories: Array<{ key: EvidenceFinding['category']; label: string; icon: typeof Flag }> = [
  { key: 'unsupported', label: 'Claims without recorded support', icon: Flag },
  { key: 'unlinked', label: 'Evidence waiting for a connection', icon: Link2 },
  { key: 'conflict', label: 'Unresolved contradictions', icon: TriangleAlert },
  { key: 'question', label: 'Open research questions', icon: CircleHelp },
  { key: 'provenance', label: 'Source details to consider', icon: FileText },
];
export function EvidenceCheck({ open, onClose, state, store, onAdd }: { open: boolean; onClose: () => void; state: BoardState; store: BoardStore; onAdd: () => void }) {
  const findings = checkEvidence(state.content);
  return <Modal open={open} onClose={onClose} title="What does your evidence still need?" subtitle={`A check of the accepted record at revision ${state.revision}.`} className="evidence-check-modal" footer={<><span className="quiet">Your board has not been changed.</span><button className="button primary" onClick={onClose}>Back to research<ArrowRight size={15} /></button></>}>
    <p className="check-explanation">Find missing connections, unresolved conflicts, and open questions. This checks your board’s structure; it does not verify source accuracy or decide whether a claim is true.</p>
    {!state.content.nodes.length ? <div className="check-empty"><FileText size={26} /><h3>Start with a claim and some evidence.</h3><p>The check becomes useful as you build your record.</p><button className="button secondary" onClick={() => { onClose(); onAdd(); }}>Add your first item<ArrowRight size={15} /></button></div> : !findings.length ? <div className="check-empty"><Check size={26} /><h3>No structural gaps found.</h3><p>Source accuracy and conclusions still need your judgement.</p></div> : categories.map(({ key, label, icon: Icon }) => {
      const group = findings.filter(item => item.category === key); if (!group.length) return null;
      return <section className={`check-group ${key}`} key={key}><h3><Icon size={16} />{label}<span>{group.length}</span></h3>{group.map(item => <article className="check-finding" key={item.id}><h4>{item.title}</h4><p>{item.detail}</p>{item.nodeIds.length > 0 && <button className="text-button" onClick={() => { store.setPage('board'); store.setFilter('all'); store.setQuery(''); store.selectNode(item.nodeIds[0]); store.focusNodes(item.nodeIds); onClose(); }}>Inspect the record<ArrowRight size={13} /></button>}</article>)}</section>;
    })}
  </Modal>;
}
