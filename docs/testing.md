# Testing and verification

Local verification was performed on 27 August 2026 with Node.js 24.19.0, pnpm 11.19.0, and the locked dependencies. These are observations of this local application, not a claim that a public deployment, external AI agent, or contest submission has been tested.

## Reproduce

From the `evidence-board` directory:

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium webkit
pnpm test:e2e
pnpm test:production
```

`./start.ps1 -Mode check` also passed on the supplied Windows workspace, including its bundled-runtime fallback. The browser suite starts its own development server if port 4173 is free. The production smoke test starts and stops a separate loopback preview of the existing `dist/` build, using the configured production security headers.

## Recorded results

| Check | Result | Scope |
| --- | --- | --- |
| TypeScript | Passed | Strict application, unit-test, and browser-test type checking |
| Vitest | 110 passed | 58 domain/store, 40 tool handlers, 7 native-adapter contracts, 5 proposal-display checks |
| Playwright | 19 passed, no skips | 13 workspace journeys, 3 navigation/inspector/map accessibility regressions, 3 actual native WebMCP tests |
| Production build | Passed | Separate map chunk; self-hosted fonts; no oversized-chunk warning |
| Production browser smoke | Passed on Chromium 151 and WebKit 26.5 | Built assets, security headers, native read on Chromium, honest fallback on WebKit, selective review/brief/undo on both |
| Registry dependency audit | No advisories returned | Production and full lockfile trees; not a guarantee against unknown vulnerabilities |
| Responsive/dialog audit | 309 assertions and 48 axe scans passed | 320, 768, 1024, and 1440-pixel viewports; expanded review payload, dialogs, overflow, and keyboard reachability |

### Behaviours covered

- Read-only tools preserve accepted content and revision. Writes prepare pending proposals. No exposed tool approves or resets the board.
- A three-operation rehearsal leaves accepted content unchanged. Human selection accepts two operations and rejects the question; edits to wording are visible and persisted.
- Approval validates all selected operations atomically. Unknown references, invalid input, prototype keys, and stale revisions fail without partial changes.
- Undo restores the exact accepted content, including source and relationship state, while the revision increases to invalidate old proposals.
- Briefs include accepted conflicts and cited evidence, omit rejected proposals, and escape untrusted Markdown/HTML-like content.
- Manual evidence/source creation, editing, linking, unlinking, and conflict flags use the same reversible domain operations.
- JSON import/export, reload, malformed sessions, blocked/quota-limited storage, Unicode byte-size differences, and near-limit portable backups are exercised.
- An imported source named `new` remains a normal reusable source. The new-source UI sentinel cannot collide with valid source IDs.
- Proposal before/after displays include every patched field, link reasons, conflict participants, and new evidence attribution. An expandable complete operation exposes the remaining fields.
- Keyboard paths include the command palette, map focus, narrow-screen inspector focus containment and restoration, nested edit dialogs, and Escape.
- Mobile navigation uses a native modal dialog, keeps focus on visible controls, restores the invoking button, and cleans up when resized to desktop. Additional Chromium and WebKit keyboard checks passed.
- Automated axe checks cover the desktop board, review, source library, brief, mobile list, and mobile/tablet inspector. These are sampled automated checks, not a conformance certification.

### Native WebMCP

The native tests used **Chromium 151.0.7922.34** with `WebMCP` and `WebMCPTesting` enabled. They called the browser's own `document.modelContext`; no API shim, mock connection, or external model was substituted. All ten tools registered. Native reads, proposal-only writes, invalid arguments, pre-dispatch abort, disposal, and remount passed.

This browser's native caller accepts JSON-string arguments. It does not deliver a callback execution signal. Adapter tests cover the current callback contract, but native callback-signal delivery is **not** claimed. Default Chromium has no native API; the manual application remains available. See [webmcp-tools.md](webmcp-tools.md) and [the evaluation record](../evals/RESULTS.md).

### Production security

The production smoke suite checks the actual built app with a self-only script policy, origin isolation, content-type protection, referrer restrictions, and the intended tools permission boundary. Zod's optional JIT is disabled before schema creation so it does not attempt a Function-constructor probe under the strict script policy. The test records CSP events and unexpected external requests; it does not relax the policy to make the test pass.

It also verifies that mobile list mode does not download the graph JavaScript chunk, and runs selective approval → brief → exact undo on Chromium desktop and WebKit mobile. Its machine-readable output is `.local/production/results.json` after a successful run. A missing browser installation or failed assertion makes the command fail.

## Reports and limits

- `pnpm exec playwright show-report` opens the most recent browser report. Failed tests retain screenshots and traces.
- `evals/check-native.mjs` and the native Playwright tests are repeatable native probes; the former records a local browser matrix.
- The 14 cases in `evals/prompt-cases.json` are prepared **external-agent prompts**, not 14 passed model evaluations. Model selection and autonomous tool sequencing remain unverified.
- Human NVDA/VoiceOver testing, physical mobile interaction, user research, the chosen public HTTPS origin, actual agent-client integration, and final video/audio approval remain release tasks.
- The app is local and single-browser. Concurrent tabs do not merge edits. Back up research before clearing browser data.

Any changes after the recorded run should be rechecked with the commands above.
