# LifeArchive

English | [简体中文](README.zh-CN.md)

A place to preserve lived experience, revisit it with context, and carry it into the next conversation. Current rule release: **4.2.0**.

LifeArchive is a public template for maintaining a private archive of lived events, relationships, emotional changes, and unresolved context. It keeps observable events, the user's feelings and interpretations, navigation summaries, and verbatim user messages in separate layers so that an AI assistant can restore context without flattening a life into one profile.

Think of it as a personal archive you own and can keep adding to. You talk naturally with an assistant that can read and write files; the assistant follows the rules to organize relevant material. When a person, event, or concern comes up again, earlier records provide context for the conversation. You can also read, search, and edit the Markdown files yourself.

This repository contains reusable rules and audit tooling, empty structure, templates, synthetic examples, and sanitized research notes only. It must not contain a real person's memory archive or the Git history of one.

Jump to: [Why this project exists](#why-this-project-exists) · [What you can use it for](#what-you-can-use-it-for) · [Everyday use](#everyday-use) · [A worked example](#from-conversation-to-memory-an-example) · [Start safely](#start-safely) · [Starter prompt](#starter-prompt)

## Why This Project Exists

Meaningful personal context often starts as a sentence in a conversation: why a meeting mattered, how a decision came about, why a period was difficult, or what changed later. As conversations accumulate, those clues become scattered across dates and chats. Starting a new conversation can mean explaining the background all over again.

A continually compressed personal profile also struggles to preserve change. “I dislike public speaking” says little about what happened, which situations felt difficult, whether there were exceptions, or how the person felt later. LifeArchive aims to retain concrete experiences and their sequence so that later understanding can return to the records.

The goal is to let personal experiences accumulate over time, remain findable, and inform later conversations. The archive gives an assistant external context to read and gives its owner a history they can check for themselves.

## What You Can Use It For

| Situation | How you might use it | What the records contribute |
| --- | --- | --- |
| Continuing a conversation over time | Return to a person, event, or ongoing concern after a break | Restore current context and consult relevant experiences, reducing repeated background explanations |
| Revisiting an important experience | Review a period of learning, work, moving, travel, or a relationship | Bring developments from several conversations into one event, preserving its beginning, progression, and outcome |
| Understanding emotional change | Ask “Why did this matter to me then, and what changed later?” | Retain feelings and interpretations at different times rather than only the latest statement |
| Following a relationship over time | Find interactions with the same person and changes in your own attitude | Use person entries to navigate events while distinguishing observable interactions from your interpretations |
| Reviewing goals and decisions | Find why you started, what concerned you, and whether anything progressed | Preserve your expressed wishes, decisions, and actual actions for later reflection |
| Preparing a personal review or autobiographical writing | Find past material by time, person, or topic | Navigate from summaries to detailed records and check original wording when needed |

These uses depend on what was actually recorded. Missing experiences cannot be reconstructed from nothing, and wishes must not become completed actions. Records can support discussion of relationships and recurring feelings; they cannot establish another person's motives, a psychological diagnosis, or a future outcome on their own.

## Everyday Use

1. **Set up a private copy.** Follow [Start Safely](#start-safely), then let an assistant with file access read `AGENTS.md`. You can begin with one current experience; there is no need to write a complete autobiography or fill every directory first.
2. **Talk as you normally would.** Share recent events, older memories, conflicting thoughts, and feelings. The rules ask the assistant to respond to the conversation first and quietly maintain the necessary records afterwards. You do not need to turn each message into fields or fill out a form.
3. **Let related material build up.** Complete user messages from ordinary autobiographical conversations go into `session/`; new event details and emotional changes go into their respective files. Developments within the same event can be added over time. Summaries and indexes change only when necessary.
4. **Resume with existing context.** In a new conversation, use the [starter prompt](#starter-prompt) so the assistant reads current state, overview, and indexes before opening records relevant to the topic. When switching assistants, give the new tool access to the files and rules too.
5. **Review and check when useful.** Ask how something developed or what you originally said. Check the source before correcting an omission or misunderstanding. As the archive grows, the [periodic cleanup prompt](#periodic-cleanup-prompt) lets you review proposed changes before deciding whether to apply them.

Everyday recording depends on your assistant carrying out these rules. The template does not listen to chats in the background, collect conversations from other platforms on a schedule, or synchronize memory to every AI service. Audits under `maintenance/` also require an explicit request. Basic records are Markdown files; the optional audit tooling additionally requires Node.js.

## From Conversation to Memory: An Example

This example is entirely fictional. Suppose you say:

> I went to my first pottery class this week. The cup I was making collapsed, which felt a little discouraging. But I was absorbed in making it, and I want to go again next week.

After responding, the assistant can preserve the message according to each layer's purpose:

| Destination | What belongs there |
| --- | --- |
| `session/` | The complete user message, with its original wording and message boundary |
| `fact/events/` | Attending a first pottery class this week and the cup collapsing; no invented exact date |
| `feeling/by_event/` | Feeling a little discouraged, being absorbed in the process, and wanting to attend again |
| `summary/current.md` | If this becomes an ongoing plan, a brief statement of the current intention and a link to the event; no full retelling or claim that the next visit already happened |

Later, if you ask why you wanted to continue learning pottery, the assistant can follow the indexes to the experience and feelings, checking your original message if necessary. If your interest later declines, that change should be added with its time context while preserving the earlier feelings.

For actual file examples, see the synthetic [learning event](examples/fact/events/2026-01-example-learning-project.md), [associated feelings](examples/feeling/by_event/2026-01-example-learning-project.md), and [brief overview](examples/summary/overview.md). They illustrate how records connect; they are not personal experiences to copy into your own archive.

## Core Model

- `fact/` records what happened, preserving source and uncertainty.
- `feeling/` records how the user felt, understood, reacted, and changed over time.
- `summary/`, indexes, and `people/` are lightweight routing layers, not duplicate source records.
- `session/` appends the user's complete messages from ordinary autobiographical conversations, preserving wording, paragraphs, message boundaries, and order. It contains no assistant replies or update summaries. Existing session summaries remain unchanged.
- `inbox/` is a last-resort holding area for material that cannot yet be filed safely.
- `experiments/` contains system research and is outside autobiographical memory.

The underlying rule is simple: preserve the user's memory without rewriting it into something cleaner, safer-sounding, or more certain than the source supports.

## Why the Layers Matter

**Connect events; preserve messages by date.** One experience may come up across many days. An event file brings its developments together for review, while dated original messages provide a way to check what was said. Together they preserve both how something unfolded and how it was described at the time.

**Give events and feelings their own space.** The same experience can carry several, even conflicting feelings, and later interpretations can change. Separate records let what happened and how you understood it inform each other. Source qualifiers such as “I suspect” and “they said” help keep interpretations from becoming unsupported conclusions.

**Use summaries to find detail.** `current` holds what still affects the present; `overview` holds more stable background. People, topics, and the timeline offer different routes into the archive. New conversations begin with these entry points and consult relevant records as needed, avoiding a full archive load each time. Summaries can change, but must not become the only surviving version of an experience.

**Keep the records in your hands.** Readable Markdown files let you search, back up, and move your material between tools. A different model can rebuild context from the same files; how well it understands and follows the method still depends on that assistant's capabilities and adherence to the rules.

**Make the assistant's understanding checkable.** Links between messages, events, feelings, and summaries help expose omissions, filing errors, and over-compression. Comfort, advice, and analysis offered by the assistant stay in the conversation. Only wishes, decisions, actions, or outcomes the user subsequently expresses are recorded as their own new content.

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
Read the root AGENTS.md and maintenance/README.md in full. This is a periodic cleanup; follow their content-protection, audit, recovery, and authorization rules.

Audit first; do not modify memory documents. If this private copy has no `maintenance/baseline.json`, run `node maintenance/.system/audit.mjs init` once. Then run `node maintenance/.system/audit.mjs status` and `node maintenance/.system/audit.mjs validate`. For an unfinished run, read `maintenance/run/state.json` in full and resume from its actual status and `next_action`. At a decision or apply stage, read the current proposal; do not reuse historical approval. Follow the protocol for re-review with `refresh`. With no run, default to changed documents, or explicitly select another scope:

- selected: repeat `--path`, or use `--paths-file`, with `scope` first when dependency preview is useful;
- changed: run `start` without a mode;
- all: run `start --mode full` only when explicitly requested; a policy change does not itself authorize expanding scope.

Read each selected target and its listed required read-only dependencies in full. Do not treat dependencies as automatic write targets or a selected audit as a full-workspace completion.

Check:
1. Whether fact, feeling, and assistant-generated material follow their filing boundaries, without duplicating complete events.
2. Within this review scope, whether to split independent events or stages, or merge fragments of the same event. Do not split by length alone. Preserve every memory passage verbatim and explain its destination, fact/feeling correspondence, index and link changes, and rollback.
3. Whether both indexes, the summary timeline, and event timelines follow the sorting rules, and whether "recently updated" fields are stale.
4. Whether current, overview, person cards, and topic indexes remain routing layers rather than duplicate or unique source records.
5. Whether inbox and session files still follow their responsibilities.
6. Whether links, plain-text paths, filenames, date precision, and UTF-8 handling are consistent. Prefer stable paths after creation; propose renames only for clearly wrong, duplicate, or hard-to-find names, and update every reference after approval.

During the audit, write only under maintenance/. Save completed or partial units with `checkpoint`; generate the formal proposal with `publish --file <proposal-draft.json>` instead of writing it by hand. The default human view must show the operation index and expand only actual suggestions, with precise before/after text and limited context. Do not show every audited document in full.

Let me customize the proposal through `revise`, including adding, removing, replacing, or retargeting operations. Wait for an explicit proposal ID, version, and operation-ID decision before `decision` or `apply`. Only `apply` may modify memory documents, and it must stop the full approved batch before any write if a target, required dependency, or semantic policy has drifted. Afterwards, report only writes that actually succeeded and identify any failure or uncertainty. See `maintenance/README.md` for exact command and JSON formats.
```

## Summary Slimming Prompt

Use this when `summary/current.md` has become a lengthy recent-history log that increases startup context or gives outdated details too much weight. This prompt covers the current-state snapshot, not a full audit, event restructuring, timeline reconstruction, new person cards, or other summary files.

```text
Read AGENTS.md at the root of the current repository in full. This task is slimming summary/current.md, not a full periodic cleanup and not an ordinary conversation.

This review is read-only: do not create, modify, move, rename, delete, or format any file. Submit only a summary/current.md slimming proposal, specifying each operation, where its information is preserved, its risk, and its expected result, then stop. Later, execute only the numbered batches, files, and operations I explicitly approve; do not include unapproved changes.

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

After approval, implement only approved actions. Report current's before/after character, line, and entry counts, check all links in current and links affected by approved cross-file changes, and verify that unapproved fact, feeling, session, person cards, and other summaries are unchanged. State any failure or uncertainty explicitly.
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
