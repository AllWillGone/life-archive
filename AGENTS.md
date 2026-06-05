# LifeArchive Agent Rules

This file defines how AI agents should maintain a LifeArchive autobiographical memory system. It records maintenance rules only; real experiences, personal facts, emotional records, and conversation summaries belong in `fact/`, `feeling/`, `session/`, `support/`, `summary/`, or `inbox/`.

## Goals

- Keep normal conversation natural, supportive, and analytical.
- Identify facts, emotional changes, relationship clues, and event clues from conversation.
- Separate facts from feelings.
- Maintain summaries and indexes so future agents can read high-level context first, then details as needed.
- Store uncertain or hard-to-file information in `inbox/` instead of inventing structure too early.

## Conversation First

- The user's current conversation always comes before memory maintenance.
- Respond to what the user is saying before thinking about records.
- Do not turn ordinary conversation into a mechanical form.
- Do not routinely end replies with file-update reports unless the user asks, the task is explicitly about memory maintenance, or a structural change needs confirmation.
- Never claim a file was updated unless the write operation actually succeeded.

## Core Separation

- `fact/` records what happened.
- `feeling/` records how the person felt, interpreted events, reacted, and changed over time.
- `summary/` records compressed overviews, current state, timelines, people, and topics.
- `session/` records short memory-update summaries after conversations, not full transcripts.
- `support/` records advice, action reminders, and supportive analysis generated during conversations.
- `inbox/` stores fragments that cannot yet be filed accurately.
- `archive/` stores old formats, retired material, or migration backups.

## Recommended Reading Order

Read progressively. Do not read every memory file by default.

1. `summary/overview.md`
2. `summary/current.md`
3. `summary/timeline.md`
4. `fact/index.md`
5. Relevant `fact/events/` files
6. Relevant `feeling/by_event/` files
7. `support/index.md` and relevant `support/by_event/` files only when advice or action reminders matter
8. `inbox/unresolved.md` only when unresolved fragments matter

## Fact Rules

Facts are organized by complete events, relationship stages, life stages, or meaningful experiences.

- A `fact/events/` file should represent one coherent event or stage.
- Related small details usually belong in an existing larger event.
- Create a new event only when it has an independent beginning, development, and meaning.
- If new information clearly belongs to an existing event, update that event instead of creating a duplicate.
- Use the most precise known start date in filenames.

Filename pattern:

```text
YYYY-MM-DD-event-name.md
YYYY-MM-event-name.md
YYYY-event-name.md
unknown-date-event-name.md
```

Facts should preserve concrete details and the user's wording where possible. If a statement mixes facts, feelings, and interpretations, put only the factual part in `fact/` and move feelings or interpretations to `feeling/`.

## Feeling Rules

Feelings are linked to events and may change over time.

Record the user's own emotions, triggers, interpretations, needs, wishes, bodily reactions, behavior, contradictions, and shifts in viewpoint. Do not diagnose. Do not infer motives without evidence. Preserve complexity instead of compressing feelings into a single label.

Agent suggestions do not belong in `feeling/` unless the user clearly accepts, repeats, adopts, or expresses them as their own need, wish, or understanding.

## Support Rules

Use `support/` for advice, action reminders, reassurance, or supportive analysis generated during conversation.

- Do not mix support notes into `fact/`.
- Do not mix support notes into `feeling/` unless they have become the user's own expressed view or need.
- Link support notes to the relevant event when possible.

## Inbox Rules

Use `inbox/` when information cannot yet be filed accurately.

- Put short fragments in `inbox/unresolved.md`.
- For larger themed fragments, create a separate inbox file and link it from `inbox/unresolved.md`.
- Move fragments out of `inbox/` once they can be filed in `fact/` or `feeling/`.

## Write Safety

- Preserve bottom-layer memory in `fact/` and `feeling/`; do not delete, weaken, rewrite, or polish away existing details merely to make records shorter.
- When reorganizing, prefer moving original text, adding links, improving order, and marking uncertainty.
- Ask before deleting or heavily rewriting meaningful personal memory.
- Update indexes and `last updated` fields when relevant files change.
- If a write fails, say clearly that it has not been written successfully.

## Public Repository Safety

A filled LifeArchive may contain private facts, names, places, emotions, and relationship records. Public repositories should use sanitized examples only. Never publish a real personal memory repository or its Git history without deliberate review.
