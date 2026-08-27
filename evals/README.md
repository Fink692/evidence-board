# Verification and browser-agent evaluations

There are three different things to verify. Keep their results separate.

| Layer | What it demonstrates | What it does not demonstrate |
| --- | --- | --- |
| Vitest domain/handler/adapter checks | Actual local handlers, atomic review boundary, revision checks, signals, schema handling, lifecycle cleanup | Native browser availability or a model choosing the correct tool |
| Labelled in-app rehearsal | Fixed six-call walkthrough through those same handlers and visible human review | AI inference or an external agent connection |
| Manual native browser + agent evaluation | The selected browser registers the tools and that particular agent completes the prompts | General model reliability or immunity to prompt injection |

## Automated checks

```sh
pnpm exec vitest run src/webmcp
pnpm exec vitest run src/webmcp --reporter=json --outputFile=evals/latest-results.json
pnpm exec playwright test tests/e2e/native-webmcp.spec.ts
node evals/check-native.mjs
```

`latest-results.json`, when present, is output from a real test run. `RESULTS.md` gives its scope and limitations. The adapter test environment is Node and uses a deliberately local test double. That double never runs in the app.

The tests cover all ten tool declarations; runtime validation and bounded inputs; unknown IDs; all supported batch operation mappings; unsafe source URLs/dates; untrusted text; no approval API; accepted-only reads and briefs; stale revisions; cancellation before commit; registration rollback/disposal/remount; and the full rehearsal → selective human edit/approval → excluded rejection → exact content Undo journey.

The three native Playwright tests launch actual Chromium with explicit `WebMCP,WebMCPTesting` flags. They skip if the document API is absent. A separate same-origin harness imports the app’s actual adapter/store for lifecycle checks; neither the harness nor the tests replaces the browser API. The standalone probe also compares default and flagged launches, optionally accepting browser executable paths as command-line arguments. Its generated `.local/native-webmcp-check.json` is local verification output, not a committed model evaluation.

See [the observed browser matrix](../docs/webmcp-tools.md#observed-browser-compatibility-august-27-2026). Chromium 151 required JSON-string native invocation arguments and did not provide callback execution options; successful pre-dispatch cancellation does not establish callback-signal support.

## Manual native-browser protocol

1. Run the app on localhost. Use a browser/build with the current `document.modelContext` API and enable local WebMCP testing as described in [Chrome’s guide](https://developer.chrome.com/docs/ai/webmcp).
2. Open Agent setup. Record the actual browser version, operating system, page origin, relevant flag configuration, API presence, completed registration count, and any error. The expected count is ten.
3. Use the browser’s tool inspector to invoke `get_board_summary`. Confirm a tool activity entry is created and the content revision remains unchanged. Save the returned structured result.
4. Connect an agent of your choice. Record its provider, model identifier, extension/client version, date, and user prompt. This may involve that provider’s credentials; the application itself never asks for or stores them.
5. Restore the fictional fixture before each independent case in `prompt-cases.json`. Follow any listed precondition. Save the tool-call trace, UI outcome, and evidence of the content revision before/after.
6. Mark a prompt pass only if its expected outcome happened and its failure condition did not. Score ambiguous or incomplete runs explicitly; do not count them as passes.
7. Repeat each case at least three times when reporting model behavior. Report exact attempts, successes, failures, recoveries, and the browser/client configuration. Keep observed tool-choice failures separate from registration failures.

The prompt set includes an adversarial source excerpt. A passing local literal-text test only shows that this app treats that string as data. A separate connected-model run is required to assess how the agent handles it; no result establishes a universal prompt-injection defense.

## Result record template

```json
{
  "caseId": "grounded-proposal",
  "date": "YYYY-MM-DD",
  "browser": "exact version",
  "platform": "operating system",
  "client": "extension or agent client version",
  "model": "exact provider/model identifier",
  "nativeApi": "document.modelContext",
  "registeredTools": 10,
  "attempt": 1,
  "outcome": "pass | fail | partial | blocked",
  "traceFile": "relative path to captured trace",
  "revisionBefore": 1,
  "revisionAfter": 1,
  "notes": "Observed behavior, not expected behavior."
}
```

No live browser-agent runs are claimed by this repository’s automated result file. Do not replace this statement with a pass claim without saving actual browser/client evidence.
