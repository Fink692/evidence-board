import type { BoardContent, BoardNode, Source } from '../domain/types';
import { deepFreeze, makeId } from '../domain/validation';

const createdAt = '2026-04-14T09:00:00.000Z';

function node(
  id: string,
  kind: BoardNode['kind'],
  title: string,
  body: string,
  confidence: BoardNode['confidence'],
  x: number,
  y: number,
  sourceId?: string,
): BoardNode {
  return { id, kind, title, body, confidence, createdBy: 'human', createdAt, position: { x, y }, ...(sourceId ? { sourceId } : {}) };
}

const sources: Source[] = [
  {
    id: 'source_survey',
    title: 'Spring student study-space survey',
    publisher: 'Northbridge Students’ Union · fictional fixture',
    date: '2026-03-18',
    excerpt: 'Of 480 voluntary respondents, 72% selected “later library hours during exams.” The question did not specify a closing time or distinguish midnight, 2 a.m., and overnight access. Self-selected responses are not representative of every student.',
    reliability: 'medium',
    fictional: true,
  },
  {
    id: 'source_usage',
    title: 'Library entry counts: last spring’s exam period',
    publisher: 'Northbridge Library Operations · fictional fixture',
    date: '2026-03-22',
    excerpt: 'During a ten-night extended-hours trial in the previous spring exam period, 8% of recorded entries occurred after midnight. Counts measure entries, not occupied seats or the needs of students who could not travel to campus. The trial is not a controlled estimate of demand for a new service.',
    reliability: 'high',
    fictional: true,
  },
  {
    id: 'source_staffing',
    title: 'Exam-period overnight staffing estimate',
    publisher: 'Northbridge Library Services · fictional fixture',
    date: '2026-04-02',
    excerpt: 'Opening all night for two exam weeks would increase the library’s staff expenditure for that period by approximately 31%, including night premiums. A single-zone service ending at 2 a.m. has not yet received a finalized staffing quote.',
    reliability: 'medium',
    fictional: true,
  },
  {
    id: 'source_exam',
    title: 'Seat occupancy during assessment weeks',
    publisher: 'Northbridge Learning Spaces Team · fictional fixture',
    date: '2026-03-25',
    excerpt: 'Observed seat demand between 6 p.m. and midnight was 46% higher during the last two exam weeks than during a typical teaching week. This comparison does not measure use after midnight, and occupancy observations covered only the main library.',
    reliability: 'high',
    fictional: true,
  },
  {
    id: 'source_commuter',
    title: 'Commuter students’ access diary',
    publisher: 'Northbridge Access Office · fictional fixture',
    date: '2026-03-28',
    excerpt: 'In a convenience sample of 24 commuter students, work and care responsibilities delayed evening study. Participants valued additional evening hours, but the final regular bus from the campus leaves at 12:20 a.m. These diaries describe experiences, not population prevalence.',
    reliability: 'medium',
    fictional: true,
  },
  {
    id: 'source_pilot',
    title: 'Single-zone 2 a.m. pilot retrospective',
    publisher: 'Westhaven College Library · fictional fixture',
    date: '2026-02-12',
    excerpt: 'A fictional comparable institution kept one library zone open until 2 a.m. during exams. Its trial team reported that 81% of late-night visitors left before 2 a.m. Staffing patterns, student housing, and campus transport differ from Northbridge, so the result may not transfer.',
    reliability: 'low',
    fictional: true,
  },
  {
    id: 'source_security',
    title: 'Late-night library safety requirements',
    publisher: 'Northbridge Campus Safety · fictional fixture',
    date: '2026-04-04',
    excerpt: 'A service after midnight requires at least two staff on duty, controlled entry, an incident contact, and a documented closing procedure. The safety team has not approved a single-staff model. Escort availability after midnight remains to be confirmed.',
    reliability: 'high',
    fictional: true,
  },
  {
    id: 'source_finance',
    title: 'Exam service contingency allocation',
    publisher: 'Northbridge Finance Office · fictional fixture',
    date: '2026-04-06',
    excerpt: 'The exam-service contingency can fund an increase equivalent to 18% of the library’s usual staff expenditure for the two-week period. This is a budget ceiling, not an approved pilot budget; security, cleaning, and transport costs still need estimates.',
    reliability: 'high',
    fictional: true,
  },
];

