import type { BoardContent, BoardNode, BoardState, Conflict, EvidenceLink, Source } from './types';

function normalize(text: string): string {
  return text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

/** Gaps include open questions, unsourced relationships (unlinked evidence), and claims without supporting evidence. */
export function getGapNodeIds(content: BoardContent): Set<string> {
  const linkedEvidence = new Set(content.links.map((link) => link.evidenceId));
  const supportedClaims = new Set(content.links.filter((link) => link.stance === 'supports').map((link) => link.claimId));
  return new Set(content.nodes.filter((node) => node.kind === 'question'
    || (node.kind === 'evidence' && !linkedEvidence.has(node.id))
    || (node.kind === 'claim' && !supportedClaims.has(node.id))).map((node) => node.id));
}

/** Preserve board order. Focus highlights nodes; it never silently hides other nodes. */
export function getVisibleNodes(state: Pick<BoardState, 'content' | 'filter' | 'query'>): BoardNode[] {
  const { content, filter, query } = state;
  const conflicted = new Set(content.conflicts.filter((conflict) => !conflict.resolved).flatMap((conflict) => conflict.nodeIds));
  const gaps = getGapNodeIds(content);
  const sources = new Map(content.sources.map((source) => [source.id, source]));
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  return content.nodes.filter((node) => {
    const matchesFilter = filter === 'all'
      || filter === node.kind
      || (filter === 'conflicts' && conflicted.has(node.id))
      || (filter === 'gaps' && gaps.has(node.id));
    if (!matchesFilter) return false;
    if (!terms.length) return true;
    const source = node.sourceId ? sources.get(node.sourceId) : undefined;
    const haystack = normalize([
      node.title, node.body, node.kind, node.confidence,
      source?.title, source?.publisher, source?.excerpt,
      ...content.links.filter((link) => link.evidenceId === node.id || link.claimId === node.id).map((link) => link.reason),
    ].filter(Boolean).join(' '));
    return terms.every((term) => haystack.includes(term));
  });
}

export interface NodeRelations {
  /** Relationships incident to this node, in board order. */
  links: EvidenceLink[];
  /** Unique nodes at the other ends of those relationships, in board order. */
  linkedNodes: BoardNode[];
  /** Both resolved and unresolved conflicts that include this node. */
  conflicts: Conflict[];
  /** The directly cited source, if any. */
  source: Source | null;
}

export function getNodeRelations(content: BoardContent, nodeId: string): NodeRelations {
  const node = content.nodes.find((entry) => entry.id === nodeId);
  if (!node) return { links: [], linkedNodes: [], conflicts: [], source: null };
  const links = content.links.filter((link) => link.evidenceId === nodeId || link.claimId === nodeId);
  const relatedIds = new Set(links.map((link) => link.evidenceId === nodeId ? link.claimId : link.evidenceId));
  return {
    links,
    linkedNodes: content.nodes.filter((entry) => relatedIds.has(entry.id)),
    conflicts: content.conflicts.filter((conflict) => conflict.nodeIds.includes(nodeId)),
    source: content.sources.find((source) => source.id === node.sourceId) ?? null,
  };
}

export interface BoardStats {
  claims: number;
  evidence: number;
  questions: number;
  sources: number;
  links: number;
  /** Unresolved conflicts only. */
  conflicts: number;
  unlinkedEvidence: number;
  /** Number of distinct nodes visible under the Gaps filter. */
  gaps: number;
}

export function getBoardStats(content: BoardContent): BoardStats {
  const linked = new Set(content.links.map((link) => link.evidenceId));
  return {
    claims: content.nodes.filter((node) => node.kind === 'claim').length,
    evidence: content.nodes.filter((node) => node.kind === 'evidence').length,
    questions: content.nodes.filter((node) => node.kind === 'question').length,
    sources: content.sources.length,
    links: content.links.length,
    conflicts: content.conflicts.filter((conflict) => !conflict.resolved).length,
    unlinkedEvidence: content.nodes.filter((node) => node.kind === 'evidence' && !linked.has(node.id)).length,
    gaps: getGapNodeIds(content).size,
  };
}
