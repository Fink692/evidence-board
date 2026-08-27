import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Background, BackgroundVariant, BaseEdge, Handle, MarkerType, Panel,
  Position, ReactFlow, ReactFlowProvider, useNodesInitialized, useReactFlow,
  useViewport, type Edge, type EdgeProps, type Node, type NodeChange, type NodeProps,
} from '@xyflow/react';
import {
  ArrowDown, ArrowDownLeft, ArrowUpRight, BookOpen, Check, CircleHelp, GitCompareArrows,
  Info, Link2Off, List, Maximize2, Minus, Plus, Sparkles, UserRound, X,
} from 'lucide-react';
import type { BoardNode, BoardState, BoardStore, EvidenceLink, Source, Stance } from '../domain/types';
import { getNodeRelations, getVisibleNodes } from '../domain/selectors';
import '@xyflow/react/dist/style.css';
import '../styles/evidence-views.css';

interface EvidenceViewProps { state: BoardState; store: BoardStore }

type ResearchNodeData = {
  node: BoardNode;
  source: Source | null;
  sourceNumber: number;
  number: number;
  links: EvidenceLink[];
  conflictCount: number;
  isSelected: boolean;
  isFocused: boolean;
  onSelect: (id: string) => void;
  onKeyboardFocus: (id: string) => void;
} & Record<string, unknown>;

type ResearchNode = Node<ResearchNodeData, 'research'>;
type RelationshipEdge = Edge<{ stance: Stance; lane: number } & Record<string, unknown>, 'relationship'>;

const CARD_WIDTH = 292;
const COLUMN_STEP = 356;
const STANCE_LABELS: Record<Stance, string> = {
  supports: 'Supports', challenges: 'Challenges', context: 'Context',
};

function StanceIcon({ stance }: { stance: Stance }) {
  return stance === 'supports' ? <ArrowUpRight size={12} />
    : stance === 'challenges' ? <ArrowDownLeft size={12} />
      : <GitCompareArrows size={12} />;
}

const ResearchCard = memo(function ResearchCard({ data }: NodeProps<ResearchNode>) {
  const { node, source, sourceNumber, number, links, isSelected, isFocused } = data;
  const stances = (['supports', 'challenges', 'context'] as Stance[])
    .map(stance => ({ stance, count: links.filter(link => link.stance === stance).length }))
    .filter(item => item.count > 0);
  const Icon = node.kind === 'claim' ? Check : node.kind === 'question' ? CircleHelp : BookOpen;
  const kindLabel = node.kind === 'claim' ? `Claim ${String(number).padStart(2, '0')}`
    : node.kind === 'question' ? 'Open question'
      : source ? `Source ${String(sourceNumber).padStart(2, '0')}` : 'Unsourced evidence';
  const relationshipLabel = stances.map(({ stance, count }) => `${count} ${STANCE_LABELS[stance].toLowerCase()} connections`).join(', ');

  return (
    <div className={`eb-map-node eb-map-node--${node.kind}${isSelected ? ' is-selected' : ''}${isFocused ? ' is-focused' : ''}`}>
      <Handle type="target" position={Position.Left} id="in" isConnectable={false} />
      <Handle type="source" position={Position.Left} id="out" isConnectable={false} />
      <button
        type="button"
        className="eb-map-card nodrag nopan"
        onClick={event => { event.stopPropagation(); data.onSelect(node.id); }}
        onFocus={event => {
          if (event.currentTarget.matches(':focus-visible')) data.onKeyboardFocus(node.id);
        }}
        aria-pressed={isSelected}
        aria-label={`${node.kind}: ${node.title}. ${source ? `Source: ${source.title}. ` : ''}${node.confidence} confidence. ${relationshipLabel || (node.kind === 'evidence' ? 'Not connected to a claim.' : '')} Open details.`}
        data-node-id={node.id}
      >
        <span className="eb-map-card-topline">
          <span className="eb-map-card-kind" title={source?.title}><Icon size={12} strokeWidth={1.7} />{kindLabel}</span>
          {isFocused ? <span className="eb-map-focus-chip"><Sparkles size={10} />Focus</span>
            : data.conflictCount > 0 ? <span className="eb-map-conflict-chip" title={`${data.conflictCount} unresolved conflict${data.conflictCount === 1 ? '' : 's'}`}><GitCompareArrows size={12} /><span className="eb-views-sr-only">Unresolved conflict</span></span>
              : node.kind !== 'question' ? <span className={`eb-map-confidence eb-map-confidence--${node.confidence}`}>{node.confidence} confidence</span> : null}
        </span>
        <span className="eb-map-card-title">{node.title}</span>
        {node.kind === 'evidence' && <span className="eb-map-card-source" title={source?.title}>{source?.title ?? 'No source attached'}</span>}
        <span className="eb-map-card-footer">
          <span className="eb-map-card-stances">
            {node.kind === 'question' ? <span className="eb-map-question-caption">Room for a better answer</span>
              : stances.length ? stances.slice(0, 2).map(({ stance, count }) => (
                <span key={stance} className={`eb-map-stance eb-map-stance--${stance}`}>
                  <StanceIcon stance={stance} />{STANCE_LABELS[stance]}{count > 1 ? ` ${count}` : ''}
                </span>
              )) : <span className="eb-map-unlinked"><Link2Off size={11} />{node.kind === 'evidence' ? 'Not yet connected' : 'Needs evidence'}</span>}
          </span>
          <span className="eb-map-provenance" title={node.createdBy === 'sample' ? 'Illustrative sample prepared by Codex' : node.createdBy === 'agent' ? 'Agent contribution, approved by a researcher' : 'Added by a researcher'}>
            {node.createdBy !== 'human' ? <Sparkles size={12} /> : <UserRound size={12} />}
            <span className="eb-views-sr-only">{node.createdBy === 'sample' ? 'Sample contribution' : node.createdBy === 'agent' ? 'Agent contribution' : 'Researcher contribution'}</span>
          </span>
        </span>
      </button>
    </div>
  );
});

