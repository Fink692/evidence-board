import { z } from 'zod';
import type { Actor, BoardContent, Operation } from './types';
import { MAX_PORTABLE_EXPORT_CHARACTERS, portableExportSize } from './serialization';

// The static build has a strict script CSP. Use interpreted validators without
// attempting Zod's optional Function-constructor/JIT capability probe.
z.config({ jitless: true });

export type DomainErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'DUPLICATE_ID'
  | 'STALE_REVISION'
  | 'EMPTY_SELECTION'
  | 'INVALID_STATE'
  | 'INVALID_IMPORT';

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly details?: unknown;

  constructor(code: DomainErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export const LIMITS = Object.freeze({
  nodes: 250,
  links: 600,
  sources: 150,
  conflicts: 150,
  operations: 30,
  proposals: 40,
  history: 20,
  activity: 120,
  importCharacters: MAX_PORTABLE_EXPORT_CHARACTERS,
});

const forbiddenKeys = new Set(['__proto__', 'prototype', 'constructor']);
export const idSchema = z.string().min(1).max(96).regex(/^[A-Za-z0-9_-]+$/)
  .refine((value) => !forbiddenKeys.has(value), 'Reserved identifiers are not allowed.');
export const titleSchema = z.string().trim().min(1).max(160);
export const textSchema = z.string().trim().min(1).max(6_000);
export const confidenceSchema = z.enum(['high', 'medium', 'low']);
export const actorSchema = z.enum(['human', 'agent', 'sample']);
export const timestampSchema = z.string().datetime({ offset: true });
export const revisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1);

const sourceUrlSchema = z.string().max(2_048).url().refine((value) => {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol)
      && !url.username && !url.password && !/[\u0000-\u0020<>]/.test(value);
  } catch {
    return false;
  }
}, 'Source URLs must be HTTP or HTTPS links without credentials.');

export const sourceSchema = z.object({
  id: idSchema,
  title: titleSchema,
  publisher: titleSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Use a valid calendar date in YYYY-MM-DD form.').or(z.literal('')),
  url: sourceUrlSchema.optional(),
  excerpt: textSchema,
  reliability: confidenceSchema,
  fictional: z.boolean(),
}).strict();

export const nodeSchema = z.object({
  id: idSchema,
  kind: z.enum(['claim', 'evidence', 'question']),
  title: titleSchema,
  body: textSchema,
  sourceId: idSchema.optional(),
  confidence: confidenceSchema,
  createdBy: actorSchema,
  createdAt: timestampSchema,
  position: z.object({
    x: z.number().finite().min(-100_000).max(100_000),
    y: z.number().finite().min(-100_000).max(100_000),
  }).strict(),
}).strict();

export const linkSchema = z.object({
  id: idSchema,
  evidenceId: idSchema,
  claimId: idSchema,
  stance: z.enum(['supports', 'challenges', 'context']),
  reason: textSchema,
  createdBy: actorSchema,
}).strict();

export const conflictSchema = z.object({
  id: idSchema,
  title: titleSchema,
  description: textSchema,
  nodeIds: z.array(idSchema).min(2).max(20),
  resolved: z.boolean(),
  createdBy: actorSchema,
}).strict();

export const contentSchema = z.object({
  id: idSchema,
  title: titleSchema,
  question: z.string().trim().min(1).max(1_000),
  description: z.string().trim().max(6_000),
  conclusion: z.string().trim().max(6_000),
  nodes: z.array(nodeSchema).max(LIMITS.nodes),
  links: z.array(linkSchema).max(LIMITS.links),
  sources: z.array(sourceSchema).max(LIMITS.sources),
  conflicts: z.array(conflictSchema).max(LIMITS.conflicts),
}).strict();

const updatePatchSchema = z.object({
  title: titleSchema.optional(),
  body: textSchema.optional(),
  confidence: confidenceSchema.optional(),
}).strict().refine((patch) => Object.keys(patch).length > 0, 'Include at least one field to edit.');

export const operationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('create_node'), node: nodeSchema, source: sourceSchema.optional() }).strict(),
  z.object({ type: z.literal('update_node'), nodeId: idSchema, patch: updatePatchSchema }).strict(),
  z.object({ type: z.literal('delete_node'), nodeId: idSchema }).strict(),
  z.object({ type: z.literal('link_evidence'), link: linkSchema }).strict(),
  z.object({ type: z.literal('unlink_evidence'), linkId: idSchema }).strict(),
  z.object({ type: z.literal('flag_conflict'), conflict: conflictSchema }).strict(),
  z.object({ type: z.literal('resolve_conflict'), conflictId: idSchema, resolved: z.boolean() }).strict(),
  z.object({ type: z.literal('set_conclusion'), conclusion: textSchema }).strict(),
]);

