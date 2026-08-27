export type NodeKind = 'claim' | 'evidence' | 'question';
export type Stance = 'supports' | 'challenges' | 'context';
export type Actor = 'human' | 'agent' | 'sample';
export type Confidence = 'high' | 'medium' | 'low';
export type ViewMode = 'map' | 'list';
export type BoardFilter = 'all' | 'claim' | 'evidence' | 'question' | 'conflicts' | 'gaps';
export type WorkspacePage = 'board' | 'sources' | 'brief' | 'activity';

export interface Source {
  id: string;
  title: string;
  publisher: string;
  date: string;
  url?: string;
  excerpt: string;
  reliability: Confidence;
  fictional: boolean;
}

export interface BoardNode {
  id: string;
  kind: NodeKind;
  title: string;
  body: string;
  sourceId?: string;
  confidence: Confidence;
  createdBy: Actor;
  createdAt: string;
  position: { x: number; y: number };
}

export interface EvidenceLink {
  id: string;
  evidenceId: string;
  claimId: string;
  stance: Stance;
  reason: string;
  createdBy: Actor;
}

export interface Conflict {
  id: string;
  title: string;
  description: string;
  nodeIds: string[];
  resolved: boolean;
  createdBy: Actor;
}

export interface BoardContent {
  id: string;
  title: string;
  question: string;
  description: string;
  conclusion: string;
  nodes: BoardNode[];
  links: EvidenceLink[];
  sources: Source[];
  conflicts: Conflict[];
}

export type Operation =
  | { type: 'create_node'; node: BoardNode; source?: Source }
  | { type: 'update_node'; nodeId: string; patch: Partial<Pick<BoardNode, 'title' | 'body' | 'confidence'>> }
  | { type: 'delete_node'; nodeId: string }
  | { type: 'link_evidence'; link: EvidenceLink }
  | { type: 'unlink_evidence'; linkId: string }
  | { type: 'flag_conflict'; conflict: Conflict }
  | { type: 'resolve_conflict'; conflictId: string; resolved: boolean }
  | { type: 'set_conclusion'; conclusion: string };

export interface ProposedChange {
  id: string;
  title: string;
  rationale: string;
  operation: Operation;
  selected: boolean;
}

export interface ChangeSet {
  id: string;
  title: string;
  summary: string;
  baseRevision: number;
  changes: ProposedChange[];
  createdAt: string;
  status: 'pending' | 'applied' | 'rejected' | 'undone';
}

export interface ActivityEntry {
  id: string;
  timestamp: string;
  actor: Actor | 'system' | 'demo';
  title: string;
  detail: string;
  status: 'running' | 'complete' | 'error' | 'cancelled';
  tool?: string;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
}

export interface DecisionBrief {
  title: string;
  revision: number;
  generatedAt: string;
  markdown: string;
  sourceIds: string[];
}

export interface BoardState {
  content: BoardContent;
  revision: number;
  selectedNodeId: string | null;
  focusedNodeIds: string[];
  filter: BoardFilter;
  query: string;
  view: ViewMode;
  page: WorkspacePage;
  changeSets: ChangeSet[];
  reviewOpen: boolean;
  activity: ActivityEntry[];
  brief: DecisionBrief | null;
  undoDepth: number;
  notice: string | null;
  storageStatus: 'saved' | 'memory' | 'error';
}

export interface ProposalInput {
  title: string;
  summary: string;
  baseRevision: number;
  changes: Array<Omit<ProposedChange, 'id' | 'selected'> & { id?: string; selected?: boolean }>;
}

export interface BoardStore {
  getState: () => BoardState;
  subscribe: (listener: () => void) => () => void;
  selectNode: (id: string | null) => void;
  focusNodes: (ids: string[]) => void;
  setFilter: (filter: BoardFilter) => void;
  setQuery: (query: string) => void;
  setView: (view: ViewMode) => void;
  setPage: (page: WorkspacePage) => void;
  setReviewOpen: (open: boolean) => void;
  setNotice: (notice: string | null) => void;
  applyHumanOperations: (operations: Operation[], label: string) => void;
  proposeChangeSet: (proposal: ProposalInput, origin?: 'agent' | 'demo' | 'sample') => ChangeSet;
  toggleChange: (setId: string, changeId: string) => void;
  editChange: (setId: string, changeId: string, operation: Operation) => void;
  applyChangeSet: (setId: string) => { accepted: number; rejected: number };
  rejectChangeSet: (setId: string) => void;
  undo: () => void;
  generateBrief: () => DecisionBrief;
  recordActivity: (entry: Omit<ActivityEntry, 'id' | 'timestamp'>) => string;
  updateActivity: (id: string, patch: Partial<ActivityEntry>) => void;
  resetDemo: () => void;
  startEmpty: (question?: string) => void;
  exportBoard: () => string;
  importBoard: (json: string) => void;
  exportSession: () => string;
  updateMetadata: (patch: Pick<BoardContent, 'title' | 'question' | 'description'>) => void;
  updateSource: (source: Source) => void;
}
