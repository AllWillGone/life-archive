# LifeArchive

English | [简体中文](README.zh-CN.md)

A Mnemosyne-inspired autobiographical memory system for AI-assisted reflection.

LifeArchive is a public template for building a private, long-term memory archive with an AI assistant. It is designed to record lived events, relationships, emotional changes, unresolved fragments, and conversation-derived support while keeping facts and feelings clearly separated.

This repository contains only rules, folder structure, templates, and sanitized examples. It should not contain real personal memories. For actual use, copy this template into a private repository. For public sharing, publish only the template or a thoroughly cleaned copy.

## Why This Exists

Most AI memory systems either flatten personal history into short summaries or mix facts, emotions, advice, and guesses into one pile. LifeArchive takes a slower autobiographical approach:

- `fact/` records what happened.
- `feeling/` records how the user felt, understood, reacted, and changed over time.
- `summary/` keeps compressed overviews, current state, timelines, people, and topics.
- `session/` stores post-conversation memory update summaries, not full chat logs.
- `support/` stores advice, action reminders, and supportive analysis without mixing them into core autobiographical memory.
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
  support/
    index.md
    by_event/               # Advice and supportive analysis by event
  session/                  # Post-conversation update summaries
  inbox/                    # Unresolved fragments
  archive/                  # Old or migrated material
```

## How To Use

1. Copy this repository into a private location.
2. Ask your AI assistant to read `AGENTS.md` before maintaining the archive.
3. Start from `summary/overview.md`, `summary/current.md`, and `summary/timeline.md` when restoring context.
4. File new information by event, not by chat date.
5. Keep facts, feelings, support, and unresolved fragments in their own places.
6. Never publish a filled private archive without removing personal data and Git history.

## Starter Prompt

Use this when starting a new conversation. Replace `<your LifeArchive path>` with the actual path.

```text
Please read <your LifeArchive path>\AGENTS.md first, then talk with me naturally while prioritizing the current conversation. Memory maintenance should not take over the conversation: when new facts, emotional changes, relationship clues, or event clues appear, quietly update the memory files under <your LifeArchive path> during this turn according to the rules. File information into the matching event when possible; if it cannot be safely filed yet, put it in inbox. Advice, action reminders, or supportive analysis from the assistant should not be written into feeling by default; if worth preserving long-term, write them into support. Do not routinely end replies by saying "recorded" or "updated" unless I explicitly ask, the update involves an important structural change, or the task itself is memory organization. If you do mention updates, first verify that the file write actually succeeded. Do not claim a file was updated based only on intention or memory.
```

## Periodic Cleanup Prompt

Use this occasionally when indexes, summaries, or event boundaries start to drift.

```text
Please read <your LifeArchive path>\AGENTS.md and audit my autobiographical memory system. This is a periodic cleanup task, not ordinary chat, but still follow the rules for conversation priority, truthfulness, write confirmation, underlying memory protection, and fact/feeling separation. Existing content in fact/ and feeling/ is my underlying memory; I usually will not fully restate it. Do not delete, weaken, replace, polish away, or rewrite existing facts, details, emotions, or original wording merely for compression or style. In principle, only adjust chronology, move original text, add links, add date labels, and add minimal connective wording. When unsure whether something may be deleted or rewritten, keep it and ask me.

Audit only first; do not write files yet. Follow the recommended reading order: summary/overview.md, summary/current.md, summary/timeline.md, fact/index.md, relevant fact/events/, feeling/index.md, relevant feeling/by_event/, summary/people.md, summary/topics.md, support/index.md, relevant support/by_event/, inbox/unresolved.md, and recent session files.

Check for:
1. Whether fact and feeling are mixed.
2. Whether fact/events are organized by complete events, relationship stages, or life stages.
3. Whether indexes, timelines, and internal event timelines are sorted correctly.
4. Whether "recently updated" fields are stale.
5. Whether summary/current.md is too long, too detailed, or acting like an event collection.
6. Whether overview, people, and topics need link fixes, deduplication, or compression.
7. Whether inbox fragments can now be filed.
8. Whether support contains only advice, action reminders, and supportive analysis.
9. Whether session files summarize memory updates without storing full chat logs.
10. Whether links, filenames, date precision, real names, uncertainty labels, and UTF-8 handling are consistent.

First output a short cleanup proposal: list the files you recommend changing, how each type of issue should be handled, and whether any split, merge, deletion, or archive decision needs my confirmation. Wait for my approval before writing files. After writing, report only the files that were actually updated successfully; if any write failed or is uncertain, say so clearly.
```

## Privacy Warning

A filled LifeArchive can contain real names, locations, relationships, emotional records, conversation summaries, unresolved fragments, and older private versions in Git history. Treat it as highly private. This public repository is a template; a real archive should normally stay private.

## License

MIT License. See [LICENSE](LICENSE).