export const proposedChangeSchema = z.object({
  id: idSchema,
  title: titleSchema,
  rationale: textSchema,
  operation: operationSchema,
  selected: z.boolean(),
}).strict();

export const changeSetSchema = z.object({
  id: idSchema,
  title: titleSchema,
  summary: textSchema,
  baseRevision: revisionSchema,
  changes: z.array(proposedChangeSchema).min(1).max(LIMITS.operations),
  createdAt: timestampSchema,
  status: z.enum(['pending', 'applied', 'rejected', 'undone']),
}).strict();

export const proposalInputSchema = z.object({
  title: titleSchema,
  summary: textSchema,
  baseRevision: revisionSchema,
  changes: z.array(z.object({
    id: idSchema.optional(),
    title: titleSchema,
    rationale: textSchema,
    operation: operationSchema,
    selected: z.boolean().optional(),
  }).strict()).min(1).max(LIMITS.operations),
}).strict();

export function parseValidated<T>(schema: z.ZodType<T>, input: unknown, label = 'Input'): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    }));
    throw new DomainError('VALIDATION_ERROR', `${label} is invalid: ${issues[0]?.path || 'value'} ${issues[0]?.message || ''}`.trim(), issues);
  }
  return result.data;
}

export function assertUniqueIds(items: ReadonlyArray<{ id: string }>, label: string): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) throw new DomainError('DUPLICATE_ID', `${label} contains the duplicate ID "${item.id}".`);
    seen.add(item.id);
  }
}

/** Validate the whole graph, not just the syntax of individual records. */
export function validateContent(input: unknown): BoardContent {
  const content = parseValidated(contentSchema, input, 'Board');
  assertUniqueIds(content.nodes, 'Nodes');
  assertUniqueIds(content.sources, 'Sources');
  assertUniqueIds(content.links, 'Links');
  assertUniqueIds(content.conflicts, 'Conflicts');
  const nodes = new Map(content.nodes.map((node) => [node.id, node]));
  const sources = new Set(content.sources.map((source) => source.id));
  for (const node of content.nodes) {
    if (node.kind === 'evidence' && !node.sourceId) {
      throw new DomainError('VALIDATION_ERROR', `Evidence "${node.id}" must cite a source.`);
    }
    if (node.sourceId && !sources.has(node.sourceId)) {
      throw new DomainError('NOT_FOUND', `Source "${node.sourceId}" cited by "${node.id}" does not exist.`);
    }
  }
  const linkedPairs = new Set<string>();
  for (const link of content.links) {
    if (nodes.get(link.evidenceId)?.kind !== 'evidence') {
      throw new DomainError('VALIDATION_ERROR', `Link "${link.id}" must start at an existing evidence node.`);
    }
    if (nodes.get(link.claimId)?.kind !== 'claim') {
      throw new DomainError('VALIDATION_ERROR', `Link "${link.id}" must end at an existing claim.`);
    }
    const pair = `${link.evidenceId}\u0000${link.claimId}`;
    if (linkedPairs.has(pair)) {
      throw new DomainError('DUPLICATE_ID', `Evidence "${link.evidenceId}" is already linked to claim "${link.claimId}".`);
    }
    linkedPairs.add(pair);
  }
  const conflicts = new Set<string>();
  for (const conflict of content.conflicts) {
    if (new Set(conflict.nodeIds).size !== conflict.nodeIds.length) {
      throw new DomainError('DUPLICATE_ID', `Conflict "${conflict.id}" repeats a node.`);
    }
    for (const nodeId of conflict.nodeIds) {
      if (!nodes.has(nodeId)) throw new DomainError('NOT_FOUND', `Conflict "${conflict.id}" refers to missing node "${nodeId}".`);
    }
    const key = `${[...conflict.nodeIds].sort().join('\u0000')}\u0001${conflict.title.toLocaleLowerCase()}`;
    if (conflicts.has(key)) throw new DomainError('DUPLICATE_ID', 'This conflict has already been flagged.');
    conflicts.add(key);
  }
  if (portableExportSize(content) > MAX_PORTABLE_EXPORT_CHARACTERS) {
    throw new DomainError('VALIDATION_ERROR', `This change would exceed the board’s portable backup capacity of ${MAX_PORTABLE_EXPORT_CHARACTERS.toLocaleString('en-CA')} characters. Shorten source excerpts or notes, or remove unused items before adding more. Your accepted board is unchanged.`);
  }
  return content;
}

