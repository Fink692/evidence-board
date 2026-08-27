# Current verification — August 27, 2026

## Application checks

The corrected application release, `8a93f6b7f262f1bff0b5acbf68f0d024eb758737`, passed:

- 147 unit/API tests across seven files, including real SQLite persistence and owner isolation.
- 23 local Playwright browser tests.
- All 23 browser tests against the public judging Site, using one worker and no retries.
- Four actual native WebMCP cases within those browser suites, using Chromium 151.0.7922.34 with `WebMCP` and `WebMCPTesting` enabled.

The native cases check all ten registrations, accepted-content read purity, argument rejection, a pending write without acceptance, pre-dispatch cancellation, title-only patches preserving omitted confidence, and document navigation from ten tools to zero and back. These are real browser API calls, not a mocked document API or an external model session.

The first concurrent hosted run had two initial document-navigation timeouts. Traces did not reach application code. The full isolated run subsequently passed all 23 tests without weakening assertions. The app's source fixes include a regression for a title-only proposed edit unexpectedly applying the default confidence.

The public guest workflow makes no account API requests. Anonymous access to the account workspace API returned 401 with private, no-store caching. The original owner's Site was separately rechecked and remained owner-only; no owner data was copied into the judging sample.

## Actual walkthrough

The published capture is of that corrected hosted release. Later changes add the watch page, media, project links, and documentation. The capture uses a fresh browser profile and real interface actions.

- 160-second real-time sequence, with setup trimmed and no speed change.
- Ten registered native tools; four native invocations: `get_board_summary`, `get_evidence`, `propose_change_set`, and `create_brief`.
- Exact operations reviewed; wording edited; two of three proposed operations selected and accepted.
- Accepted research exported as cited Markdown; Undo restored the exact prior content; reload preserved it.
- No page errors, account API calls, or third-party requests during the capture.
- Final screenshots and encoded frames reviewed for legibility, visible citations, the corrected partial patch, and absence of private data.

Playwright invokes the native tools and operates the human controls. No external language model participates. This demonstrates the interface and the tool boundary, not model tool selection or an unaided human usability study.

## Media

| Property | Verified artifact |
| --- | --- |
| File | `public/evidence-board-walkthrough.mp4` |
| Container duration | 160.033 seconds; browser video timeline approximately 160 seconds |
| Size | 21,080,314 bytes |
| Video | H.264, 1600 × 1000, 25 fps |
| Audio | AAC, 48 kHz mono, 128 kbps |
| Narration | Generic synthetic Microsoft Linda en-CA voice; no impersonation |
| Captions | 45 external WebVTT cues, enabled by default in the watch page |
| MP4 SHA-256 | `F8F262096D99E914700F5D9F7DCF8A8525032DD23B95FBF477A01450A3A2FED3` |

The local watch-page check verified native browser playback advances, seeking to 126 seconds, all caption cues, an initially unmuted player, no media errors, no external requests, and no automated WCAG AA violations on desktop and mobile. Mobile had no page overflow. The source narration was checked for timing, matching captions, and unclipped samples. No human listening review is claimed. Production media delivery is checked after publishing the final assets.

The screenshots are captures of the real public sample. The poster was captured from a fresh profile without altering accepted content or accessing an account.

## Limits

Native WebMCP is experimental and requires a compatible browser configuration. Chromium 151 callback-signal delivery was not demonstrated; the version-specific limitation is documented in [the tool contract](../docs/webmcp-tools.md). An unsupported browser still supports manual research and review.

No external LLM evaluation, user productivity gain, adoption result, or factual verification is claimed. Structural evidence checks find gaps. The sample and its prepared suggestions are illustrative. Browser storage is not an atomic multi-tab database; use one editing tab, heed conflicts, and export backups.

The hosted video is supplementary. A Public YouTube upload, the participant's remaining questionnaire responses, and the required Devpost confirmations are still separate from software and media verification. This document is not a submission receipt.