function roundedRoute(points: [number, number][], radius = 9): string {
  let path = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const before = points[i - 1];
    const point = points[i];
    const after = points[i + 1];
    const inLength = Math.hypot(point[0] - before[0], point[1] - before[1]);
    const outLength = Math.hypot(after[0] - point[0], after[1] - point[1]);
    const bend = Math.min(radius, inLength / 2, outLength / 2);
    if (!inLength || !outLength) continue;
    const entry = [point[0] - (point[0] - before[0]) / inLength * bend, point[1] - (point[1] - before[1]) / inLength * bend];
    const exit = [point[0] + (after[0] - point[0]) / outLength * bend, point[1] + (after[1] - point[1]) / outLength * bend];
    path += ` L ${entry[0]} ${entry[1]} Q ${point[0]} ${point[1]} ${exit[0]} ${exit[1]}`;
  }
  return `${path} L ${points.at(-1)![0]} ${points.at(-1)![1]}`;
}

function ResearchRelationship({ id, sourceX, sourceY, targetX, targetY, markerEnd, style, data }: EdgeProps<RelationshipEdge>) {
  const lane = data?.lane ?? 0;
  const sameColumn = Math.abs(sourceX - targetX) < 2;
  const gutter = 30 + lane * 6;
  const routeY = targetY + 90 + lane * 8;
  const path = sameColumn
    ? `M ${sourceX} ${sourceY} C ${sourceX - gutter * 1.7} ${sourceY}, ${targetX - gutter * 1.7} ${targetY}, ${targetX} ${targetY}`
    : roundedRoute([
      [sourceX, sourceY], [sourceX - gutter, sourceY], [sourceX - gutter, routeY],
      [targetX - gutter, routeY], [targetX - gutter, targetY], [targetX, targetY],
    ]);
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} interactionWidth={16} />;
}

const nodeTypes = { research: ResearchCard };
const edgeTypes = { relationship: ResearchRelationship };

