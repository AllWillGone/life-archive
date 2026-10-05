# LifeArchive

English | [简体中文](README.zh-CN.md)

An autobiographical memory system for long-term, AI-assisted reflection.

LifeArchive is a public template for maintaining a private archive of lived events, relationships, emotional changes, and unresolved context. It keeps observable events, the user's feelings and interpretations, navigation summaries, and verbatim user messages in separate layers so that an AI assistant can restore context without flattening a life into one profile.

This repository contains reusable rules and audit tooling, empty structure, templates, synthetic examples, and sanitized research notes only. It must not contain a real person's memory archive or the Git history of one.

## Core Model

- `fact/` records what happened, preserving source and uncertainty.
- `feeling/` records how the user felt, understood, reacted, and changed over time.
- `summary/`, indexes, and `people/` are lightweight routing layers, not duplicate source records.
- `session/` appends the user's complete messages from ordinary autobiographical conversations, preserving wording, paragraphs, message boundaries, and order. It contains no assistant replies or update summaries. Existing session summaries remain unchanged.
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
  maintenance/              # Generic audit protocol; generated state stays private
  summary/                  # Overview, current state, timeline, people, topics
  people/                   # Optional person routing cards
  fact/
    index.md
    events/                 # Event-based factual records
  feeling/
    index.md
    by_event/               # Event-linked emotional records
  session/                  # Verbatim user messages, organized by date
  inbox/                    # Unresolved fragments
  archive/                  # Legacy formats and migration backups only
```

Normal conversations start from current state and indexes, then open only the relevant underlying files. They do not load every event, person card, or experiment by default. See `AGENTS.md` for the complete read and write rules.

Normal conversations do not read `experiments/` or `maintenance/`. Enter the experiment workflow only when the user explicitly asks to conduct or continue a system experiment, and enter the audit workflow only when the user explicitly asks to start, resume, or execute it. Technical work on the project, rules, experiments, and audits is excluded from autobiographical memory; a conversation the user explicitly says not to record is also excluded, including its original messages.

## Start Safely

Do not fill in a clone or fork that still points to this public repository. A filled archive can expose names, filenames, locations, relationships, emotional records, and old versions in Git history.

1. Download an archive or copy the tracked template files, not the public `.git/` directory, into a new private directory or private repository. If you use Git, verify repository visibility and run `git remote -v` before writing personal material.
2. Give the AI assistant read and write access only to that private directory, and ask it to read the root `AGENTS.md`.
3. Decide whether personal memory should be versioned. The included `.gitignore` ignores some newly created low-level records as defense in depth; remove or adapt those rules only inside a repository you have verified is private.
4. Review important writes and maintain an encrypted backup appropriate to the sensitivity of the archive.

`.gitignore` is not a privacy boundary. Files already tracked by Git, including the starter summaries and indexes, can still be committed after they are filled. A private repository is also not encryption. Review [the public-template safety notes](docs/public-template-safety.md) before first use or publication.

## Periodic Audit

The public template includes the generic maintenance-5 audit engine for use after you copy it into a private repository. It follows a light-audit, strict-apply model: audit one file, a selected set, all changed files, or the full configured scope; show exact before/after suggestions without dumping every reviewed document; and leave each modification decision to the user.

In a new private copy, initialize the local baseline once:

```text
node maintenance/.system/audit.mjs init
```

Then use the periodic-audit prompt below. The command refuses to replace existing state. Keep `maintenance/baseline.json`, `maintenance/run/`, `maintenance/proposal.json`, `maintenance/proposal.md`, `maintenance/proposals/`, `maintenance/reviews/`, migration backups, locks, and recovery material private; do not commit them to this public repository.

See [`maintenance/README.md`](maintenance/README.md) for scope selection, exact review views, proposal customization, authorization, and recovery.

## Starter Prompt

Use this for an ordinary conversation. It deliberately refers to `AGENTS.md` instead of duplicating rules that may change.

```text
Read AGENTS.md at the root of the current repository. Follow its startup-context and read-on-demand/before-writing rules; do not read every underlying memory file by default.

