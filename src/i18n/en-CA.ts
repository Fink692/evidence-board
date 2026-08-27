// Central copy for shared product concepts; evidence/source content remains user data.
export const copy = {
  appName: 'Evidence Board',
  workingTitle: 'Working title',
  tagline: 'Room for a better conclusion.',
  demoLabel: 'Fictional demo case',
  localLabel: 'Stored on this device',
  questionLabel: 'The research question',
  demoPrompt: "Challenge my current conclusion. Find weakly supported claims and contradictions, and propose the three highest-value changes. Don’t apply anything without my review.",
  stance: { supports: 'Supports', challenges: 'Challenges', context: 'Context' },
  kind: { claim: 'Claim', evidence: 'Evidence', question: 'Open question' },
  confidence: { high: 'High', medium: 'Medium', low: 'Low' },
  state: { pending: 'Awaiting review', applied: 'Applied', rejected: 'Rejected', undone: 'Undone' },
  unsupported: 'Your board works normally. Browser-agent tools need a WebMCP-enabled browser.',
  empty: 'Every good decision starts with a question.',
} as const;
