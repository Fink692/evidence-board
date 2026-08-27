import { useEffect, useMemo, useRef } from 'react';
import {
  ArrowDownLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronRight,
  CircleHelp, GitCompareArrows, Link2Off, SearchX, Sparkles, UserRound,
} from 'lucide-react';
import type { BoardNode, BoardState, BoardStore, EvidenceLink, Stance } from '../domain/types';
import { getNodeRelations, getVisibleNodes } from '../domain/selectors';
import '../styles/evidence-views.css';

interface EvidenceViewProps { state: BoardState; store: BoardStore }

const STANCE_LABELS: Record<Stance, string> = { supports: 'Supports', challenges: 'Challenges', context: 'Context' };

function StanceIcon({ stance, size = 13 }: { stance: Stance; size?: number }) {
  return stance === 'supports' ? <ArrowUpRight size={size} /> : stance === 'challenges'
    ? <ArrowDownLeft size={size} /> : <GitCompareArrows size={size} />;
}

function EvidenceRow({ node, link, state, store }: EvidenceViewProps & { node: BoardNode; link?: EvidenceLink }) {
  const { source, links, conflicts } = getNodeRelations(state.content, node.id);
  const isFocused = state.focusedNodeIds.includes(node.id);
  const isSelected = state.selectedNodeId === node.id;
  const sourceNumber = state.content.sources.findIndex(item => item.id === source?.id) + 1;
  const activeConflicts = conflicts.filter(conflict => !conflict.resolved);
  const connections = link ? [link] : links;

  return (
    <li className={`eb-list-evidence${isFocused ? ' is-focused' : ''}${isSelected ? ' is-selected' : ''}`}>
      <button type="button" className="eb-list-evidence-button" data-node-id={node.id} aria-pressed={isSelected} onClick={() => store.selectNode(node.id)}>
        <span className={`eb-list-evidence-symbol eb-list-evidence-symbol--${link?.stance ?? (links.length ? 'context' : 'unlinked')}`} aria-hidden="true">
          {link ? <StanceIcon stance={link.stance} size={17} /> : links.length ? <BookOpen size={17} /> : <Link2Off size={17} />}
        </span>
        <span className="eb-list-evidence-copy">
          <span className="eb-list-evidence-eyebrow">
            {link ? <span className={`eb-list-stance eb-list-stance--${link.stance}`}><StanceIcon stance={link.stance} />{STANCE_LABELS[link.stance]}</span>
              : !links.length ? <span className="eb-list-stance eb-list-stance--unlinked"><Link2Off size={12} />Not yet connected</span>
                : <span className="eb-list-kind">Evidence</span>}
            {isFocused && <span className="eb-list-focus-chip"><Sparkles size={11} />In focus</span>}
            {activeConflicts.length > 0 && <span className="eb-list-conflict-label"><GitCompareArrows size={12} />Unresolved conflict</span>}
          </span>
          <span className="eb-list-evidence-title">{node.title}</span>
          <span className="eb-list-evidence-body">{node.body}</span>
          {connections.length > 0 && <span className="eb-list-reasons">{connections.map(connection => (
            <span key={connection.id} className="eb-list-reason">
              <ArrowRight size={12} aria-hidden="true" />
              <span>{!link && <strong>{STANCE_LABELS[connection.stance]} “{state.content.nodes.find(item => item.id === connection.claimId)?.title ?? 'linked claim'}”. </strong>}{connection.reason}</span>
            </span>
          ))}</span>}
          <span className="eb-list-source-line">
            <BookOpen size={12} aria-hidden="true" />
            <span>{source ? <><span className="eb-list-source-number">S{String(sourceNumber).padStart(2, '0')}</span> {source.title}</> : 'No source attached'}</span>
          </span>
          <span className="eb-list-evidence-meta">
            {source && <span>{source.publisher}{source.date ? ` · ${source.date}` : ''}</span>}
            <span>{node.confidence} confidence</span>
            <span>{node.createdBy !== 'human' ? <Sparkles size={11} /> : <UserRound size={11} />}{node.createdBy === 'sample' ? 'Sample contribution' : node.createdBy === 'agent' ? 'Agent contribution' : 'Researcher contribution'}</span>
          </span>
        </span>
        <ChevronRight className="eb-list-open-icon" size={17} aria-hidden="true" />
      </button>
    </li>
  );
}

