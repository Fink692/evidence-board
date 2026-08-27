# Evidence Board — submission release checklist

Evidence Board remains the working title. This checklist tracks actions still requiring a human release decision or verification against the final public release. Local implementation, local test results, and draft assets do not establish that these actions are complete.

Prepared locally: the application, a fictional seed case, ten semantic WebMCP tools, human review and Undo, accepted-state brief export, repeatable tests, 14 manual agent-evaluation prompts, a description draft, 14 application screenshots, and a real 2:40 video draft with synthetic narration and 39 captions. The [local captioned preview](demo-preview.html) and [recording notes](recording/README.md) distinguish playback checks from pending human audio approval. Recorded WebMCP test evidence is in [../evals/RESULTS.md](../evals/RESULTS.md).

## 1. Confirm the identity and submission requirements

- [ ] Choose and approve the final human project name. Until then, retain “Evidence Board” as a working title in the app, repository, video, and description.
- [ ] Confirm team members, authorship, attribution, and accurate disclosure of development tools and AI assistance.
- [ ] Read the current official challenge rules and submission form. Verify eligibility, required assets, evaluation criteria, deadlines, and any naming or licensing conditions directly; this checklist makes no contest-date assertion.

## 2. Publish only the intended repository

- [ ] Choose the public repository and approve its licence. Do not assume that a local folder or draft licence constitutes publication approval.
- [ ] Review the contents and history before publication. Publish the new `evidence-board` application, not unrelated material from the surrounding workspace.
- [ ] Exclude private attachments, research backups, browser profiles, `.local` outputs, environment files, credentials, and unrelated project history.
- [ ] Review third-party code, icons, fonts, dependency licences, and required notices. Preserve the explicit fictional-source labels.
- [ ] Publish the reviewed repository and check that an unauthenticated visitor can read the source, setup instructions, licence, and verification notes.

## 3. Deploy and test the real HTTPS origin

- [ ] Choose the hosting account and public domain, then authorize deployment.
- [ ] Build and deploy the reviewed commit over HTTPS. Record the exact deployed URL and commit; do not label localhost as a public demo.
- [ ] Verify origin isolation and the intended `tools` permissions boundary. Do not broaden `exposedTo` or cross-origin permissions just to make a test pass.
- [ ] Check the current [Chrome WebMCP guide](https://developer.chrome.com/docs/ai/webmcp) for the selected browser and origin. Obtain and configure an origin-trial token if required for that deployment; do not invent a token or assume a local testing flag applies to visitors.
- [ ] Open the deployed URL in a clean browser and verify manual editing, source inspection, review, selective acceptance, Undo, local reload, and Markdown/JSON export and import.
- [ ] Run a production build and the full project tests against the release candidate. Repeat mobile/list, keyboard, dialog, reduced-motion, and accessibility checks; retain the actual results.
- [ ] Verify native registration and invocation on the public origin with an explicitly recorded browser/client configuration. Check that all ten expected tools are registered, reads preserve accepted content, writes remain proposals, and cleanup works.
- [ ] Check fallback behaviour in an unsupported browser. The manual app and labelled rehearsal should still work, without a false native-connection claim.

The local native check passed on flagged Chromium 151.0.7922.34. That build takes JSON-string invocation arguments and does not supply callback execution options. Chromium 149 exposed only the legacy navigator API in the local probe. Repeat these checks for the actual release environment rather than treating a browser-version floor as a guarantee.

## 4. Run actual browser-agent evaluations

- [ ] Connect an intended browser-agent client. Record provider, model identifier, client version, browser version, origin, relevant flags/token setup, and date.
- [ ] Use fictional fixtures for evaluation. Confirm what information the chosen agent sends to its provider before using private research.
- [ ] Run the cases in [../evals/prompt-cases.json](../evals/prompt-cases.json), following their preconditions. Record prompts, actual calls, outputs, UI changes, and revisions.
- [ ] Include grounded source reading, overlooked evidence, a reviewable proposal, unknown IDs, invalid arguments, stale revisions, rejected-content exclusion, and the adversarial source excerpt.
- [ ] Repeat and report attempts, successes, failures, recoveries, and blocked cases honestly. Native integration tests and the deterministic rehearsal are not evidence of model tool-selection accuracy.
- [ ] Update the submission description with measured external-agent results only after those runs exist. Do not convert “14 prepared prompt cases” into “14 passed evaluations.”

## 5. Finalize the narrated public video

- [ ] Review [video-script.md](video-script.md) and approve the narration and the exact actions to show.
- [ ] Capture the real interface. Keep source disclosures, the labelled rehearsal, individual review decisions, approval, brief, and Undo readable.
- [ ] Use actual native registration footage only where the browser reports it. Keep registration, scripted rehearsal, and external model interaction clearly distinct.
- [ ] Review any local silent or synthetic-narrated walkthrough as a draft asset. Confirm it exists, plays correctly, reflects the final UI, and contains no misleading claims before reusing it.
- [ ] Record or approve the narration, add accurate captions, and verify the final runtime is between 2:35 and 2:45.
- [ ] Upload the approved narrated video to public YouTube as requested for the release plan. Verify its visibility and playback without the uploader’s signed-in account, and recheck the official submission requirements.
- [ ] Save the real video URL. A script, silent clip, local MP4, or unverified upload is not a completed public narrated demo.

## 6. Freeze and submit

- [ ] Replace every pending link and author field in [description.md](description.md) with verified information. Use the approved final name consistently.
- [ ] Freeze a release commit or tag after tests, deployment, evaluation, and asset review. Record the exact commit, browser support notes, and known limitations.
- [ ] Open every public link in a clean session: demo, repository, licence, video, and any required supporting materials.
- [ ] Complete the actual submission form and review its fields against the current official rules. Do not imply that Codex has submitted it unless a real submission action and confirmation have occurred.
- [ ] Have the human review and submit the entry. Save the confirmation or receipt and the final public submission URL.

Until those actions are checked with evidence, the status is **local prototype and submission drafts prepared; public release and submission pending**.
