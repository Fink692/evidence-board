# Verification results — August 27, 2026

## Executed

| Check | Observed result | Evidence |
| --- | --- | --- |
| WebMCP Vitest suite | **47 passed**, 0 failed, 0 skipped | `latest-results.json` from a real run |
| Native Playwright smoke | **3 passed**, 0 skipped in this environment | `tests/e2e/native-webmcp.spec.ts`; local artifacts under `.local/native-playwright-results/` |
| TypeScript | Passed with no diagnostics | `pnpm exec tsc --noEmit --pretty false` |
| Native browser matrix probe | Four real launches; one current-API configuration passed all eight checks, three reported unsupported | Generated `.local/native-webmcp-check.json` |

The unit suite has 7 adapter lifecycle tests and 40 handler/rehearsal tests. It covers all ten declarations, bounded and strict inputs, provenance, untrusted source text, no approval tool, stale revisions, atomic proposals, cancellation, read purity, selective human editing/acceptance, excluded rejection, and exact content Undo.

## Native browser observations

Environment: Windows, headless Chromium, a fresh browser context, `http://127.0.0.1:4173`, secure local context, and `Origin-Agent-Cluster: ?1`.

| Browser version | Extra flags | Current document API | Observed outcome |
| --- | --- | --- | --- |
| 151.0.7922.34 | None | Absent | Manual/rehearsal fallback |
| 151.0.7922.34 | `--enable-blink-features=WebMCP,WebMCPTesting` | Present | Ten app tools registered; native invocation and lifecycle checks passed |
| 149.0.7827.55 | None | Absent | Manual/rehearsal fallback |
| 149.0.7827.55 | Same explicit flags | Absent; legacy navigator API present | Current adapter correctly reports unsupported |

On the flagged 151 build, `document.modelContext.executeTool` invoked the real app’s summary tool and produced a completed activity entry. A separate same-origin document imported the application’s actual adapter and store to check native validation errors, a pending link proposal, unchanged accepted content/revision, pre-dispatch cancellation, and cleanup/remount from 10 → 0 → 10 → 0. The browser API was never replaced with a test double.

This browser build takes **JSON-string native invocation arguments**, unlike the object argument in the newer draft. It **does not deliver execution options or an AbortSignal to the tool callback**. The application supports a callback signal when a browser supplies one; these native runs prove only cancellation before browser dispatch. See [the API notes and versioned Chromium references](../docs/webmcp-tools.md#observed-browser-compatibility-august-27-2026).

## Not executed or claimed

- External model/agent prompt runs: **0**. The 14 cases in `prompt-cases.json` remain a manual evaluation plan.
- No claims about an agent’s tool-selection accuracy, natural-language reasoning, or resistance to prompt injection.
- No claim that every Chrome 149+ build supports this document API.
- No claim of native callback-signal support in the tested 151 build, or of behavior in newer untested browsers.
- No remote deployment, credentialed client integration, or contest submission is established by these results.

Run the commands in [README.md](README.md) to reproduce the checks. A skipped native smoke test means the browser could not demonstrate that capability; it is not a pass for native integration.
