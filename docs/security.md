# Security and trust boundaries

Evidence Board is a browser-local research workspace. It is not a secure document vault, a source-verification service, or a sandbox for a browser extension with arbitrary page access.

## Approval boundary

The ten tools in [the WebMCP contract](webmcp-tools.md) can read accepted evidence, change presentation, generate a derived brief, or prepare proposals. No registered tool approves changes, imports a board, invokes Undo, resets the workspace, downloads a file, or publishes anything.

Human controls and tools share the same validated domain store. An agent proposal is simulated against the entire current graph before it is stored, but simulation does not change accepted content. Human approval validates the selected operations again and commits them as one transaction. Deselecting an operation that creates a needed node or source causes the whole selected batch to fail; it cannot partially apply.

Every proposal carries the accepted revision it was prepared against. A content change rejects older pending proposals and explains the rejection in the visible notice and activity record. Undo restores the prior accepted content at a new revision and marks the reversed approval `undone`; it does not silently rebase or reapply it.

This boundary protects the registered-tool workflow. A malicious extension, compromised dependency, same-origin script, or person with developer-tools access can act outside that workflow. The application makes no stronger claim.

## Untrusted research data

Node text, source excerpts, URLs, imported records, and tool output are data. They never become instructions, executable code, new tool definitions, or automatic approvals.

- Zod schemas reject unknown fields and enforce text, ID, array, date, and numeric limits.
- Whole-graph checks require evidence to cite an existing source, enforce evidence-to-claim relationships, and reject duplicate IDs, duplicate relationship pairs, and dangling conflict references.
- Source URLs allow only HTTP(S), without credentials or control characters. The store and tool handlers never fetch the supplied URLs or validate a source’s factual authenticity.
- JSON import rejects reserved prototype keys, unsupported format versions, invalid references, and oversized payloads before committing anything.
- A shared serializer enforces a 5,000,000-character budget for the complete formatted backup before accepting content. This includes JSON escaping and formatting, with room for later revisions. A compact import is rejected if its exported form would exceed the same budget; the existing board and undo history are preserved. The UI byte preflight allows up to 15 MB so valid UTF-8 exports are not rejected because their characters use multiple bytes.
- UI rendering uses React text. The brief generator escapes supplied Markdown and HTML syntax; source-link destinations are separately validated and normalized.
- Activity payloads are copied and bounded. Cycles become markers; reserved-key objects are retained as inert JSON text so they cannot poison later session hydration.

Confidence, source reliability, authorship, and the `fictional` flag are recorded assertions, not externally verified facts. An instruction hidden in a source can still mislead a connected model. Trust annotations and human review reduce exposure; they do not prove immunity to prompt injection.

## Storage and privacy

The session is stored under `evidence-board.workspace.v1` in localStorage, with a strict versioned envelope. Hydration validates accepted content, pending proposals, and undo graphs. Corrupt values remain untouched during failed startup recovery; the application displays a warning and opens the fictional case in memory. A subsequent successful save writes the current session.

Storage can be blocked, cleared, or run out of space. Failed saves leave the current board usable in memory and show an export warning. Exports are plain JSON or Markdown, not encrypted backups. Keep a separate export before closing a tab whose storage status reports an error.

The application retains at most 20 undo snapshots, 40 proposal records, and 120 activity entries. Older completed proposal records and older undo snapshots may be pruned. Activity is an explanatory trail, not a complete, tamper-evident audit log. Record identity, timestamp, actor, and tool cannot be rewritten through `updateActivity`, but localStorage itself is controlled by the browser user and same-origin code.

Use one editing tab per workspace. This implementation has no cross-tab coordination or collaborative conflict resolution; multiple tabs can overwrite the same localStorage key. Revision checks protect operations within a store instance, not competing browser tabs.

There is no account system or evidence-processing backend in the domain/tool implementation. A connected browser agent or extension may send tool results to its own provider. Connect only an agent you intend to share the accepted board with. Do not place secrets in source text or tool arguments unless that sharing is acceptable.

## Rehearsal and attribution

The library case is entirely fictional. Its institutions, figures, excerpts, and sources are fixtures, with no invented real research URLs. The initial conclusion is intentionally contestable: a preference for later hours is not proof of overnight demand, and a limited service has not yet been costed.

The rehearsal calls the real handlers but generates no model inference and proves no external agent connection. Its activity actor is `demo`. Created records retain the domain’s `agent` marker for assisted proposal provenance; human approval is recorded separately. This marker is not authentication of a model or person. Imports preserve recorded provenance without certifying it.

## Checks performed

On August 27, 2026, `pnpm test` passed **110 tests**: 58 domain tests, 40 tool tests, 7 adapter tests, and 5 review tests. `pnpm typecheck` also passed. Coverage includes rollback, stale proposals, selective dependencies, source validation, malicious imports, aggregate backup capacity, safe persistence recovery, activity provenance, citation generation, cancellation, and adapter cleanup. Three focused browser regressions passed for Unicode backup round trips, both import size guards, and source-ID selection safety.

These automated checks are not a penetration-test certification, an accessibility conformance claim, or evidence that a live external browser agent has used the product. Native-browser and UI verification are reported separately.
