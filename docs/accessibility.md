# Accessibility

The target is WCAG 2.2 AA. This document records implementation and checks; it is not a certification.

## Implemented

- Real HTML buttons, fields, labels, headings, native dialogs, and visible focus rings.
- A complete structured list instead of a canvas-only evidence model. Each relationship states its stance and rationale; every source is reachable without dragging.
- Map cards support keyboard selection. Focused items can be brought into view, and map controls have accessible names.
- Mobile defaults to the list. Narrow-screen inspector behaviour uses a contained dialog with focus restoration; desktop uses an adjacent inspector.
- Mobile navigation uses a native modal dialog with a visible close control, keyboard containment, Escape/backdrop dismissal, focus return, and desktop-resize cleanup. Background controls are inert while it is open.
- A keyboard command palette (`Ctrl`/`Command` + `K`), `/` search, and undo outside text fields. Native text editing shortcuts are preserved.
- Proposed changes have labelled checkboxes, explicit before/after text, editable wording, and a human approval button. Stale proposals are invalidated with a visible explanation.
- Supports, challenges, context, and conflicts use text/icons as well as colour. Tool states use visible words.
- Status updates announce selected actions; validation errors have alert semantics. Decorative icons are not the sole control label.
- System reduced-motion preference disables nonessential movement. Forced-colour fallbacks and browser print rules are included.
- Canadian English document language and locale-aware dates. Calendar source dates do not shift when viewed west of UTC.

## Automated checks

Playwright exercises keyboard interactions, dialog focus, mobile review, the semantic list, no horizontal page overflow, and the complete approval journey. Axe runs the WCAG 2 A/AA, 2.1 AA, and 2.2 AA tags on the board, review, source library, brief, and mobile list.

The final responsive workstream passed 309 assertions and 48 axe scans across 320, 768, 1024, and 1440-pixel viewports, including settings, creation, source details, conflicts, expanded proposal payloads, and keyboard focus coverage. Chromium and WebKit navigation checks passed. The map/list workstream also verified map initialization/viewport movement and rendered source labels. See `docs/testing.md` for the consolidated run.

Map zoom can reduce effective type size. The initial viewport keeps source labels readable and offers pan and zoom rather than forcing all cards into a tiny overview. Fit-all deliberately trades text size for overview; the list is the reading alternative.

## Still requires a human release pass

- NVDA or VoiceOver reading order, speech verbosity, and live-announcement behaviour.
- 200% browser zoom and operating-system high-contrast review beyond automated viewport checks.
- Touch usability on a physical device and real assistive technology.
- Final review of a public hosted build, not just localhost.

No statement of full WCAG conformance is made from automated tests alone.