/** Group a claim with its observations, keeping new and unlinked evidence visible. */
function placeNodes(content: BoardState['content'], visible: BoardNode[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const claims = visible.filter(node => node.kind === 'claim');
  const evidence = visible.filter(node => node.kind === 'evidence');
  const questions = visible.filter(node => node.kind === 'question');
  const columnCount = Math.max(1, Math.min(3, claims.length || Math.min(evidence.length || questions.length, 3)));
  const rows = Array.from({ length: columnCount }, () => 0);
  const claimColumns = new Map<string, number>();
  const claimRows = Math.max(1, Math.ceil(claims.length / columnCount));

  claims.forEach((claim, index) => {
    const column = index % columnCount;
    claimColumns.set(claim.id, column);
    positions.set(claim.id, { x: 40 + column * COLUMN_STEP, y: Math.floor(index / columnCount) * 194 });
  });

  const evidenceStart = claims.length ? (claimRows - 1) * 194 + 212 : 0;
  evidence.forEach(node => {
    const relatedLinks = content.links.filter(link => link.evidenceId === node.id && claimColumns.has(link.claimId));
    const stanceRank = { supports: 0, challenges: 1, context: 2 };
    const bestRank = Math.min(...relatedLinks.map(link => stanceRank[link.stance]));
    const relatedColumns = relatedLinks.filter(link => stanceRank[link.stance] === bestRank)
      .map(link => claimColumns.get(link.claimId)!);
    const candidates = relatedColumns.length ? [...new Set(relatedColumns)] : rows.map((_, column) => column);
    const column = candidates.reduce((best, candidate) => rows[candidate] < rows[best] ? candidate : best, candidates[0]);
    positions.set(node.id, { x: 40 + column * COLUMN_STEP, y: evidenceStart + rows[column] * 176 });
    rows[column] += 1;
  });

  const questionStart = evidence.length ? evidenceStart + Math.max(...rows) * 176 + 24
    : claims.length ? claimRows * 194 + 20 : 0;
  const questionColumns = Math.min(questions.length, Math.max(columnCount, 2));
  const questionOffset = Math.max(0, ((columnCount - questionColumns) * COLUMN_STEP) / 2);
  questions.forEach((node, index) => {
    positions.set(node.id, {
      x: 40 + questionOffset + (index % questionColumns) * COLUMN_STEP,
      y: questionStart + Math.floor(index / questionColumns) * 148,
    });
  });
  return positions;
}

function EmptyMap({ state, store }: EvidenceViewProps) {
  const filtered = Boolean(state.query || state.filter !== 'all');
  return (
    <div className="eb-map eb-map-empty">
      <span className="eb-map-empty-illustration"><CircleHelp size={32} strokeWidth={1.1} /></span>
      <h3>{filtered ? 'No evidence in this view.' : 'A question is a good beginning.'}</h3>
      <p>{filtered ? 'Try another search, or bring the whole argument back into view.' : 'Add your first claim, a source worth reading, or a question you haven’t answered yet.'}</p>
      {filtered && <button type="button" className="eb-views-clear" onClick={() => { store.setFilter('all'); store.setQuery(''); }}>Clear filters</button>}
    </div>
  );
}

function MapCanvas({ state, store }: EvidenceViewProps) {
  const flow = useReactFlow<ResearchNode, RelationshipEdge>();
  const { zoom, y: viewportY } = useViewport();
  const initialized = useNodesInitialized();
  const [showGuide, setShowGuide] = useState(false);
  const [measurements, setMeasurements] = useState<Record<string, { width: number; height: number }>>({});
  const instructionsId = useId();
  const guideId = useId();
  const canvasRoot = useRef<HTMLDivElement>(null);
  const lastFit = useRef({ structure: '', filter: '', focus: '' });
  const visible = useMemo(() => getVisibleNodes(state), [state.content, state.filter, state.query]);
  const positions = useMemo(() => placeNodes(state.content, visible), [state.content, visible]);
  const reducedMotion = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const nodes = useMemo<ResearchNode[]>(() => visible.map(node => {
    const relations = getNodeRelations(state.content, node.id);
    return {
      id: node.id,
      type: 'research',
      position: positions.get(node.id)!,
      width: CARD_WIDTH,
      height: node.kind === 'claim' ? 164 : node.kind === 'evidence' ? 154 : 126,
      ...(measurements[node.id] ? { measured: measurements[node.id] } : {}),
      draggable: false,
      selectable: false,
      focusable: false,
      data: {
        node,
        source: relations.source,
        sourceNumber: state.content.sources.findIndex(source => source.id === node.sourceId) + 1,
        number: state.content.nodes.filter(item => item.kind === node.kind).findIndex(item => item.id === node.id) + 1,
        links: relations.links,
        conflictCount: relations.conflicts.filter(conflict => !conflict.resolved).length,
        isSelected: state.selectedNodeId === node.id,
        isFocused: state.focusedNodeIds.includes(node.id),
        onSelect: store.selectNode,
        onKeyboardFocus: id => { void flow.fitView({ nodes: [{ id }], padding: 0.3, maxZoom: 1, duration: 0 }); },
      },
    };
  }), [visible, positions, state.content, state.selectedNodeId, state.focusedNodeIds, store, flow, measurements]);

  // React Flow reports real DOM dimensions even when dragging and editing are disabled.
  // Preserve those measurements in this controlled graph so fit-to-region can initialize.
  const onNodesChange = useCallback((changes: NodeChange<ResearchNode>[]) => {
    setMeasurements(current => {
      let next = current;
      for (const change of changes) {
        if (change.type !== 'dimensions' || !change.dimensions) continue;
        const previous = current[change.id];
        if (previous?.width === change.dimensions.width && previous?.height === change.dimensions.height) continue;
        if (next === current) next = { ...current };
        next[change.id] = change.dimensions;
      }
      return next;
    });
  }, []);

  const edges = useMemo<RelationshipEdge[]>(() => {
    const ids = new Set(visible.map(node => node.id));
    return state.content.links.filter(link => ids.has(link.evidenceId) && ids.has(link.claimId)).map((link, index) => {
      const color = link.stance === 'challenges' ? '#b0693d' : link.stance === 'context' ? '#8b9186' : '#719381';
      const evidenceTitle = state.content.nodes.find(node => node.id === link.evidenceId)?.title ?? link.evidenceId;
      const claimTitle = state.content.nodes.find(node => node.id === link.claimId)?.title ?? link.claimId;
      return {
        id: link.id,
        type: 'relationship',
        source: link.evidenceId,
        sourceHandle: 'out',
        target: link.claimId,
        targetHandle: 'in',
        selectable: false,
        focusable: true,
        ariaLabel: `${evidenceTitle} ${link.stance} ${claimTitle}. ${link.reason}`,
        data: { stance: link.stance, lane: index % 3 },
        markerEnd: { type: MarkerType.ArrowClosed, width: 12, height: 12, color },
        style: { stroke: color, strokeWidth: link.stance === 'challenges' ? 1.6 : 1.35, strokeDasharray: link.stance === 'challenges' ? '5 4' : link.stance === 'context' ? '2 4' : undefined },
      };
    });
  }, [state.content, visible]);

  const structureKey = nodes.map(node => `${node.id}:${node.position.x},${node.position.y}`).join('|');
  const filterKey = `${state.filter}:${state.query}`;
  const focusKey = state.focusedNodeIds.join('|');

  useEffect(() => {
    if (!initialized || !nodes.length) return;
    const previous = lastFit.current;
    const focusChanged = previous.focus !== focusKey;
    const layoutChanged = previous.structure !== structureKey || previous.filter !== filterKey;
    if (!layoutChanged && !focusChanged) return;
    const focused = state.focusedNodeIds.filter(id => nodes.some(node => node.id === id));
    const frame = requestAnimationFrame(() => {
      lastFit.current = { structure: structureKey, filter: filterKey, focus: focusKey };
      const duration = reducedMotion || !previous.structure ? 0 : 320;
      if (focusChanged && focused.length) {
        void flow.fitView({ nodes: focused.map(id => ({ id })), padding: 0.25, minZoom: 0.72, maxZoom: 1.12, duration });
      } else if (state.filter === 'all' && !state.query) {
        // Fit the argument's width, not its full length: sources should remain readable.
        // Lower observations are intentionally reached by panning or the explicit Fit control.
        const width = canvasRoot.current?.clientWidth ?? 1000;
        const minX = Math.min(...nodes.map(node => node.position.x));
        const minY = Math.min(...nodes.map(node => node.position.y));
        const graphWidth = Math.max(...nodes.map(node => node.position.x + CARD_WIDTH)) - minX;
        const readableZoom = Math.max(0.86, Math.min(0.96, (width - 72) / graphWidth));
        void flow.setViewport({
          x: Math.max(22, (width - graphWidth * readableZoom) / 2) - minX * readableZoom,
          y: 68 - minY * readableZoom,
          zoom: readableZoom,
        }, { duration });
      } else {
        void flow.fitView({ padding: 0.15, minZoom: 0.72, maxZoom: 0.96, duration });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [initialized, structureKey, filterKey, focusKey, nodes, state.focusedNodeIds, flow, reducedMotion]);

  const fitAll = () => { void flow.fitView({ padding: 0.13, maxZoom: 0.96, duration: reducedMotion ? 0 : 320 }); };
  const canvasHeight = canvasRoot.current?.clientHeight ?? 600;
  const hasMoreBelow = nodes.some(node => (node.position.y + (node.height ?? 154)) * zoom + viewportY > canvasHeight - 40);

  if (!nodes.length) return <EmptyMap state={state} store={store} />;

  return (
    <div className="eb-map" ref={canvasRoot} data-map-ready={initialized ? 'true' : 'false'} aria-label="Interactive evidence map" aria-describedby={instructionsId}>
      <p className="eb-views-sr-only" id={instructionsId}>Tab through research cards and press Enter to inspect their evidence and sources. Drag the background to explore. Use the zoom controls to change the view. An equivalent structured list is available.</p>
      <ReactFlow<ResearchNode, RelationshipEdge>
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable
        elementsSelectable={false}
        deleteKeyCode={null}
        minZoom={0.25}
        maxZoom={1.65}
        defaultViewport={{ x: 25, y: 68, zoom: 0.86 }}
        onPaneClick={() => store.selectNode(null)}
        onEdgeClick={(_, edge) => store.selectNode(edge.source)}
        onNodeClick={(_, node) => store.selectNode(node.id)}
        proOptions={{ hideAttribution: true }}
        colorMode="light"
      >
        <Background variant={BackgroundVariant.Dots} color="#d4d9cc" gap={20} size={1.15} />
        <Panel position="top-left" className="eb-map-legend" aria-label="Connection legend">
          <span><i className="eb-map-legend-line eb-map-legend-line--supports" />Supports</span>
          <span><i className="eb-map-legend-line eb-map-legend-line--challenges" />Challenges</span>
          <span><i className="eb-map-legend-line eb-map-legend-line--context" />Context</span>
        </Panel>
        <Panel position="top-right" className="eb-map-guide-panel">
          <button type="button" className="eb-map-icon-button eb-map-guide-toggle" onClick={() => setShowGuide(value => !value)} aria-expanded={showGuide} aria-controls={guideId} aria-label="How to read this map"><Info size={16} /></button>
          {showGuide && <div className="eb-map-guide" id={guideId} role="note">
            <button type="button" className="eb-map-guide-close" onClick={() => setShowGuide(false)} aria-label="Close map guide"><X size={14} /></button>
            <strong>A map of the reasoning.</strong>
            <p>Claims sit above their evidence. Follow an arrow to see what an observation supports or challenges.</p>
            <p>Select any card to read its source, relationships, and full reasoning.</p>
            <button type="button" onClick={() => store.setView('list')}><List size={14} />Read as a structured list</button>
          </div>}
        </Panel>
        <Panel position="bottom-left" className="eb-map-controls" aria-label="Map controls">
          <button type="button" aria-label="Zoom out" onClick={() => { void flow.zoomOut({ duration: reducedMotion ? 0 : 160 }); }} disabled={zoom <= 0.255}><Minus size={16} /></button>
          <span className="eb-map-zoom" aria-live="off">{Math.round(zoom * 100)}%</span>
          <button type="button" aria-label="Zoom in" onClick={() => { void flow.zoomIn({ duration: reducedMotion ? 0 : 160 }); }} disabled={zoom >= 1.64}><Plus size={16} /></button>
          <span className="eb-map-controls-divider" />
          <button type="button" className="eb-map-fit" aria-label="Fit all visible cards" onClick={fitAll}><Maximize2 size={14} /><span>Fit</span></button>
        </Panel>
        <Panel position="bottom-right" className="eb-map-caption">
          {state.focusedNodeIds.length > 0 && <span className="eb-map-focus-indicator"><Sparkles size={11} />{state.focusedNodeIds.filter(id => visible.some(node => node.id === id)).length} in focus</span>}
          <span>{visible.length} cards<span aria-hidden="true"> · </span>{edges.length} connections</span>
        </Panel>
        {hasMoreBelow && <Panel position="bottom-center" className="eb-map-explore-panel">
          <button type="button" className="eb-map-explore" aria-label="Explore evidence below" title="More evidence below" onClick={() => {
            void flow.setViewport({ ...flow.getViewport(), y: flow.getViewport().y - canvasHeight * 0.6 }, { duration: reducedMotion ? 0 : 320 });
          }}><span>More evidence below</span><ArrowDown size={13} /></button>
        </Panel>}
      </ReactFlow>
      <span className="eb-views-sr-only" role="status">{visible.length} research cards visible. {state.focusedNodeIds.length > 0 ? `${state.focusedNodeIds.length} cards highlighted.` : ''}</span>
    </div>
  );
}

export function EvidenceMap(props: EvidenceViewProps) {
  return <ReactFlowProvider><MapCanvas {...props} /></ReactFlowProvider>;
}
