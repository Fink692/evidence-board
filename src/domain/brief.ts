import type { BoardContent, BoardNode, DecisionBrief } from './types';

/** Markdown treats imported source and node text as text, never as markup or HTML. */
export function escapeMarkdown(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/([`*_{}\[\]<>#|!~])/g, '\\$1')
    .replace(/^([ \t]*)([-+]|\d+\.)[ \t]/gm, '$1\\$2 ')
    .replace(/^([ \t]*)([-=](?:[ \t]*[-=])*)[ \t]*$/gm, '$1\\$2');
}

/** Only accepted content is an input; pending and rejected proposals cannot enter a brief. */
export function generateBrief(content: BoardContent, revision: number, generatedAt = new Date().toISOString()): DecisionBrief {
  const sourceNumbers = new Map(content.sources.map((source, index) => [source.id, index + 1]));
  const nodes = new Map(content.nodes.map((node) => [node.id, node]));
  const cite = (node: BoardNode) => node.sourceId && sourceNumbers.has(node.sourceId) ? ` [S${sourceNumbers.get(node.sourceId)}]` : '';
  const describe = (node: BoardNode) => `**${escapeMarkdown(node.title)}${/[.!?]$/.test(node.title) ? '' : '.'}** ${escapeMarkdown(node.body)}${cite(node)}`;
  const lines = [
    `# ${escapeMarkdown(content.title)} — Decision brief`,
    '',
    `Accepted board revision: ${revision} · Generated: ${generatedAt}`,
    '',
    '> This brief is assembled from accepted board content. It is not an independent research finding or an automated recommendation.',
    '',
  ];
  if (content.sources.some((source) => source.fictional)) {
    lines.push('> **Fictional case material:** Sources marked fictional are demonstration fixtures, not published research. Do not use their figures as real-world evidence.', '');
  }
  if (content.nodes.some((node) => node.createdBy === 'sample')) {
    lines.push('> **Illustrative sample:** Prepared by Codex at the workspace owner’s request. Published evidence is distinguished from example decisions; no results from the owner’s team are implied.', '');
  }
  if (content.description) lines.push('## Research context', '', escapeMarkdown(content.description), '');
  lines.push('## Decision question', '', escapeMarkdown(content.question), '', '## Working conclusion', '',
    content.conclusion ? escapeMarkdown(content.conclusion) : 'No conclusion has been recorded.', '',
    '**Review note:** The conclusion is part of the saved board, not a verified fact. Read the counterevidence, unresolved conflicts, and questions before acting.', '',
    '## Claims and evidence', '');

  const claims = content.nodes.filter((node) => node.kind === 'claim');
  if (!claims.length) lines.push('No claims have been added.', '');
  for (const claim of claims) {
    lines.push(`### ${escapeMarkdown(claim.title)}`, '', `${escapeMarkdown(claim.body)}${cite(claim)}`, '', `Recorded confidence: ${claim.confidence}.`, '');
    for (const [stance, label] of [['supports', 'Supporting evidence'], ['challenges', 'Challenging evidence'], ['context', 'Context']] as const) {
      const links = content.links.filter((link) => link.claimId === claim.id && link.stance === stance);
      if (!links.length) {
        if (stance === 'supports') lines.push('**Evidence gap:** No supporting evidence has been linked to this claim.', '');
        continue;
      }
      lines.push(`**${label}**`, '');
      for (const link of links) {
        const evidence = nodes.get(link.evidenceId);
        if (evidence) lines.push(`- ${describe(evidence)} Relationship: ${escapeMarkdown(link.reason)}`);
      }
      lines.push('');
    }
  }

  lines.push('## Counterevidence', '');
  const challenges = content.links.filter((link) => link.stance === 'challenges');
  if (!challenges.length) lines.push('No challenging relationships are recorded. This does not establish that the conclusion is correct.', '');
  else {
    for (const link of challenges) {
      const evidence = nodes.get(link.evidenceId);
      const claim = nodes.get(link.claimId);
      if (evidence && claim) lines.push(`- ${describe(evidence)} Challenges “${escapeMarkdown(claim.title)}”: ${escapeMarkdown(link.reason)}`);
    }
    lines.push('');
  }

  const linkedEvidence = new Set(content.links.map((link) => link.evidenceId));
  const unlinked = content.nodes.filter((node) => node.kind === 'evidence' && !linkedEvidence.has(node.id));
  lines.push('## Unlinked evidence', '');
  if (!unlinked.length) lines.push('Every evidence node has at least one recorded claim relationship.', '');
  else {
    lines.push('The following accepted evidence has not yet been assigned to a claim. No supporting or challenging relationship is inferred.', '');
    unlinked.forEach((node) => lines.push(`- ${describe(node)}`));
    lines.push('');
  }

  lines.push('## Conflicts', '');
  if (!content.conflicts.length) lines.push('No conflicts have been recorded. This is not proof that no conflicts exist.', '');
  for (const conflict of content.conflicts) {
    lines.push(`- **${conflict.resolved ? 'Resolved' : 'Unresolved'}: ${escapeMarkdown(conflict.title)}.** ${escapeMarkdown(conflict.description)}`,
      `  Involves: ${conflict.nodeIds.map((id) => nodes.get(id)).filter((node): node is BoardNode => Boolean(node)).map((node) => `${escapeMarkdown(node.title)}${cite(node)}`).join('; ')}.`);
  }
  if (content.conflicts.length) lines.push('');

  lines.push('## Open questions', '');
  const questions = content.nodes.filter((node) => node.kind === 'question');
  if (!questions.length) lines.push('No open questions have been recorded.', '');
  else {
    questions.forEach((question) => lines.push(`- ${describe(question)}`));
    lines.push('');
  }

  lines.push('## Source register', '');
  if (!content.sources.length) lines.push('No sources have been added. Claims are not source-backed until evidence is recorded.', '');
  for (const source of content.sources) {
    const number = sourceNumbers.get(source.id);
    const attached = content.nodes.some((node) => node.sourceId === source.id);
    const safeUrl = source.url ? new URL(source.url).href.replace(/[()]/g, (character) => character === '(' ? '%28' : '%29') : null;
    lines.push(`### [S${number}] ${escapeMarkdown(source.title)}`, '',
      `${escapeMarkdown(source.publisher)} · ${source.date || 'Date not recorded'} · Recorded reliability: ${source.reliability}${source.fictional ? ' · **Fictional fixture**' : ''}.`, '',
      `Recorded excerpt: ${escapeMarkdown(source.excerpt)}`, '');
    if (safeUrl) lines.push(`Source link: [Open source](<${safeUrl}>)`, '');
    if (!attached) lines.push('This source is in the accepted register but is not currently cited by a board node. It has not been treated as evidence for a claim.', '');
  }
  return { title: content.title, revision, generatedAt, markdown: `${lines.join('\n').trim()}\n`, sourceIds: content.sources.map((source) => source.id) };
}
