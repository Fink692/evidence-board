# Portable research sample

[ai-coding-sample.json](ai-coding-sample.json) is an editable example generated from `src/data/showcase.ts`. It is **not an export of the owner's current account or personal research**. Its source summaries are paraphrases of eight linked publications, and its pilot decision is illustrative. No user results, budgets, salaries, or approvals are asserted.

## Open it

1. Start the app with `pnpm dev` and open `http://127.0.0.1:4173`, or use a hosted deployment you are authorized to access.
2. Sign in. Local development uses a simulated development account; hosted sign-in uses Sites identity.
3. From **Your workspace**, choose **Import board** and select `ai-coding-sample.json`.
4. The app creates a separate saved board. It does not overwrite an existing board or require access to the original owner's account.

The full session contains 23 cards, eight sources, 25 links, three unresolved conflicts, a proposal with three reviewable changes, and four sample-assembly undo snapshots. Sample content and suggestions are labelled as such. Review the sample proposal before editing accepted content, because a direct edit can make its base revision stale.

The prepared proposal demonstrates review controls. It is not evidence that a browser agent generated or executed a proposal. Native WebMCP availability and an actual agent session must be checked separately.

## Regeneration

`node scripts/export-showcase.mjs` generates the file from source and validates a complete-session import before writing it. It refuses to overwrite an existing file. It does not read a database, access a browser, change a deployed board, or publish anything.
