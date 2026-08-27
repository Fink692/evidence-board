# Evidence Board — Devpost description draft

**Working title:** Evidence Board. The final project name remains a human decision.

**Status:** Submission copy prepared from the local implementation. This document does not establish a public deployment, repository, uploaded video, or completed contest entry.

## Short description

A shared evidence workspace where browser agents challenge an argument, people review every change, and the final brief contains only accepted evidence.

## Inspiration

A confident conclusion can hide a weak link: a survey measures preference, an entry count measures visits, and neither automatically answers the decision in front of us. Useful assistance should make those differences easier to inspect.

We wanted a research workspace where a second perspective leaves a visible trail. The original sources stay close to the claims, proposed changes remain separate from the accepted record, and the human can disagree without losing their work.

## What it does

Evidence Board brings claims, sourced evidence, open questions, and conflicting interpretations into one workspace. A visual map and an equivalent structured list show which evidence supports, challenges, or provides context for each claim. Selecting an item reveals its wording, confidence, relationships, and source.

The included case asks whether a fictional university should extend library hours during exam weeks. Its survey reports that 72% of voluntary respondents want later hours, while 8% of trial entries occurred after midnight. Those figures deliberately measure different things. Every institution, statistic, and source in this case is labelled fictional.

Ten WebMCP tools let a compatible browser agent inspect the accepted board, read sources, find gaps, focus the shared view, and propose changes. The tools use the same domain store as the human interface. They cannot approve proposals or directly change accepted research.

The review tray shows each proposed operation, its rationale, and its effect. The human can edit wording, select only the useful changes, reject the rest, and undo an accepted set. A decision brief is then generated deterministically from the accepted record, with source citations and unresolved uncertainty. Pending and rejected proposals never enter it.

The application also includes source browsing, a visible activity and tool catalogue, local persistence, JSON backup and restore, manual editing, and a fresh-board flow. It works without an account, model key, or application AI backend. The app does not upload the board; a separately connected agent may share tool outputs with its own provider.

## How we built it

The implementation uses React, TypeScript, Vite, and Zod. An immutable domain store validates graph relationships and sources, tracks monotonic content revisions, stores pending change sets separately, and applies selected operations atomically. Undo restores prior content without reusing an old revision number.

The WebMCP adapter registers tools through native `document.modelContext`. Tool declarations and runtime argument validation come from the same strict schemas. Inputs and outputs are bounded; source content is marked untrusted; read-only tools are identified explicitly. Registration uses an AbortSignal for cleanup, and the adapter reports actual capability and registration failures instead of installing a fake browser API.

The map, list, inspector, review tray, and brief are views over that same store. There is no separate agent-side copy of the research to drift out of sync.

## Challenges we ran into

The difficult part was maintaining the boundary between a suggestion and a fact. A successful tool call must not imply approval. A partially valid batch must not partially change the record. An export must not quietly include rejected ideas. These rules are enforced in the domain layer, not just described in the interface.

The experimental browser API also required checking the implementation rather than assuming a stable signature. Actual Chromium testing found a working native document API in version 151 with explicit WebMCP flags, including real registration and invocation. That build still uses JSON-string invocation arguments and does not deliver callback execution options. The implementation and verification notes distinguish those observations from the newer draft.

## Accomplishments and verification

The local prototype completes the full journey: inspect a source, challenge an assumption, review proposed operations, edit and accept some, reject others, export an accepted-state brief, and undo.

The final local verification passed 110 unit tests and 19 browser tests, including three actual native-WebMCP tests. Native checks registered all ten tools, invoked the actual application handlers, verified proposal-only writes, and exercised cleanup and remount. The built production app passed the review/brief/undo journey in Chromium and WebKit with no CSP violations or external requests. A responsive pass also completed 309 assertions and 48 automated accessibility scans. These checks do not claim complete accessibility conformance or model reasoning accuracy.

The built-in **demo rehearsal is a fixed six-call script through the same handlers**. It is labelled as a rehearsal, does not generate AI reasoning, and works without native WebMCP. No external model prompt runs are claimed by those tests. A separate set of 14 manual browser-agent evaluation cases is prepared but has not yet been run with an external model.

## What we learned

Trust becomes easier to inspect when the interface shows the unit of change. A human can evaluate one evidence link or one conflict explanation more precisely than a large replacement answer. Keeping source material, proposals, accepted content, and activity distinct makes that judgement possible.

## What is next

The release work is to choose the final name and approve the licence, publish a reviewed repository, deploy and smoke-test the app on its actual HTTPS origin, evaluate real browser-agent clients, and approve and publish the narrated walkthrough. A local 2:40 video draft with synthetic narration and 39 captions, plus 14 screenshots, is already prepared. Browser support and model behaviour should be reported with their exact tested versions and traces.

## Links and attribution — fill before submitting

| Field | Status |
| --- | --- |
| Final project name | Human confirmation required; Evidence Board is the working title |
| Team / authors | Human to complete accurately |
| Public demo | Pending HTTPS deployment and verification |
| Public source repository | Pending repository review, publication, and licence choice |
| Narrated public YouTube video | Pending recording review and upload |
| Test evidence | Local verification is in `evals/RESULTS.md`; rerun against the release commit |
| AI/tool and third-party attribution | Complete truthfully for the actual development process and applicable submission requirements |

## Concise pitch outline

- **Problem:** It is easy to turn a plausible interpretation into an unsupported conclusion.
- **Product:** Put claims, evidence, conflicts, and sources in one inspectable workspace.
- **WebMCP:** Let agents use explicit semantic tools over the same state the human sees.
- **Human decision:** Review the individual changes, keep what helps, and export only the accepted record.

Delete draft instructions and replace pending fields only after the corresponding release actions have happened.
