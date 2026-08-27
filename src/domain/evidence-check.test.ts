import { describe, expect, it } from 'vitest';
import { createEmptyContent, createSeedContent } from '../data/seed';
import { createBoardStore } from '../state/boardStore';
import { checkEvidence } from './evidence-check';
import { formatDate } from '../lib/format';

describe('real research record', () => {
  it('checks arbitrary IDs and recorded relationships without changing the board', () => {
    const content = createSeedContent();
    content.nodes = content.nodes.map(node => ({ ...node, id: `custom_${node.id}` }));
    content.links = content.links.map(link => ({ ...link, evidenceId: `custom_${link.evidenceId}`, claimId: `custom_${link.claimId}` }));
    content.conflicts = content.conflicts.map(conflict => ({ ...conflict, nodeIds: conflict.nodeIds.map(id => `custom_${id}`) }));
    const before = JSON.stringify(content); const findings = checkEvidence(content);
    expect(findings.some(item => item.category === 'unsupported' && item.nodeIds.includes('custom_claim_cost'))).toBe(true);
    expect(findings.some(item => item.category === 'unlinked' && item.nodeIds.includes('custom_evidence_turnstile'))).toBe(true);
    expect(findings.filter(item => item.category === 'conflict')).toHaveLength(1);
    expect(JSON.stringify(content)).toBe(before);
  });
  it('does not fabricate findings for an empty board', () => { expect(checkEvidence(createEmptyContent())).toEqual([]); });
  it('preserves unknown dates and independent source confidence, and can undo source edits', () => {
    const content = createSeedContent(); content.sources[0].date = '';
    const store = createBoardStore({ content, storage: null }); const original = store.getState().content;
    store.updateSource({ ...content.sources[0], excerpt: 'Original interview notes, kept separate from interpretation.', reliability: 'low' });
    expect(store.getState().content.sources[0].date).toBe('');
    expect(store.getState().content.nodes[0]).toEqual(original.nodes[0]);
    expect(formatDate('')).toBe('Date not recorded');
    store.undo(); expect(store.getState().content).toEqual(original);
  });
  it('never permits an imported fictional source to be relabelled as real', () => {
    const store = createBoardStore({ content: createSeedContent(), storage: null });
    expect(() => store.updateSource({ ...store.getState().content.sources[0], fictional: false })).toThrow('provenance');
  });
  it('saves metadata with audit history and undoes it', () => {
    const store = createBoardStore({ content: createEmptyContent('Original question?'), storage: null });
    store.updateMetadata({ title: 'New project name', question: 'What changed?', description: 'Our context.' });
    expect(store.getState().activity[0].title).toBe('Updated research details');
    const restored = createBoardStore({ session: JSON.parse(store.exportSession()), storage: null });
    restored.undo(); expect(restored.getState().content.question).toBe('Original question?');
  });
});
