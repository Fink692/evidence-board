# Evidence Board

**Tagline:** A research workspace where people and browser agents organize evidence, expose contradictions, and review proposed changes before they shape a decision.

## Inspiration

I built Evidence Board around a simple question: what would research look like if the reasoning stayed visible?

A polished answer can hide the distance between a source, an interpretation, and a decision. I wanted the workspace to preserve those distinctions: which evidence supports a claim, what challenges it, and what still needs an answer. Browser agents should help organize that reasoning while leaving the person in control of the record.

## What it does

Evidence Board turns a research question into connected claims, sourced evidence, and open questions. Each connection records support, challenge, or context. The map, list, source library, and decision brief show different views of the same accepted research.

The judging experience opens without a login. Each browser profile gets its own editable sample about adopting AI coding tools: eight published sources, 23 cards, 25 connections, and three unresolved conflicts. Its scenario and prepared suggestions are explicitly illustrative. Edits and undo history stay in that browser; clearing browser data removes them, so full backups are available.

Private research uses a separate signed-in workspace. Account boards are stored under their owner in D1. The judging sample comes from published example content, not someone's private boards.

## How we built it

I built with Codex, using React, TypeScript, Vite, React Flow, and Zod. Codex helped with implementation, debugging, tests, and the sample's research materials. Sites supplies hosting and identity; a Worker handles authenticated storage, with Drizzle migrations for D1.

Ten native WebMCP tools give a compatible browser agent structured access to the active board. Three read accepted research; five create proposals; the remaining tools focus the view and create a brief. Arguments and proposed relationships are validated.

The crucial boundary is human approval. A successful write tool produces a pending proposal. The person inspects exact operations, edits wording, selects changes, and approves through the interface. No exposed tool can approve its own work, publish, import, or invoke Undo.

## Challenges

Persistence had to include the whole session, not only visible cards. Pending proposals, review selections, activity, and undo snapshots matter when someone returns to their research. Account saves use separate version checks to prevent stale tabs from silently replacing newer work. Copies saved in the browser report storage failures and detected competing edits.

Review also has dependencies: accepting a link without its required evidence must fail clearly. Validation runs again when the person approves a selection.

Keeping claims honest was another design constraint. Native registration is not proof that a model connected, and a labelled sample suggestion is not a recorded browser-agent session.

## Accomplishments

The result brings research organization, agent proposals, human review, citations, export, and undo into one workflow. Contradictions remain inspectable instead of disappearing into a summary. Sources keep their own recorded excerpts alongside the researcher's interpretation.

The public sample makes those interactions accessible without exposing private account data. People can explore, change their minds, and preserve a backup of their work.

## What we learned

The implementation reinforces a practical lesson: agent access needs clear authority and clear feedback. A pending proposal, an accepted revision, and a saved session are different states, and the interface should show them separately.

Evidence quality also cannot be reduced to a coverage indicator. “Check evidence” finds structural gaps; it does not verify facts. Briefs summarize accepted board content and recorded citations. There is no built-in language model or automatic source fetching, and no external model session is claimed.

## What's next

Next steps include evaluations with real connected browser agents, usability feedback on larger boards, and more deliberate source import workflows. The aim is to make research easier to inspect and challenge while preserving attribution, uncertainty, and human approval.

