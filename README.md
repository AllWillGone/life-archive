# LifeArchive

A Mnemosyne-inspired autobiographical memory system for AI-assisted reflection.

LifeArchive is an open template for keeping long-term personal memory with AI agents. It separates what happened, how it felt, what is current, and what support or advice was generated during conversations.

> Mnemosyne is the Greek goddess of memory. LifeArchive keeps the name easy to search while preserving that memory-centered spirit.

## Why This Exists

Long AI conversations can become more useful when context is preserved carefully. LifeArchive offers a plain-text structure for recording autobiographical memory without turning every conversation into a questionnaire.

The core idea is simple:

- `fact/` records what happened.
- `feeling/` records how the person felt, interpreted events, and changed over time.
- `summary/` records compressed overviews, current state, timelines, people, and topics.
- `session/` records short post-conversation update summaries, not full transcripts.
- `support/` records advice, action reminders, and supportive analysis generated during conversations.
- `inbox/` temporarily stores fragments that cannot yet be filed accurately.
- `archive/` stores old formats, retired notes, or migration backups.

## Repository Structure

```text
LifeArchive/
├─ AGENTS.md
├─ README.md
├─ CHANGELOG.md
├─ LICENSE
├─ fact/
│  ├─ index.md
│  └─ events/
├─ feeling/
│  ├─ index.md
│  └─ by_event/
├─ summary/
│  ├─ overview.md
│  ├─ current.md
│  ├─ timeline.md
│  ├─ people.md
│  └─ topics.md
├─ session/
├─ support/
│  ├─ index.md
│  └─ by_event/
├─ inbox/
│  └─ unresolved.md
├─ archive/
└─ examples/
```

## Using LifeArchive

1. Copy this template into a private personal memory repository.
2. Read `AGENTS.md` before asking an AI agent to maintain the memory system.
3. Keep real personal memory repositories private unless you intentionally sanitize them.
4. Use the `examples/` directory as a structural reference only.

A useful startup prompt:

```text
Please read AGENTS.md first. Respond naturally to the current conversation, and only update the memory files when new facts, feelings, relationship clues, event clues, support notes, or unresolved fragments should be preserved. Keep facts, feelings, summaries, sessions, support notes, and inbox fragments separated according to the repository rules.
```

## Privacy Warning

LifeArchive is designed for personal and potentially sensitive records. Do not publish a filled memory repository unless you have carefully removed private facts, names, places, emotional records, session summaries, and Git history that may contain earlier private versions.

For public sharing, publish this template or a sanitized fork. For real memory use, keep the repository private.

## License

MIT License. See `LICENSE`.
