# WebMCP contract

## Browser integration

Tools register only while a guest or account board is open, not on the public landing page. The adapter targets `document.modelContext`, verified against Chrome’s [Imperative API documentation](https://developer.chrome.com/docs/ai/webmcp/imperative-api) (updated August 20, 2026) and the [August 26 WebMCP draft](https://webmachinelearning.github.io/webmcp/). This is an experimental Community Group specification, not a finished W3C standard.

Registration uses `await document.modelContext.registerTool(tool, { signal })`. Aborting that registration signal removes the registration. Execution receives its own `{ signal }` callback option. The adapter rolls back its registrations if any registration fails. It does not use `provideContext`, `unregisterTool`, a navigator polyfill, or an external MCP server. See the [current imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api).

Chrome’s [getting-started guide](https://developer.chrome.com/docs/ai/webmcp) describes the Chrome 149+ origin trial and local `chrome://flags/#enable-webmcp-testing` flag. Use localhost or HTTPS, origin isolation, and a `tools` Permissions Policy that permits the page. Registration availability depends on the actual browser build and configuration. The app never changes these permissions or silently enables a flag.

The adapter omits `exposedTo`, preserving the browser’s default origin boundary. The [tool security guidance](https://developer.chrome.com/docs/ai/webmcp/secure-tools) explains the trust and exposure hints used here.

```ts
import type { BoardStore } from './src/domain/types';
import { createToolRegistry, registerWebMCP } from './src/webmcp';

export async function connectActiveBoard(store: BoardStore) {
  const registry = createToolRegistry(store);
  const registration = registerWebMCP(registry);
  await registration.ready;
  return registration;
}

// Pass the active board's store, as App.tsx does.
// supported: API presence only
// registered: successfully completed registrations; 0 on failure
// error: an actionable browser registration failure, when applicable
// api: 'document.modelContext' or null
// Neither supported nor registered means an external agent is connected.

// Dispose the returned registration when leaving or switching boards.
// registration.dispose();
```

Manual editing, evidence checks, proposal review, and export work without native WebMCP. Test doubles exercise the adapter in unit tests; they are never installed into the application's document. The production UI contains no scripted rehearsal or built-in model.

### Historical local browser verification, August 27, 2026

These observations concern the earlier local release. They are separate from adapter unit tests, have not been rerun against the current authenticated hosted release, and do not establish an external model session:

| Browser | Launch configuration | Observation |
| --- | --- | --- |
| Chromium 151.0.7922.34 | Default | No native `modelContext` exposed |
| Chromium 151.0.7922.34 | `--enable-blink-features=WebMCP,WebMCPTesting` | Native `document.modelContext`; all ten app tools registered and real native invocations completed |
| Chromium 149.0.7827.55 | Default | No native `modelContext` exposed |
| Chromium 149.0.7827.55 | Same explicit flags | Legacy `navigator.modelContext` only; this app reports current API support as unavailable |

The tested 151 build uses JSON-string arguments for its native `executeTool`; this matches its [versioned Chromium IDL](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/third_party/blink/renderer/core/script_tools/model_context.idl). Its callbacks receive no execution-options argument, matching the [151 callback definition](https://raw.githubusercontent.com/chromium/chromium/151.0.7922.34/third_party/blink/renderer/core/script_tools/model_context_tool.idl). The newer draft accepts objects and passes a callback signal. Our callbacks accept that signal when supplied, but **native callback-signal delivery was not verified in 151**. Browser cancellation before dispatch was verified separately.

The real-browser checks demonstrated read purity, argument errors, a pending proposal without accepted mutation, and registration cleanup/remount from 10 → 0 → 10 → 0. Current repeatable Playwright tests in `tests/e2e/native-webmcp.spec.ts` now target the public sample and actual document navigation. They explicitly skip unsupported native builds and never install a modelContext mock. Current results must be reported separately from this historical probe. The fuller probe `node evals/check-native.mjs` saves `.local/native-webmcp-check.json`. No model or external agent participated. Chrome 149 being eligible for an origin trial does not mean that its older API implements this app’s current document-based adapter.

### Current judging build verification, August 27, 2026

The current guest experience passed all 23 Playwright tests in Chromium 151.0.7922.34, including four actual native WebMCP tests. With explicit WebMCP/WebMCPTesting flags, all ten tools registered; a native read preserved accepted content; invalid arguments were rejected; a native write produced a pending proposal without acceptance; and pre-dispatch cancellation produced no proposal. A wording-only update preserved omitted confidence fields. Actual navigation from the board to the landing page and back gave 10 → 0 → 10 tools. No modelContext mock or external model was used.

The corrected public judging release at [the hosted Site](https://evidence-board-judging.fink692.chatgpt.site/), source `8a93f6b7f262f1bff0b5acbf68f0d024eb758737`, also passed all 23 browser tests, including those four native cases, with one worker and no retries. An initial concurrent run had two document-navigation timeouts before application code loaded; the complete isolated run passed without changing application assertions. The real hosted walkthrough separately exercised four native calls, selective approval, cited export, exact Undo, and reload persistence.

The earlier compiled preflight additionally passed desktop Chromium and mobile WebKit review, brief, export-state/undo, security-header, CSP, and no-external-request checks. Mobile started in the structured list without downloading the graph chunk. The 151 callback-signal limitation described above still applies. See [current verification and media scope](../submission/current-verification.md).

## Ten tools

| Tool | Purpose | Effect |
| --- | --- | --- |
| `get_board_summary` | Accepted question, conclusion, claim coverage, counts, and revision | Read accepted content |
| `get_evidence` | Source attribution and evidence text; optional evidence/claim ID and pagination | Read accepted content |
| `find_nodes` | Text/kind search and unlinked, unsupported, conflict, or gap filters | Read accepted content |
| `create_claim` | Claim, confidence, and rationale | Pending proposal |
| `add_evidence` | Evidence with an existing source or supplied source metadata | Pending proposal |
| `link_evidence` | Supports, challenges, or context relationship with reason | Pending proposal |
| `flag_conflict` | A conflict covering at least two distinct nodes | Pending proposal |
| `propose_change_set` | Related proposed operations with individual rationale | Pending proposal |
| `focus_view` | Existing node IDs, map/list, optional filter and query | Presentation only |
| `create_brief` | Cached brief derived from accepted content | Derived local artifact |

Only the first three tools carry `readOnlyHint: true`. Activity logging is observational; these tools leave accepted content, its revision, selection, and proposals unchanged. Focus and brief tools declare `readOnlyHint: false` because they affect presentation or derived state. All tools carry `untrustedContentHint: true` because their output may contain board text.

There is **no approve, apply, undo, reset, import, download, network, or publish tool**. The similarly named domain functions exist for human UI controls, but they are not in the registry. A proposal tool returning successfully means a pending review exists; it does not mean its changes were accepted.

## Input and result shapes

The declarations and runtime argument validation come from the same Zod schemas in `src/webmcp/schemas.ts`. Every object rejects unknown properties. Additional domain validation checks references, node kinds, duplicate relationships, source dates/URLs, and content revisions.

Budgets: titles 160 characters, body/source excerpt 3,000, rationale 1,000, query 160, IDs 96, source URL 1,000, aggregate input 65,536. A batch contains 1–12 changes; a conflict 2–10 distinct nodes; focus at most 20 nodes. Search returns at most 10 nodes and evidence browsing at most 4 items per page.

Browse output uses previews and continuation offsets. Passing a specific `evidenceId` returns its full accepted body and source excerpt (up to the domain’s 6,000 characters each). This deliberate full-text exception can exceed the small result budget recommended for ordinary tools. Truncation is explicit; callers should not treat previews as complete sources. `create_brief` returns a bounded preview and the location of the full local artifact, not the entire document.

```json
{
  "baseRevision": 1,
  "title": "Check the overnight assumption",
  "summary": "Review previously unlinked counterevidence.",
  "changes": [{
    "title": "Link the entry-count evidence",
    "rationale": "Actual visits qualify the preference survey.",
    "operation": {
      "type": "link_evidence",
      "evidenceId": "evidence_turnstile",
      "claimId": "claim_demand",
      "stance": "challenges",
      "reason": "Only 8% of trial entries occurred after midnight; entries do not measure time spent or unmet need."
    }
  }]
}
```

The library IDs and statistics in these examples belong to the historical fictional fixture. They are not present in a fresh board or the AI-coding sample. Discover the active board's IDs with the read tools before proposing changes.

Use the revision from the latest summary; `1` above is illustrative. Batches support `create_claim`, `create_question`, `add_evidence`, `update_node`, `delete_node`, `link_evidence`, `unlink_evidence`, `flag_conflict`, `resolve_conflict`, and `set_conclusion`. These are **proposed** operations, including deletion. Created items may have supplied IDs so later operations in the same batch can reference them. Dependencies must be created first. Partial selection is validated again during human approval.

An evidence source is either `{ "id": "source_survey" }` or complete metadata: `title`, `publisher`, `date`, `excerpt`, optional `url`, optional `reliability`, and optional `fictional`. Defaults are medium reliability and `fictional: false`; these values are assertions supplied by the caller, not external verification. Sources are never fetched. Source URLs must use HTTP(S), contain no credentials, and pass domain validation.

```ts
const result = await registry.invoke('get_evidence', {
  evidenceId: 'evidence_turnstile',
}, { signal: controller.signal, actor: 'agent' });

// result.content: a short human-readable text block
// result.structuredContent:
//   { status: 'ok' | 'proposal', revision, data, dataTrust }
// or { status: 'error' | 'cancelled', revision, error }
// result.isError: true for errors/cancellation
```

The native API serializes the returned object itself. We keep a text block plus structured data so diagnostics and consumers can both read the result. Errors include a code, safe message, next action, and bounded field details where useful. Examples include `INVALID_ARGUMENTS`, `NOT_FOUND`, `DUPLICATE_ID`, `STALE_REVISION`, `VALIDATION_ERROR`, `INVALID_STATE`, `UNKNOWN_TOOL`, and `CANCELLED`. An unexpected failure returns `INTERNAL_ERROR` without a stack trace.

## Approval, cancellation, and trust

Each invocation logs its actual start and terminal state: `running`, `complete`, `error`, or `cancelled`. Input/output log snapshots are bounded. Browser callbacks have the `agent` actor. The `demo` actor is retained for historical rehearsal and test code, which is not exposed in the current UI. This records invocation origin, not a claim that a model generated the content.

Creation provenance uses the domain's `agent` value for assisted proposals. The editable sample instead records `sample` provenance and explicitly discloses Codex's preparation of its suggestions in system activity. Historical rehearsal activity distinguishes `demo` from native invocation. Human review and acceptance are logged separately as human actions.

Cancellation is checked before validation and after a microtask checkpoint. Local handlers then commit synchronously with no intervening await. Cancelling before this commit creates no proposal or content change. A cancellation after a completed call is not a rollback; human Undo handles accepted changes. Registration disposal and execution cancellation are separate lifecycles.

Tool content writes always enter `BoardStore.proposeChangeSet`. Human controls can edit accepted content directly. The domain validates the complete prospective graph before storing a pending proposal, checks its base revision, and validates the selected operations again at human approval. Accepted revisions are monotonic, including after Undo. Pending/rejected operations never feed the brief generator.

Source text, search results, titles, and tool outputs are untrusted data. They cannot invoke a handler, approve a proposal, or add a tool. Trust annotations are useful signals, not a guarantee against prompt injection in a connected model. In account mode, complete sessions are saved to the private Sites backend. In guest mode, sessions stay in browser storage and the guest controller makes no account API calls. The application does not scrape source URLs or call a built-in model; a user-connected agent or extension may send tool outputs to its own provider. Only connect agents you intend to share the board with. The exposed-tool boundary is not a sandbox against an extension or same-origin script that already has arbitrary page execution.

## Historical rehearsal fixture and verification

`runDemoChallenge(registry, store, signal?)` remains historical source and test material, not a current product control. It calls six real handlers: summary, survey evidence, entry-count evidence, unlinked search, focus, then one proposal. The proposal links counterevidence, flags the survey/usage tension including `claim_demand`, and adds an exam-week-versus-baseline research question. It never approves anything, waits on an artificial “thinking” timer, or asserts native support.

The fixture comparison prevents this fixed script from pretending to analyze edited reference evidence. An existing pending demo proposal is reopened instead of duplicated. The historical walkthrough used six calls; reopening needed only a current summary. Current research uses human editing and, when available, a connected browser agent.

Run `pnpm exec vitest run src/webmcp` for schema, safety, adapter lifecycle, cancellation, and full selective-review/undo checks. See `evals/README.md` for prompt cases and honest verification status. Unit tests and the rehearsal do not demonstrate external model tool selection or a live native browser connection.
