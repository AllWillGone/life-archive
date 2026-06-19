# LifeArchive

English | [简体中文](README.zh-CN.md)

A Mnemosyne-inspired autobiographical memory system for AI-assisted reflection.

LifeArchive is a public template for building a private, long-term memory archive with an AI assistant. It is designed to record lived events, relationships, emotional changes, unresolved fragments, and post-conversation update summaries while keeping facts and feelings clearly separated.

This repository contains only rules, folder structure, templates, and sanitized examples. It should not contain real personal memories. For actual use, copy this template into a private repository. For public sharing, publish only the template or a thoroughly cleaned copy.

## Why This Exists

Most AI memory systems either flatten personal history into short summaries or mix facts, emotions, advice, and guesses into one pile. LifeArchive takes a slower autobiographical approach:

- `fact/` records what happened.
- `feeling/` records how the user felt, understood, reacted, and changed over time.
- `summary/` keeps compressed overviews, current state, timelines, people, and topics.
- `session/` stores post-conversation memory update summaries, not full chat logs. Ordinary advice, action reminders, comfort, and in-the-moment analysis are kept here briefly by default.
- `support/` is an optional long-term support layer for advice, action reminders, and supportive analysis that the user explicitly wants to preserve for later review.
- `inbox/` holds fragments that cannot yet be safely filed.
- `archive/` keeps old formats, deprecated content, or migration backups.

The guiding principle is simple: preserve the user's underlying memory without rewriting it into something cleaner, safer, or less true.

## Repository Layout

```text
LifeArchive/
  AGENTS.md                 # Agent rules for maintaining the memory system
  README.md                 # English project introduction
  README.zh-CN.md           # Simplified Chinese project introduction
  docs/
    templates/              # Blank file templates
    public-template-safety.md
  examples/                 # Sanitized examples
  summary/                  # Overview, current state, timeline, people, topics
  fact/
    index.md
    events/                 # Event-based factual records
  feeling/
    index.md
    by_event/               # Event-linked emotional records
  support/                  # Optional long-term support layer
    index.md
    by_event/               # Advice and supportive analysis by event, if enabled
  session/                  # Post-conversation update summaries
  inbox/                    # Unresolved fragments
  archive/                  # Old or migrated material
```

## How To Use

1. Copy this repository into a private location.
2. Ask your AI assistant to read `AGENTS.md` before maintaining the archive.
3. Start from `summary/overview.md`, `summary/current.md`, and `summary/timeline.md` when restoring context.
4. File new information by event, not by chat date.
5. Keep facts, feelings, session summaries, optional support notes, and unresolved fragments in their own places.
6. Never publish a filled private archive without removing personal data and Git history.

## Starter Prompt

Use this when starting a new conversation. Replace `<your LifeArchive path>` with the actual path.

Best for: ordinary conversations where the assistant should understand the archive, respond naturally, and quietly maintain memory.

Not for: large cleanup, splitting or merging events, or broad summary compression.

```text
Please read <your LifeArchive path>\AGENTS.md first, then talk with me naturally while prioritizing the current conversation. Memory maintenance should not take over the conversation: when new facts, emotional changes, relationship clues, or event clues appear, quietly update the memory files under <your LifeArchive path> during this turn according to the rules. File information into the matching event when possible; if it cannot be safely filed yet, put it in inbox. Advice, action reminders, comfort, or supportive analysis from the assistant should not be written into fact, feeling, or summary by default, and should not create a separate long-term support index unless I explicitly want that. Keep ordinary advice briefly in the day's session summary. Only when a suggestion has become something I clearly accept, repeat, adopt, or express as "I want / I need / I hope" should it be written as my own need, wish, decision, or current understanding in feeling or necessary summary/current. Do not routinely end replies by saying "recorded" or "updated" unless I explicitly ask, the update involves an important structural change, or the task itself is memory organization. If you do mention updates, first verify that the file write actually succeeded. Do not claim a file was updated based only on intention or memory.
```

## Periodic Cleanup Prompt

Use this occasionally when indexes, summaries, or event boundaries start to drift.

Best for: checking the whole archive for stale indexes, overly small events, duplicate records, unclear filing boundaries, broken links, and sorting issues.

Not for: ordinary conversation, or when you only want to lightly compress `summary/`.