/** Every institution, statistic, excerpt, and source in this seed is fictional. */
export const seedContent: BoardContent = deepFreeze({
  id: 'board_library_hours',
  title: 'The library after midnight',
  question: 'Should Northbridge University extend library opening hours during exam weeks?',
  description: 'A fictional investigation into student access, overnight demand, and the cost of staying open.',
  conclusion: 'Extend library opening to 24 hours during the two busiest exam weeks. Student demand appears strong, and concentrating service in one supervised zone should keep costs manageable.',
  sources,
  nodes: [
    node('claim_access', 'claim', 'Longer hours improve student access', 'Later opening gives students with work, care responsibilities, or limited home study space more time to use the library. The benefit depends on safe travel and the hours students can actually use.', 'medium', 100, 100),
    node('claim_demand', 'claim', 'Demand justifies overnight opening', 'Exam-period demand and student preferences appear to support keeping the library open all night. Evidence must distinguish a desire for later evenings from demonstrated overnight use.', 'medium', 580, 100),
    node('claim_cost', 'claim', 'A targeted extension is affordable', 'Restricting access to one supervised zone may put an exam-period extension within the existing contingency. The staffing model and full cost have not yet been confirmed.', 'low', 1_060, 100),
    node('evidence_survey', 'evidence', '72% want later library hours', 'In a voluntary survey of 480 students, 72% asked for later hours during exams. The survey did not ask how late, so this is a preference signal rather than a measure of overnight demand.', 'medium', 70, 330, 'source_survey'),
    node('evidence_turnstile', 'evidence', 'Only 8% of entries occur after midnight', 'During the previous ten-night exam trial, 8% of library entries happened after midnight. Entry counts do not measure time spent studying or unmet demand, but they question an assumption of strong overnight use.', 'high', 650, 840, 'source_usage'),
    node('evidence_staffing', 'evidence', 'Overnight staffing costs rise 31%', 'An all-night exam service is estimated to raise staff expenditure for the period by 31%. A quote for a smaller service ending at 2 a.m. is still missing.', 'medium', 1_045, 330, 'source_staffing'),
    node('evidence_exam_demand', 'evidence', 'Evening exam demand rises 46%', 'Seat demand from 6 p.m. to midnight rises 46% during exams. The observation supports extra evening capacity but contains no estimate of demand after midnight.', 'high', 565, 330, 'source_exam'),
    node('evidence_commuter', 'evidence', 'Commuters need access and a way home', 'Student diaries describe work and care constraints on evening study. The last regular campus bus leaves at 12:20 a.m., so opening later does not by itself make the service accessible.', 'medium', 70, 550, 'source_commuter'),
    node('evidence_pilot', 'evidence', 'A 2 a.m. pilot served most late visitors', 'At a fictional comparable college, 81% of late-night visitors left before 2 a.m. A limited pilot may meet much of the demand, but differences between campuses limit the comparison.', 'low', 565, 550, 'source_pilot'),
    node('evidence_safety', 'evidence', 'After midnight requires two staff', 'Campus safety requires at least two staff, controlled entry, and a closing plan after midnight. A single-person overnight service has not been approved.', 'high', 1_045, 550, 'source_security'),
    node('evidence_budget', 'evidence', 'The contingency covers an 18% increase', 'Available contingency is equivalent to an 18% rise in staff expenditure for two exam weeks. Other costs and a final service design are still unknown.', 'high', 1_045, 770, 'source_finance'),
    node('question_staffing', 'question', 'What would a 2 a.m. pilot actually cost?', 'Obtain a costed, two-person staffing plan for a single study zone, including security and cleaning, before declaring the extension affordable.', 'low', 290, 1_075),
    node('question_equity', 'question', 'Who can safely use the extra hours?', 'Check transport, disability access, care responsibilities, and the needs of students without quiet study space. Measure unmet demand as well as turnstile entries.', 'low', 850, 1_075),
  ],
  links: [
    { id: 'link_survey_access', evidenceId: 'evidence_survey', claimId: 'claim_access', stance: 'supports', reason: 'Students report wanting a longer window to access a study space.', createdBy: 'human' },
    { id: 'link_survey_demand', evidenceId: 'evidence_survey', claimId: 'claim_demand', stance: 'supports', reason: 'The preference signal is being used to support overnight opening, although the survey did not distinguish later evenings from all-night access.', createdBy: 'human' },
    { id: 'link_exam_demand', evidenceId: 'evidence_exam_demand', claimId: 'claim_demand', stance: 'supports', reason: 'Exam weeks have substantially higher evening demand; evidence after midnight is still needed.', createdBy: 'human' },
    { id: 'link_commuter_access', evidenceId: 'evidence_commuter', claimId: 'claim_access', stance: 'context', reason: 'Longer opening can help some students, but transport determines whether those hours are usable.', createdBy: 'human' },
    { id: 'link_pilot_access', evidenceId: 'evidence_pilot', claimId: 'claim_access', stance: 'supports', reason: 'A comparable limited extension suggests a way to increase access without an all-night commitment.', createdBy: 'human' },
    { id: 'link_pilot_cost', evidenceId: 'evidence_pilot', claimId: 'claim_cost', stance: 'context', reason: 'A single-zone, 2 a.m. service is an option to cost; the other institution’s results do not establish Northbridge’s costs.', createdBy: 'human' },
    { id: 'link_staffing_cost', evidenceId: 'evidence_staffing', claimId: 'claim_cost', stance: 'challenges', reason: 'The 31% all-night staffing estimate exceeds the currently available contingency.', createdBy: 'human' },
    { id: 'link_safety_cost', evidenceId: 'evidence_safety', claimId: 'claim_cost', stance: 'challenges', reason: 'The requirement for two staff limits how far a targeted service can reduce costs.', createdBy: 'human' },
    { id: 'link_budget_cost', evidenceId: 'evidence_budget', claimId: 'claim_cost', stance: 'context', reason: 'The 18% contingency is the ceiling against which a proposed extension must be costed.', createdBy: 'human' },
  ],
  conflicts: [
    {
      id: 'conflict_cost_assumption',
      title: 'The overnight estimate exceeds the contingency',
      description: 'The all-night staffing estimate is a 31% increase, while the contingency covers 18%. A targeted 2 a.m. model might fit, but has not been quoted. The affordability claim remains conditional.',
      nodeIds: ['claim_cost', 'evidence_staffing', 'evidence_budget'],
      resolved: false,
      createdBy: 'human',
    },
  ],
});

export function createSeedContent(): BoardContent {
  return structuredClone(seedContent);
}

export function createEmptyContent(question = 'What decision are we trying to make?'): BoardContent {
  return {
    id: makeId('board'),
    title: 'Untitled evidence board',
    question,
    description: '',
    conclusion: '',
    nodes: [],
    links: [],
    sources: [],
    conflicts: [],
  };
}
