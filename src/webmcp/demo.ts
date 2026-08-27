import type { BoardStore } from '../domain/types';
import { seedContent } from '../data/seed';
import type { ToolEnvelope, ToolRegistry } from './tools';

export interface DemoChallengeResult {
  proposalId: string;
  steps: number;
}

/**
 * A reproducible scripted walkthrough, not an LLM or a native-agent connection.
 * Reads, focus, validation, logging, and the final proposal all use real handlers.
 * Nothing is accepted, published, or fetched by this function.
 */
export async function runDemoChallenge(
  registry: ToolRegistry,
  store: BoardStore,
  signal?: AbortSignal,
): Promise<DemoChallengeResult> {
  let steps = 0;
  const call = async (name: string, input: unknown) => {
    const result = await registry.invoke(name, input, { signal, actor: 'demo' });
    steps += 1;
    if (result.structuredContent.status === 'error' || result.structuredContent.status === 'cancelled') {
      throw new Error(`${result.structuredContent.error.message} ${result.structuredContent.error.suggestedAction}`);
    }
    return result.structuredContent as Extract<ToolEnvelope, { data: unknown }>;
  };

  const summary = await call('get_board_summary', {});
  const required = ['claim_demand', 'evidence_survey', 'evidence_turnstile'];
  if (!required.every((id) => store.getState().content.nodes.some((node) => node.id === id))) {
    throw new Error('The rehearsal needs the fictional library case. Save your work, then choose Reset demo to restore that case.');
  }
  const current = store.getState().content;
  for (const id of required) {
    const node = current.nodes.find((item) => item.id === id)!;
    const original = seedContent.nodes.find((item) => item.id === id)!;
    const source = current.sources.find((item) => item.id === node.sourceId);
    const originalSource = seedContent.sources.find((item) => item.id === original.sourceId);
    if (node.title !== original.title || node.body !== original.body || node.sourceId !== original.sourceId
      || JSON.stringify(source) !== JSON.stringify(originalSource)) {
      throw new Error('The demo’s reference claim or evidence has been edited. This scripted rehearsal cannot analyze new research. Save your work and Reset demo, or use the manual tools or a connected browser agent.');
    }
  }
  if (current.links.some((link) => link.evidenceId === 'evidence_turnstile' && link.claimId === 'claim_demand')
    || current.nodes.some((node) => node.id === 'question_exam_baseline')) {
    throw new Error('The demo changes have already been added to this board. Undo the approval or Reset demo before replaying the same rehearsal.');
  }
  const pending = store.getState().changeSets.find((set) => set.status === 'pending'
    && set.changes.some((change) => change.operation.type === 'link_evidence' && change.operation.link.id === 'link_demo_usage_challenge'));
  if (pending) {
    store.setReviewOpen(true);
    return { proposalId: pending.id, steps };
  }
  await call('get_evidence', { evidenceId: 'evidence_survey' });
  await call('get_evidence', { evidenceId: 'evidence_turnstile' });
  await call('find_nodes', { filter: 'unlinked', kind: 'evidence', limit: 4 });
  await call('focus_view', {
    nodeIds: ['claim_demand', 'evidence_survey', 'evidence_turnstile'],
    filter: 'all', query: '',
  });

  // A single final proposal is the only write to proposal state. All three
  // operations are validated together before the store commits the proposal.
  const proposal = await call('propose_change_set', {
    baseRevision: summary.revision,
    title: 'Challenge the overnight demand claim',
    summary: 'The fictional survey measures interest in later hours; observed usage raises a different question about overnight demand. Review the evidence link, conflict, and research question separately.',
    changes: [
      {
        title: 'Connect the overlooked usage evidence',
        rationale: 'The turnstile data is already on the board but is not linked. It is relevant counterevidence to sustained overnight demand.',
        operation: {
          type: 'link_evidence', id: 'link_demo_usage_challenge',
          evidenceId: 'evidence_turnstile', claimId: 'claim_demand', stance: 'challenges',
          reason: 'Only 8% of entries during the exam-period trial occurred after midnight. This questions strong overnight demand, but entries do not measure occupied seats or unmet need.',
        },
      },
      {
        title: 'Surface the survey–usage tension',
        rationale: 'Self-reported preference and observed attendance measure different things. Their tension should remain visible beside the claim.',
        operation: {
          type: 'flag_conflict', id: 'conflict_demo_survey_usage',
          title: 'Stated interest versus observed overnight use',
          description: 'In this fictional case, 72% of survey respondents want later exam-week hours, while only 8% of trial entries occur after midnight. The survey does not specify a closing time, and entry counts do not measure time spent studying or unmet need. These measures leave overnight demand uncertain.',
          nodeIds: ['claim_demand', 'evidence_survey', 'evidence_turnstile'],
        },
      },
      {
        title: 'Separate exam weeks from the baseline',
        rationale: 'Compare exam weeks with ordinary weeks to understand how targeted a pilot should be, without generalizing a preference for later evenings into overnight demand.',
        operation: {
          type: 'create_question', id: 'question_exam_baseline', confidence: 'low',
          title: 'Does overnight demand persist outside exam weeks?',
          body: 'Compare midnight-to-6 a.m. use during exam periods and ordinary teaching weeks. Measure occupied seats and unmet need as well as entries, then use the difference to define the scope of a targeted pilot.',
        },
      },
    ],
  });
  const proposalId = proposal.data.proposalId;
  if (typeof proposalId !== 'string') throw new Error('The rehearsal did not return a reviewable proposal. Check the activity log.');
  return { proposalId, steps };
}
