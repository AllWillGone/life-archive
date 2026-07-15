# LifeArchive

English | [简体中文](README.zh-CN.md)

An autobiographical memory system for long-term, AI-assisted reflection.

LifeArchive is a public template for maintaining a private archive of lived events, relationships, emotional changes, and unresolved context. It keeps observable events, the user's feelings and interpretations, navigation summaries, and post-conversation updates in separate layers so that an AI assistant can restore context without flattening a life into one profile.

This repository contains rules, empty structure, templates, synthetic examples, and sanitized research notes only. It must not contain a real person's memory archive or the Git history of one.

## Core Model

- `fact/` records what happened, preserving source and uncertainty.
- `feeling/` records how the user felt, understood, reacted, and changed over time.
- `summary/`, indexes, and `people/` are lightweight routing layers, not duplicate source records.
- `session/` records memory updates from a conversation, not the full chat.
- `inbox/` is a last-resort holding area for material that cannot yet be filed safely.
- `experiments/` contains system research and is outside autobiographical memory.

The underlying rule is simple: preserve the user's memory without rewriting it into something cleaner, safer-sounding, or more certain than the source supports.

## Repository Layout

```text
LifeArchive/
  AGENTS.md                 # Authoritative maintenance rules
  README.md                 # English project guide
  README.zh-CN.md           # Simplified Chinese project guide
  CHANGELOG.md              # Public template releases
  docs/
    templates/              # Blank memory-file templates
    public-template-safety.md
    public-template-safety.zh-CN.md
  examples/                 # Synthetic examples only
  experiments/              # System-design observations and experiments
  summary/                  # Overview, current state, timeline, people, topics
  people/                   # Optional person routing cards
  fact/
    index.md
    events/                 # Event-based factual records
  feeling/
    index.md
    by_event/               # Event-linked emotional records
  session/                  # Post-conversation memory-update summaries
  inbox/                    # Unresolved fragments
  archive/                  # Legacy formats and migration backups only
```

Normal conversations start from current state and indexes, then open only the relevant underlying files. They do not load every event, person card, or experiment by default. See `AGENTS.md` for the complete read and write rules.

## Start Safely

Do not fill in a clone or fork that still points to this public repository. A filled archive can expose names, filenames, locations, relationships, emotional records, and old versions in Git history.

1. Download an archive or copy the tracked template files, not the public `.git/` directory, into a new private directory or private repository. If you use Git, verify repository visibility and run `git remote -v` before writing personal material.
2. Give the AI assistant read and write access only to that private directory, and ask it to read the root `AGENTS.md`.
3. Decide whether personal memory should be versioned. The included `.gitignore` ignores some newly created low-level records as defense in depth; remove or adapt those rules only inside a repository you have verified is private.
4. Review important writes and maintain an encrypted backup appropriate to the sensitivity of the archive.

`.gitignore` is not a privacy boundary. Files already tracked by Git, including the starter summaries and indexes, can still be committed after they are filled. A private repository is also not encryption. Review [the public-template safety notes](docs/public-template-safety.md) before first use or publication.

## Starter Prompt

Use this for an ordinary conversation. It deliberately refers to `AGENTS.md` instead of duplicating rules that may change.

```text
Read AGENTS.md at the root of the current repository. Follow its startup-context and read-on-demand/before-writing rules; do not read every underlying memory file by default.

Then talk with me naturally, prioritizing analysis and response over record keeping. When new facts, emotional changes, relationship clues, or event clues appear, quietly maintain the memory files in this repository according to AGENTS.md.
```

## Periodic Cleanup Prompt

Use this when indexes, summaries, event boundaries, or unresolved material have started to drift. It asks for an audit before any restructuring.

```text
Read AGENTS.md at the root of the current repository. This is a periodic cleanup, not an ordinary conversation. Follow its truthfulness, underlying-memory protection, privacy, and write-confirmation rules throughout.

Audit first; do not write yet. Start from summary and the two indexes, then read only the person cards, underlying events, inbox items, and recent session summaries needed to verify a finding.

Check:
1. Whether fact, feeling, and assistant-generated material follow their filing boundaries, without duplicating complete events.
2. Whether event, relationship-stage, and cross-event theme boundaries are coherent, duplicated, or too fragmented. Do not split a continuous stage merely because its file is long.
3. Whether both indexes, the summary timeline, and event timelines follow the sorting rules, and whether "recently updated" fields are stale.
4. Whether current, overview, person cards, and topic indexes remain routing layers rather than duplicate or unique source records.
5. Whether inbox and session files still follow their responsibilities.
6. Whether links, plain-text paths, filenames, date precision, and UTF-8 handling are consistent. Prefer stable paths after creation; propose renames only for clearly wrong, duplicate, or hard-to-find names, and update every reference after approval.

First list the files you recommend changing, the proposed treatment, and any split, merge, deletion, or archive decision that needs my confirmation. Wait for approval before writing. Afterwards, report only writes that actually succeeded and identify any failure or uncertainty.
```

## Summary Slimming Prompt

Use this when `summary/` has become too long or detailed. It does not authorize rewriting the underlying `fact/` and `feeling/` records.

```text
Read AGENTS.md at the root of the current repository. This task is summary slimming, not a full periodic cleanup and not an ordinary conversation.

Inspect only the summary layer by default. Keep current, timeline, people, and topics as concise routing files; remove settled state, duplicated event narratives, repeated descriptions, and assistant-generated material that does not belong there. Do not modify fact or feeling unless a broken reference must be corrected.

If something exists only in summary, propose a migration or preservation plan before removing it. List the files and treatment first, wait for my approval, then write and check links. Report only changes that actually succeeded.
```

## Experiments

The [experiments index](experiments/README.md) separates technical research from autobiographical memory. Public experiment material must use synthetic or thoroughly sanitized fixtures and state its method, measurement limits, model-label source, and evidence level. An observation with missing controls remains an observation, not a benchmark.

## Limitations

LifeArchive is a plain-text organizational method, not encryption, access control, automatic backup, a clinical record, or a substitute for professional care. AI assistants can omit, misclassify, or over-interpret information; important records require human review.

## License

The template files in this repository are available under the [MIT License](LICENSE). The license does not require publication of personal records added to a private copy.
