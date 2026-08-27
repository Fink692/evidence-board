# Hosted research workspace

## Two explicit storage modes

PublicEntry routes / to the landing page, /?guest=1 to the editable sample, and /?workspace=1 or /?board=… to the authenticated workspace. Tools register only while an actual board is open.

### Public sample

GuestSession stores a validated complete session under evidence-board.public-guest.v1 in browser localStorage. It never calls the account API. Existing edits survive reload; only an absent saved session initializes the source-generated sample. Source content and suggestions carry sample provenance. There is no copy of private owner data in the judging deployment.

Corrupt saved data is preserved for download. Unavailable storage, quota failures, and detected changes from another tab stop successful-save reporting and offer backup guidance. Edits remain in memory on a failed save; closing a dirty page triggers a leave warning. A reset is explicit and affects only the guest copy.

The complete-session limit is 8 MB, subject to the browser's potentially smaller quota. Anyone using the same browser profile may see the copy; clearing browser data removes it. Keep one editing tab open: comparison before a write detects observed competing edits, but localStorage does not provide the account flow's atomic D1 transaction guarantees. Export a full backup before leaving a conflicted or unsaved tab.

### Authenticated account workspaces

- Sites owns sign-in. The API requires platform-supplied stable identity and email headers; every board query and mutation includes the owner ID. A client-supplied record ID is never authorization. Public page access does not grant access to account data.
- New account boards start empty. An imported sample becomes a separate board and never overwrites existing research.
- D1 stores metadata and complete validated sessions: accepted content, proposals, review selections, activity, and the last 20 undo snapshots. Sessions split at Unicode-safe boundaries into rows below D1's row limit. Conditional writes and chunk replacement occur in one transaction.
- A separate server version guards every session save, including changes that do not advance the accepted-content revision. Stale writes are rejected. The UI offers a separate copy and full backup on conflict.
- Server data is authoritative. Browser storage holds temporary unsaved recovery drafts, removed after acknowledgement. Failed saves remain visibly unsaved; closing a dirty board triggers a leave warning.
- Limits: 100 boards per owner, 8 MB per complete saved session, plus per-board domain limits. Accepted content and pending proposals are never silently discarded to fit a quota.
- JSON writes require a custom same-origin header; cross-site origins/fetch metadata are rejected. API responses are private and uncached. SQL uses bound values.

## Research and trust

Source author, recorded excerpt, URL, known date, and confidence are separate from the researcher's interpretation. Source provenance cannot be relabelled from fictional to real. Check evidence inspects recorded support, unlinked evidence, contradictions, questions, and provenance details. It does not verify factual accuracy or call a language model.

Compatible browser agents use ten tools on the active board. Content writes stay proposals until a person approves them. Neither mode scrapes sources, includes a built-in model, or sends application analytics. A browser agent or extension may send tool outputs to its own provider; connect only agents you intend to share research with.

## Local and production execution

pnpm dev uses the Sites local sign-in simulator and a SQLite database under .local/. The simulated identity is labelled as a local preview. Generated Drizzle migrations initialize that local database. pnpm build produces the browser app under dist/client and a Cloudflare-compatible ESM Worker at dist/server/index.js.

The production Worker receives D1 and static assets from Sites. Production code contains no local sign-in simulator, SQLite adapter, source credential, or AI key. Metadata uses the dispatch request origin, never forwarded host headers. The deployment archive contains only the compiled app, binding configuration, and migrations.

The public judging Site uses a distinct Site project and database. The original private Site's access policy and boards are not modified by this release.

## Verification

Unit tests exercise actual SQLite API authentication, owner isolation, create/reopen, stale-write protection, proposal state, undo, Unicode chunks, malformed records, and conditional deletion. Save-controller tests cover acknowledgements, in-flight edits, offline retries, recovery drafts, proposal-only changes, and transient view state. Guest tests additionally cover reload, corrupt-data preservation, unavailable storage, denied writes, and observed cross-tab conflicts.

Current browser tests use the public guest experience, including actual native calls when supported. Native registration and browser tests do not establish an external model session. Historical recordings remain clearly identified separately.