/** Clone and apply a batch in memory. Nothing is committed if any operation fails. */
export function applyOperations(content: BoardContent, operations: unknown, actor: Actor): BoardContent {
  const parsed = parseValidated(z.array(operationSchema).min(1).max(LIMITS.operations), operations, 'Operations');
  let next: BoardContent = {
    ...content,
    nodes: [...content.nodes],
    sources: [...content.sources],
    links: [...content.links],
    conflicts: [...content.conflicts],
  };
  for (const operation of parsed) {
    switch (operation.type) {
      case 'create_node': {
        if (next.nodes.some((node) => node.id === operation.node.id)) {
          throw new DomainError('DUPLICATE_ID', `Node "${operation.node.id}" already exists.`);
        }
        if (operation.source) {
          if (next.sources.some((source) => source.id === operation.source!.id)) {
            throw new DomainError('DUPLICATE_ID', `Source "${operation.source.id}" already exists. Reference its ID instead of creating it again.`);
          }
          if (operation.node.sourceId !== operation.source.id) {
            throw new DomainError('VALIDATION_ERROR', 'The new node must cite the source created with it.');
          }
          next.sources.push(operation.source);
        }
        next.nodes.push({ ...operation.node, createdBy: actor });
        break;
      }
      case 'update_node': {
        if (!next.nodes.some((node) => node.id === operation.nodeId)) {
          throw new DomainError('NOT_FOUND', `Node "${operation.nodeId}" does not exist.`);
        }
        next.nodes = next.nodes.map((node) => node.id === operation.nodeId ? { ...node, ...operation.patch } : node);
        break;
      }
      case 'delete_node': {
        if (!next.nodes.some((node) => node.id === operation.nodeId)) {
          throw new DomainError('NOT_FOUND', `Node "${operation.nodeId}" does not exist.`);
        }
        next.nodes = next.nodes.filter((node) => node.id !== operation.nodeId);
        next.links = next.links.filter((link) => link.evidenceId !== operation.nodeId && link.claimId !== operation.nodeId);
        next.conflicts = next.conflicts.map((conflict) => ({
          ...conflict,
          nodeIds: conflict.nodeIds.filter((nodeId) => nodeId !== operation.nodeId),
        })).filter((conflict) => conflict.nodeIds.length >= 2);
        break;
      }
      case 'link_evidence':
        next.links.push({ ...operation.link, createdBy: actor });
        break;
      case 'unlink_evidence': {
        if (!next.links.some((link) => link.id === operation.linkId)) {
          throw new DomainError('NOT_FOUND', `Link "${operation.linkId}" does not exist.`);
        }
        next.links = next.links.filter((link) => link.id !== operation.linkId);
        break;
      }
      case 'flag_conflict':
        next.conflicts.push({ ...operation.conflict, createdBy: actor });
        break;
      case 'resolve_conflict': {
        if (!next.conflicts.some((conflict) => conflict.id === operation.conflictId)) {
          throw new DomainError('NOT_FOUND', `Conflict "${operation.conflictId}" does not exist.`);
        }
        next.conflicts = next.conflicts.map((conflict) => conflict.id === operation.conflictId
          ? { ...conflict, resolved: operation.resolved }
          : conflict);
        break;
      }
      case 'set_conclusion':
        next.conclusion = operation.conclusion;
        break;
    }
    // Validate after every operation so a later operation cannot hide a malformed
    // or duplicate intermediate write. Forward references must be created first.
    next = validateContent(next);
  }
  return next;
}

/** Always stamp creation provenance at the trust boundary. */
export function withActor(operation: Operation, actor: Actor): Operation {
  switch (operation.type) {
    case 'create_node': return { ...operation, node: { ...operation.node, createdBy: actor } };
    case 'link_evidence': return { ...operation, link: { ...operation.link, createdBy: actor } };
    case 'flag_conflict': return { ...operation, conflict: { ...operation.conflict, createdBy: actor } };
    default: return operation;
  }
}

export function makeId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${random}`;
}

/** Reject pollution-shaped keys before schema parsing; treat all other text as data. */
export function parseUntrustedJson(json: string, maximumCharacters: number = LIMITS.importCharacters): unknown {
  if (typeof json !== 'string' || json.length > maximumCharacters) {
    throw new DomainError('INVALID_IMPORT', `Provide board JSON with no more than ${maximumCharacters.toLocaleString('en-CA')} characters.`);
  }
  try {
    return JSON.parse(json, (key, value: unknown) => {
      if (forbiddenKeys.has(key)) throw new Error('Reserved object keys are not allowed.');
      return value;
    }) as unknown;
  } catch (error) {
    throw new DomainError('INVALID_IMPORT', `This file is not safe, valid board JSON. ${error instanceof Error ? error.message : ''}`.trim());
  }
}

export function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);
    for (const child of Object.values(value)) deepFreeze(child, seen);
    Object.freeze(value);
  }
  return value;
}