```text
Please read <your LifeArchive path>\AGENTS.md and audit my autobiographical memory system. This is a periodic cleanup task, not ordinary chat, but still follow the rules for conversation priority, truthfulness, write confirmation, underlying memory protection, and fact/feeling separation. Existing content in fact/ and feeling/ is my underlying memory; I usually will not fully restate it. Do not delete, weaken, replace, polish away, or rewrite existing facts, details, emotions, or original wording merely for compression or style. In principle, only adjust chronology, move original text, add links, add date labels, and add minimal connective wording. When unsure whether something may be deleted or rewritten, keep it and ask me.

Audit only first; do not write files yet. Follow the recommended reading order: summary/overview.md, summary/current.md, summary/timeline.md, fact/index.md, relevant fact/events/, feeling/index.md, relevant feeling/by_event/, summary/people.md, summary/topics.md, support/index.md and relevant support/by_event/ only if the optional support layer is enabled, inbox/unresolved.md, and recent session files.

Check for:
1. Whether fact and feeling are mixed.
2. Whether fact/events are organized by complete events, relationship stages, or life stages. Check newly created fact files especially: only keep a separate fact when it has an independent subject, phase, ongoing development, long-term meaning, or truly cannot fit an existing event. Prefer merging ordinary small incidents, one-off chats, short-term emotional shifts, and additions to existing events into an existing fact, the day's session summary, or inbox.
3. Whether indexes, timelines, and internal event timelines are sorted correctly.
4. Whether "recently updated" fields are stale.
5. Whether summary/current.md is too long, too detailed, or acting like an event collection.
6. Whether overview, people, and topics need link fixes, deduplication, or compression.
7. Whether inbox fragments can now be filed.
8. If the optional support layer is enabled, whether support contains only advice, action reminders, and supportive analysis; otherwise, whether advice or supportive analysis has been incorrectly left in fact, feeling, or summary. Only keep such material in feeling or summary/current when it has become my accepted, repeated, adopted, or explicitly stated need, wish, decision, or current understanding.
9. Whether session files summarize memory updates without storing full chat logs.
10. Whether links, filenames, date precision, real names, uncertainty labels, and UTF-8 handling are consistent.

First output a short cleanup proposal: list the files you recommend changing, how each type of issue should be handled, and whether any split, merge, deletion, or archive decision needs my confirmation. Wait for my approval before writing files. After writing, report only the files that were actually updated successfully; if any write failed or is uncertain, say so clearly.
```

## Summary Slimming Prompt

Use this when `summary/` has become too long, too detailed, or too influential on future conversations.

Best for: making summary files lighter navigation entry points.

Not for: splitting or merging underlying events, or rewriting original `fact/` and `feeling/` records.

```text
Please read <your LifeArchive path>\AGENTS.md and audit my memory system. This task is summary slimming, not full periodic cleanup and not ordinary chat.

Goal: make the summary files lighter and more useful as navigation entry points, without turning them into duplicate underlying records. Protect the underlying memory in fact/ and feeling/: do not rewrite, delete, compress, or replace original factual or emotional records. Unless you find obvious broken links, stale links, or incorrect summary references, do not modify fact/ or feeling/.

Focus on:
1. summary/current.md: keep only active relationships, current concerns, current goals, emotional through-lines, and follow-ups that still affect the present. Compress or remove details already settled into fact/events, feeling/by_event, or summary/timeline.md.
2. summary/timeline.md: keep it as a summary timeline. Each entry should usually be one core fact plus relevant links, not a full event narrative or emotional analysis.
3. summary/people.md: record each person's relationship to me, the currently important relationship state, and related event links. Do not turn it into another person's biography or repeat full fact files.
4. summary/topics.md: keep topic entry points and related event links. Do not make it a new long thematic essay.
5. If summary contains advice, action plans, comfort, or in-the-moment analysis from the assistant, remove it unless it has clearly become my own thought, need, decision, or current state.
6. If a summary detail still has long-term value but does not belong in summary, first confirm it already exists in the relevant fact/feeling/session file. If it does not, propose a migration before deleting it.

Principles:
- Slim only the summary layer by default.
- Preserve entry points, not full details.
- Prefer compression, merging, and removing duplicate summary text without changing factual meaning.
- If unsure whether something can be removed, keep it and mark it as needing confirmation, or ask me first.
- Before writing, give me a short plan listing which summary files you want to change, how you will slim each one, and whether anything needs my confirmation. Wait for approval before writing.
- After writing, check links, headings, update dates, and obvious duplication. Then report only the files actually updated successfully.
```

## Privacy Warning

A filled LifeArchive can contain real names, locations, relationships, emotional records, conversation summaries, unresolved fragments, and older private versions in Git history. Treat it as highly private. This public repository is a template; a real archive should normally stay private.

## License

MIT License. See [LICENSE](LICENSE).
