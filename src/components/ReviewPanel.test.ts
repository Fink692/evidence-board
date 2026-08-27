import { describe, expect, it } from 'vitest';
import { operationDetails } from './ReviewPanel';
import { seedContent } from '../data/seed';

describe('proposal review transparency', () => {
  it('compares the previous text for a body-only edit, not the item title', () => {
    const node = seedContent.nodes.find(item => item.id === 'claim_demand')!;
    const diff = operationDetails({ type: 'update_node', nodeId: node.id, patch: { body: 'A more careful interpretation.' } }, seedContent);
    expect(diff.before).toBe(`Text: ${node.body}`);
    expect(diff.after).toBe('Text: A more careful interpretation.');
  });

  it('shows every modified field when title, text, and confidence change together', () => {
    const node = seedContent.nodes[0];
    const diff = operationDetails({ type: 'update_node', nodeId: node.id, patch: { title: 'Revised title', body: 'Revised context', confidence: 'low' } }, seedContent);
    expect(diff.before).toBe(`Title: ${node.title}\n\nText: ${node.body}\n\nConfidence: ${node.confidence}`);
    expect(diff.after).toBe('Title: Revised title\n\nText: Revised context\n\nConfidence: low');
  });

  it('shows the actual link reason so a human wording edit is visible before approval', () => {
    const link = { ...seedContent.links[0], reason: 'Entry counts do not measure occupied seats.' };
    expect(operationDetails({ type: 'link_evidence', link }, seedContent).after).toContain(`Reason: ${link.reason}`);
  });

  it('shows proposed text and source attribution for new evidence', () => {
    const node = seedContent.nodes.find(item => item.kind === 'evidence')!;
    const source = seedContent.sources.find(item => item.id === node.sourceId)!;
    const diff = operationDetails({ type: 'create_node', node, source }, seedContent);
    expect(diff.after).toContain(node.body);
    expect(diff.after).toContain(`Confidence: ${node.confidence}`);
    expect(diff.after).toContain(`Source: ${source.title} (fictional)`);
  });

  it('names every affected item in a proposed contradiction', () => {
    const conflict = seedContent.conflicts[0];
    const diff = operationDetails({ type: 'flag_conflict', conflict }, seedContent);
    expect(diff.after).toContain(conflict.title);
    expect(diff.after).toContain(conflict.description);
    for (const id of conflict.nodeIds) expect(diff.after).toContain(seedContent.nodes.find(node => node.id === id)!.title);
  });
});
