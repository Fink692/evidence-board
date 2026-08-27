# Evidence Board build plan

Working title from the supplied PDF; the final submission name remains the user's choice.

## Intent

Build the full golden journey: inspect a fictional university library research case, ask a browser agent to challenge the conclusion through WebMCP, review and edit individual proposed operations, accept some and reject others, undo, and export a brief derived only from approved evidence.

## Architecture

- A completely separate application in `evidence-board/`; do not modify the existing application or root workspace configuration.
- React + TypeScript + Vite. Static deployment and browser-local persistence suit the document's local-first, no-auth, no-AI-backend scope better than adding a server framework.
- One immutable domain store for human controls and WebMCP. Monotonic content revisions, atomic validated changes, provenance, selective approval, and exact content undo.
- Ten semantic tools behind a native `document.modelContext` adapter, with compatibility detection, structured errors, explicit schemas, cancellation, and an observable tool log. No fake browser support.
- A clearly labelled deterministic demo invokes the same tool handlers. It is a rehearsal, not an AI inference engine or proof of an external agent connection.
- A warm paper / forest-green research workspace: interactive evidence map, equivalent structured list, inspector, sources, review tray, activity, and decision brief.
- Fictional, locally seeded research only. Imported text is untrusted data. No remote fetching, credentials, paid services, automatic publication, or external submission.

## Workstreams

1. Domain: typed entities, seeded case, shared store, validation, history, brief, persistence, unit tests.
2. WebMCP: current official API verification, ten tools and schemas, safety, demo runner, integration tests.
3. Map/list: accessible interactive graph, filtering, selection, evidence relationship parity.
4. Product shell: navigation, inspector, review/edit/apply/undo, forms, search, sources, brief, setup, responsive polish.
5. Verification and delivery: production build, unit/integration/E2E/a11y checks, screenshots, local preview, deployment config, README, security note, and submission draft.

## Required gates

- Agent writes only produce reviewable proposals; approval is a human UI operation, never an exposed tool.
- Invalid or stale operations cannot partially mutate content. Rejected proposals never enter exported briefs.
- Read-only tools preserve persistent board content. State and UI use the same domain functions.
- Demo, manual editing, and export work without a model key or native WebMCP.
- Fresh-browser golden journey, selective approval, undo, reload, mobile list, keyboard interactions, and reduced motion are tested.
- Native browser/agent claims distinguish actual checks from adapter tests and deterministic rehearsal.
- Public deployment, final human project name, video upload, and contest submission remain explicit release tasks unless completed and verified.

## Local delivery record — 27 August 2026

The application and local submission package are implemented. Typecheck and production build pass; 110 unit tests, 19 browser tests, both production browser smoke journeys, and the 309-assertion/48-scan responsive pass completed. Production and full dependency audits returned no advisories. The local package includes 14 screenshots and a verified-playback 2:40 narrated draft with external captions. See `docs/testing.md` for scope and limitations, and `submission/checklist.md` for the remaining human/public release steps.
