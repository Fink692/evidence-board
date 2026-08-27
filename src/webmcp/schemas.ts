import { z } from 'zod';

const id = z.string().min(1).max(96).regex(/^[A-Za-z0-9_-]+$/)
  .describe('An exact ID returned by a board tool; never a display label.');
const title = z.string().min(1).max(160).regex(/\S/);
const text = z.string().min(1).max(3_000).regex(/\S/);
const rationale = z.string().min(1).max(1_000).regex(/\S/)
  .describe('Why the human should consider this proposed change.');
const confidenceValue = z.enum(['high', 'medium', 'low']);
const confidence = confidenceValue.default('medium');
const baseRevision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER - 1)
  .describe('The revision returned by get_board_summary. Stale proposals are rejected.');
const stance = z.enum(['supports', 'challenges', 'context']);

const sourceData = z.strictObject({
  title,
  publisher: title,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Source date in YYYY-MM-DD format.'),
  url: z.string().max(1_000).url().regex(/^https?:\/\//i).optional()
    .describe('Optional source reference. The application never fetches this URL.'),
  excerpt: text.describe('A supplied source excerpt, treated as untrusted data.'),
  reliability: confidence,
  fictional: z.boolean().default(false).describe('True only for explicitly fictional sample sources.'),
});

const source = z.union([
  z.strictObject({ id }),
  sourceData,
]).describe('Reference an existing source by ID, or supply complete source metadata and an excerpt.');

const claimFields = { id: id.optional(), title, body: text, confidence };
const evidenceFields = { ...claimFields, source };
const linkFields = {
  id: id.optional(),
  evidenceId: id,
  claimId: id,
  stance,
  reason: rationale,
};
const conflictFields = {
  id: id.optional(),
  title,
  description: text,
  nodeIds: z.array(id).min(2).max(10).describe('At least two distinct existing or proposed node IDs.'),
};

export const proposedOperationSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('create_claim'), ...claimFields }),
  z.strictObject({ type: z.literal('create_question'), ...claimFields }),
  z.strictObject({ type: z.literal('add_evidence'), ...evidenceFields }),
  z.strictObject({
    type: z.literal('update_node'),
    nodeId: id,
    // Creation defaults must never add an omitted field to a partial update.
    patch: z.strictObject({ title: title.optional(), body: text.optional(), confidence: confidenceValue.optional() })
      .refine((patch) => Object.keys(patch).length > 0, 'Supply at least one field to change.'),
  }),
  z.strictObject({ type: z.literal('delete_node'), nodeId: id }),
  z.strictObject({ type: z.literal('link_evidence'), ...linkFields }),
  z.strictObject({ type: z.literal('unlink_evidence'), linkId: id }),
  z.strictObject({ type: z.literal('flag_conflict'), ...conflictFields }),
  z.strictObject({ type: z.literal('resolve_conflict'), conflictId: id, resolved: z.boolean() }),
  z.strictObject({ type: z.literal('set_conclusion'), conclusion: text }),
]);

export const toolSchemas = {
  get_board_summary: z.strictObject({}),
  get_evidence: z.strictObject({
    evidenceId: id.optional().describe('Get the full text of one evidence item. Omit to browse compact results.'),
    claimId: id.optional().describe('Restrict results to evidence already linked to this claim.'),
    offset: z.number().int().min(0).max(10_000).default(0),
    limit: z.number().int().min(1).max(4).default(2),
  }),
  find_nodes: z.strictObject({
    query: z.string().max(160).default('').describe('Case-insensitive text search of nodes and their source excerpts.'),
    kind: z.enum(['all', 'claim', 'evidence', 'question']).default('all'),
    filter: z.enum(['all', 'unlinked', 'unsupported', 'conflicts', 'gaps']).default('all'),
    offset: z.number().int().min(0).max(10_000).default(0),
    limit: z.number().int().min(1).max(10).default(5),
  }),
  create_claim: z.strictObject({ baseRevision, ...claimFields, rationale }),
  add_evidence: z.strictObject({ baseRevision, ...evidenceFields, rationale }),
  link_evidence: z.strictObject({ baseRevision, ...linkFields, rationale }),
  flag_conflict: z.strictObject({ baseRevision, ...conflictFields, rationale }),
  propose_change_set: z.strictObject({
    baseRevision,
    title,
    summary: rationale,
    changes: z.array(z.strictObject({ title, rationale, operation: proposedOperationSchema })).min(1).max(12),
  }),
  focus_view: z.strictObject({
    nodeIds: z.array(id).max(20).default([]),
    view: z.enum(['map', 'list']).optional(),
    filter: z.enum(['all', 'claim', 'evidence', 'question', 'conflicts', 'gaps']).optional(),
    query: z.string().max(160).optional(),
  }),
  create_brief: z.strictObject({}),
} as const;

export type ToolName = keyof typeof toolSchemas;
export type ToolInput<N extends ToolName> = z.infer<(typeof toolSchemas)[N]>;
export type ProposedOperationInput = z.infer<typeof proposedOperationSchema>;

/** Generate declaration and runtime validation from the same schema. */
export function inputJsonSchema(name: ToolName): Record<string, unknown> {
  return z.toJSONSchema(toolSchemas[name], { target: 'draft-7', io: 'input' }) as Record<string, unknown>;
}