Then talk with me naturally, prioritizing analysis and response over record keeping. Quietly append my complete messages to session according to AGENTS.md; when new facts, emotional changes, relationship clues, or event clues appear, maintain the corresponding events and necessary indexes. Do not record project maintenance or conversations I explicitly say not to record.
```

## Periodic Cleanup Prompt

Use this when indexes, summaries, event boundaries, or unresolved material have started to drift. It asks for an audit before any restructuring.

```text
Read AGENTS.md at the root of the current repository. This is a periodic cleanup, not an ordinary conversation. Follow its truthfulness, underlying-memory protection, privacy, and write-confirmation rules throughout.

Audit first; do not modify memory documents. If this private copy has no `maintenance/baseline.json`, run `node maintenance/.system/audit.mjs init` once. Then run `node maintenance/.system/audit.mjs status` and `node maintenance/.system/audit.mjs validate`. Resume an unfinished run from its recorded `next_action`; otherwise use one of these scopes:

- selected: repeat `--path`, or use `--paths-file`, with `scope` first when dependency preview is useful;
- changed: run `start` without a mode;
- all: run `start --mode full` only when explicitly requested or semantically necessary.

Read only each selected target and the required read-only dependencies reported for it. Do not treat dependencies as automatic write targets or a selected audit as a full-workspace completion.

Check:
1. Whether fact, feeling, and assistant-generated material follow their filing boundaries, without duplicating complete events.
2. Whether event, relationship-stage, and cross-event theme boundaries are coherent, duplicated, or too fragmented. Do not split a continuous stage merely because its file is long.
3. Whether both indexes, the summary timeline, and event timelines follow the sorting rules, and whether "recently updated" fields are stale.
4. Whether current, overview, person cards, and topic indexes remain routing layers rather than duplicate or unique source records.
5. Whether inbox and session files still follow their responsibilities.
6. Whether links, plain-text paths, filenames, date precision, and UTF-8 handling are consistent. Prefer stable paths after creation; propose renames only for clearly wrong, duplicate, or hard-to-find names, and update every reference after approval.

Save completed or partial units with `checkpoint`, then publish a reviewed proposal draft. The default human view must show the operation index and expand only actual suggestions, with precise before/after text and limited context. Do not show every audited document in full.

Let me customize the proposal through `revise`, including adding, removing, replacing, or retargeting operations. Wait for an explicit proposal ID, version, and operation-ID decision before `decision` or `apply`. Only `apply` may modify memory documents, and it must stop the full approved batch before any write if a target, required dependency, or semantic policy has drifted. Afterwards, report only writes that actually succeeded and identify any failure or uncertainty. See `maintenance/README.md` for exact command and JSON formats.
```

## Summary Slimming Prompt

Use this when `summary/current.md` has become a lengthy recent-history log that increases startup context or gives outdated details too much weight. This prompt covers the current-state snapshot, not a full audit, event restructuring, timeline reconstruction, new person cards, or other summary files.

```text
Read AGENTS.md at the root of the current repository in full. This task is slimming summary/current.md, not a full periodic cleanup and not an ordinary conversation.

This prompt authorizes a read-only audit only. Do not create, modify, move, rename, delete, or format any file, including update dates, indexes, links, AGENTS.md, README.md, or CHANGELOG.md. Even obvious, mechanical, or low-risk edits must first appear in the proposed plan.

Recommend a plan and explain it, but leave decisions to me. List every proposed compression, removal, migration, and link change with its destination, risk, and expected result.

The main goal is to restore current as a snapshot of current state rather than a log of recent events and analysis, reducing startup context without imposing a fixed length or reduction percentage that loses information.