function ClaimGroup({ claim, index, visibleIds, state, store }: EvidenceViewProps & { claim: BoardNode; index: number; visibleIds: Set<string> }) {
  const { links } = getNodeRelations(state.content, claim.id);
  const visibleLinks = links.filter(link => visibleIds.has(link.evidenceId));
  const stanceOrder = { supports: 0, challenges: 1, context: 2 };
  const orderedLinks = [...visibleLinks].sort((a, b) => stanceOrder[a.stance] - stanceOrder[b.stance]);
  const supportCount = links.filter(link => link.stance === 'supports').length;
  const challengeCount = links.filter(link => link.stance === 'challenges').length;
  const isSelected = state.selectedNodeId === claim.id;
  const isFocused = state.focusedNodeIds.includes(claim.id);
  const headingId = `eb-list-claim-${claim.id}`;

  return (
    <section className={`eb-list-group${isSelected ? ' is-selected' : ''}${isFocused ? ' is-focused' : ''}`} aria-labelledby={headingId}>
      <h3 className="eb-views-sr-only" id={headingId}>{claim.title}</h3>
      <button type="button" className="eb-list-claim" data-node-id={claim.id} aria-pressed={isSelected} onClick={() => store.selectNode(claim.id)}>
        <span className="eb-list-claim-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <span className="eb-list-claim-copy">
          <span className="eb-list-claim-topline"><span className="eb-list-kind"><Check size={12} />Claim</span><span className={`eb-list-confidence eb-list-confidence--${claim.confidence}`}>{claim.confidence} confidence</span>{isFocused && <span className="eb-list-focus-chip"><Sparkles size={11} />In focus</span>}</span>
          <span className="eb-list-claim-title">{claim.title}</span>
          <span className="eb-list-claim-body">{claim.body}</span>
          <span className="eb-list-claim-counts">
            <span><ArrowUpRight size={12} />{supportCount} supporting</span>
            <span className={challengeCount ? 'has-challenges' : ''}><ArrowDownLeft size={12} />{challengeCount} challenging</span>
            {links.some(link => link.stance === 'context') && <span><GitCompareArrows size={12} />{links.filter(link => link.stance === 'context').length} context</span>}
          </span>
        </span>
        <ChevronRight className="eb-list-open-icon" size={18} aria-hidden="true" />
      </button>
      {orderedLinks.length > 0 ? <ul className="eb-list-evidence-items" aria-label={`Evidence connected to ${claim.title}`}>
        {orderedLinks.map(link => {
          const node = state.content.nodes.find(item => item.id === link.evidenceId);
          return node ? <EvidenceRow key={link.id} node={node} link={link} state={state} store={store} /> : null;
        })}
      </ul> : <div className="eb-list-claim-empty"><Link2Off size={15} /><span>{links.length ? 'Connected evidence is outside the current filter.' : 'This claim is still waiting for evidence.'}</span></div>}
    </section>
  );
}

