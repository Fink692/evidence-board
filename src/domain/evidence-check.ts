import type { BoardContent } from './types';
export interface EvidenceFinding { id: string; category: 'unsupported' | 'unlinked' | 'conflict' | 'question' | 'provenance'; title: string; detail: string; nodeIds: string[] }
/** A deterministic check of the accepted record, not a factual or AI verdict. */
export function checkEvidence(content: BoardContent): EvidenceFinding[] {
  const findings: EvidenceFinding[] = [];
  for (const node of content.nodes) {
    if (node.kind === 'claim' && !content.links.some(link => link.claimId === node.id && link.stance === 'supports')) findings.push({ id: `unsupported_${node.id}`, category: 'unsupported', title: node.title, detail: 'No supporting evidence is connected to this claim. Add a source, connect existing evidence, or reconsider the wording.', nodeIds: [node.id] });
    if (node.kind === 'evidence' && !content.links.some(link => link.evidenceId === node.id)) findings.push({ id: `unlinked_${node.id}`, category: 'unlinked', title: node.title, detail: 'This evidence is not connected to a claim. Record what it supports, challenges, or puts in context.', nodeIds: [node.id] });
    if (node.kind === 'question') findings.push({ id: `question_${node.id}`, category: 'question', title: node.title, detail: node.body, nodeIds: [node.id] });
  }
  for (const conflict of content.conflicts.filter(item => !item.resolved)) findings.push({ id: conflict.id, category: 'conflict', title: conflict.title, detail: conflict.description, nodeIds: conflict.nodeIds });
  for (const source of content.sources.filter(item => !item.url || item.fictional)) findings.push({ id: `source_${source.id}`, category: 'provenance', title: source.title, detail: source.fictional ? 'This source is fictional. Do not use it as factual evidence for a real decision.' : 'No online reference is recorded. An interview, observation, or offline document can still be valid; keep enough original detail to trace it.', nodeIds: content.nodes.filter(node => node.sourceId === source.id).map(node => node.id) });
  return findings;
}