Read-only review:
1. Read summary/current.md in full; count characters, lines, entries, and the space used by each part.
2. Read summary/overview.md, fact/index.md, feeling/index.md, summary/people.md, and summary/topics.md for routing.
3. For each candidate entry, read only the few directly relevant fact, feeling, person-card, or session files needed to verify where its information is preserved. Do not read every underlying record by default.
4. If preservation in underlying records is unconfirmed, keep the entry and mark it for verification; do not infer preservation from a summary or remove it.

Retain an entry in current only when at least one condition applies:
- a relationship, event, or goal is ongoing;
- a definite upcoming milestone is close;
- an unresolved issue still affects recent decisions or emotions;
- the topic recurs recently and is likely to remain a useful conversation entry point.

Having discussed something recently, feeling it strongly in the past, or finding it meaningful over the long term is not enough by itself.

For each active thread, normally retain its current state, unresolved core issue, an explicit user decision or next milestone, and links to the corresponding fact, feeling, or person entry. Do not retain daily developments, full event retellings, repeated background, or lengthy analysis. Keep still-valid needs, wishes, and decisions expressed by the user; do not treat assistant suggestions or analysis as the user's current state unless the user later explicitly adopts them.

Do not automatically move removed material into timeline, overview, summary/people.md, or topics. Propose migration only when it fits the destination's responsibility; otherwise verify the underlying record and index already provide access, and propose removal of only the derived copy in current.

For personal content found only in current, distinguish confirmed facts and explicitly expressed feelings or wishes from assistant analysis. Propose an underlying destination for the first two. Do not write assistant analysis into session; leave old session summaries unchanged. If classification is uncertain, retain it for verification rather than forcing migration.

Default write candidates are limited to summary/current.md. Other summaries, indexes, and underlying files are read-only evidence. If unique information must first be preserved elsewhere or a necessary link would break, propose those changes as a separate batch. Do not reconstruct the timeline, create person cards, restructure events, or create new self-reflection files as part of slimming.

Report:
1. Current character, line, and entry counts, and the main sources of growth.
2. A preview of the proposed structure.
3. Material to retain, merge or compress, remove, migrate, or verify.
4. Unique information and its proposed destination.
5. Each proposed location, action, reason, risk, and verifiable result.
6. Expected character and entry counts and the reduction percentage.
7. Decisions I need to make.

Stop after reporting the audit. This prompt itself authorizes no writes. Execute only numbered batches, files, and operations I explicitly approve later; do not include unapproved, ambiguous, or newly discovered changes.

After approval, implement only approved actions. Report current's before/after character, line, and entry counts, check every link, and verify that unapproved fact, feeling, session, person cards, and other summaries are unchanged. State any failure or uncertainty explicitly.
```

## Experiments

The [experiments index](experiments/README.md) separates technical research from autobiographical memory. Public experiment material must use synthetic or thoroughly sanitized fixtures and state its method, measurement limits, model-label source, and evidence level. An observation with missing controls remains an observation, not a benchmark.

### System Experiment Prompt

Use this only when explicitly conducting or continuing a LifeArchive design experiment, prompt comparison, or model-behavior evaluation.

```text
This task explicitly enters the LifeArchive system-experiment workflow. Read experiments/README.md in full, then use the experiment, filename, or keywords I specify to read the most relevant existing material. Do not read all experiments or autobiographical memory by default.

Write technical processes and conclusions only in experiments/. If the experiment actually changes system capabilities, directory responsibilities, or maintenance rules, record those completed version changes in CHANGELOG.md. Do not write technical experiments into fact/, feeling/, summary/, or session/.

Use synthetic or thoroughly sanitized material for any public experiment. Do not publish private messages, real memory excerpts, personal identifiers, or private absolute paths.
```

## Limitations

LifeArchive is a plain-text organizational method, not encryption, access control, automatic backup, a clinical record, or a substitute for professional care. AI assistants can omit, misclassify, or over-interpret information; important records require human review.

## License

The template files in this repository are available under the [MIT License](LICENSE). The license does not require publication of personal records added to a private copy.