export function EvidenceList({ state, store }: EvidenceViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const visible = useMemo(() => getVisibleNodes(state), [state.content, state.filter, state.query]);
  const visibleIds = useMemo(() => new Set(visible.map(node => node.id)), [visible]);
  const claims = visible.filter(node => node.kind === 'claim');
  const questions = visible.filter(node => node.kind === 'question');
  const claimIds = new Set(claims.map(node => node.id));
  const otherEvidence = visible.filter(node => node.kind === 'evidence' && !state.content.links.some(link => link.evidenceId === node.id && claimIds.has(link.claimId)));
  const allOtherUnlinked = otherEvidence.every(node => !state.content.links.some(link => link.evidenceId === node.id));
  const conflicts = state.content.conflicts.filter(conflict => !conflict.resolved && conflict.nodeIds.some(id => visibleIds.has(id)));
  const focusKey = state.focusedNodeIds.join('|');

  useEffect(() => {
    const elements = root.current?.querySelectorAll<HTMLElement>('[data-node-id]');
    if (!elements || !focusKey) return;
    const first = Array.from(elements).find(element => state.focusedNodeIds.includes(element.dataset.nodeId ?? ''));
    if (first) first.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  }, [focusKey, state.focusedNodeIds]);

  if (!visible.length) {
    const filtered = Boolean(state.query || state.filter !== 'all');
    return <div className="eb-list eb-list-empty">
      {filtered ? <SearchX size={30} strokeWidth={1.2} /> : <CircleHelp size={30} strokeWidth={1.2} />}
      <h3>{filtered ? 'No evidence in this view.' : 'Start with something worth questioning.'}</h3>
      <p>{filtered ? 'A broader search may uncover what you’re looking for.' : 'Add a claim, observation, or open question. Your argument will take shape here.'}</p>
      {filtered && <button type="button" className="eb-views-clear" onClick={() => { store.setFilter('all'); store.setQuery(''); }}>Clear filters</button>}
    </div>;
  }

  return (
    <div className="eb-list" ref={root}>
      <div className="eb-list-intro"><div><span className="eb-list-eyebrow">A closer reading</span><h2>Follow the argument.</h2></div><span className="eb-list-total">{visible.length} research cards</span></div>
      <div className="eb-list-groups">{claims.map((claim, index) => <ClaimGroup key={claim.id} claim={claim} index={index} visibleIds={visibleIds} state={state} store={store} />)}</div>
      {otherEvidence.length > 0 && <section className="eb-list-loose-section" aria-labelledby="eb-list-other-heading">
        <div className="eb-list-section-heading"><span className="eb-list-section-icon"><Link2Off size={17} /></span><div><h3 id="eb-list-other-heading">{allOtherUnlinked ? 'Evidence awaiting a connection' : 'Other evidence in this view'}</h3><p>{allOtherUnlinked ? 'Observations that haven’t found their place in the argument yet.' : 'These observations connect to claims outside the current view.'}</p></div><span className="eb-list-section-count">{otherEvidence.length}</span></div>
        <ul className="eb-list-loose-items">{otherEvidence.map(node => <EvidenceRow key={node.id} node={node} state={state} store={store} />)}</ul>
      </section>}
      {conflicts.length > 0 && <section className="eb-list-tensions" aria-labelledby="eb-list-conflicts-heading">
        <div className="eb-list-section-heading"><span className="eb-list-section-icon"><GitCompareArrows size={17} /></span><div><h3 id="eb-list-conflicts-heading">Points of tension</h3><p>A useful conclusion makes room for contradictions.</p></div><span className="eb-list-section-count">{conflicts.length}</span></div>
        {conflicts.map(conflict => <article className="eb-list-conflict" key={conflict.id}>
          <h4>{conflict.title}</h4><p>{conflict.description}</p>
          <div className="eb-list-conflict-nodes">{conflict.nodeIds.map(id => {
            const node = state.content.nodes.find(item => item.id === id);
            return node ? <button type="button" key={id} onClick={() => store.selectNode(id)}>{node.title}<ArrowUpRight size={13} /></button> : null;
          })}</div>
        </article>)}
      </section>}
      {questions.length > 0 && <section className="eb-list-questions" aria-labelledby="eb-list-questions-heading">
        <div className="eb-list-section-heading"><span className="eb-list-section-icon"><CircleHelp size={18} /></span><div><h3 id="eb-list-questions-heading">What we still don’t know</h3><p>Keep the unanswered questions in the conversation.</p></div><span className="eb-list-section-count">{questions.length}</span></div>
        <div className="eb-list-question-grid">{questions.map(node => <button
          type="button" key={node.id} data-node-id={node.id}
          className={`eb-list-question${state.selectedNodeId === node.id ? ' is-selected' : ''}${state.focusedNodeIds.includes(node.id) ? ' is-focused' : ''}`}
          aria-pressed={state.selectedNodeId === node.id} onClick={() => store.selectNode(node.id)}
        >
          <span className="eb-list-question-top"><span><CircleHelp size={13} />Open question</span>{state.focusedNodeIds.includes(node.id) ? <span className="eb-list-focus-chip"><Sparkles size={11} />In focus</span> : <ArrowUpRight size={15} />}</span>
          <span className="eb-list-question-title">{node.title}</span><span className="eb-list-question-body">{node.body}</span>
        </button>)}</div>
      </section>}
      <p className="eb-list-endnote"><BookOpen size={13} />Every observation keeps a path back to its source.</p>
      <span className="eb-views-sr-only" role="status">{visible.length} research cards visible.</span>
    </div>
  );
}
