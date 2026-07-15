# Changelog

This changelog tracks changes to LifeArchive's public rules, prompts, directory responsibilities, and blank-template behavior.

## [2.0.0] - 2026-07-15

### Added

- Added startup context routing based on current state, indexes, optional person cards, and on-demand reads instead of loading all underlying memory.
- Added `people/` as an optional routing-card layer and a reusable person-card template.
- Added `experiments/` as a research layer outside autobiographical memory, with bilingual publication standards, evidence levels, an experiment template, and the first sanitized exploratory observation.
- Added instruction/data separation so quoted chats, webpages, model output, and content stored in memory files cannot silently become maintenance instructions.
- Added bilingual public-template safety guidance covering tracked-file risk, Git history, commit metadata, re-identification, credentials, and experiment publication.

### Changed

- Aligned the public rules with the private system's design iterations through 2.5.0 while retaining safer public-template privacy defaults and self-contained file templates.
- Strengthened conversation priority for long memories, emotional disclosure, self-analysis, relationship uncertainty, and distress without imposing a rigid response length.
- Made `AGENTS.md` the single source of maintenance behavior and replaced duplicated, platform-specific README prompts with shorter references to it.
- Tightened the assistant-content boundary: assistant advice and analysis may be summarized briefly in an already warranted `session/` update or when the user asks to retain them, but only later user-expressed wishes, decisions, actions, or results can enter underlying memory.
- Clarified source handling for observations, user interpretations, user uncertainty, and third-party reports; agent inference cannot be stored as user memory.
- Reworked event granularity around "related does not mean belonging," while preserving links between independent events and cross-event themes.
- Made summaries, indexes, and person cards conditional routing layers that cannot hold the only copy of underlying information or define a complete personality.
- Reduced `inbox/` to a last-resort human-review buffer, added stable-path guidance, and aligned index and timeline ordering rules.
- Expanded both root READMEs into matching public guides with safer private-repository setup, explicit limitations, and experiment navigation.
- Kept the old `support/` placeholder only for compatibility with existing clones; it is absent from the default layout and normal context flow.

### Security

- Documented that `.gitignore` does not protect tracked summary and index files, erase history, or provide encryption.
- Prohibited storing authentication secrets and added an allowlist-based boundary between public template material and private memory.

## [1.1.0] - 2026-06-19

### Added

- Added a summary slimming prompt to keep `summary/` files lightweight navigation entries instead of duplicate underlying records.
- Added clearer fact creation boundaries to the cleanup prompt: ordinary small incidents, one-off chats, short-term emotional shifts, and additions to existing events should usually merge into existing records, the day's `session`, or `inbox`.
- Added "best for" and "not for" guidance to the reusable prompts.

### Changed

- Deprecated active `support/` filing in the default rule set. Ordinary advice, action reminders, comfort, and in-the-moment supportive analysis now stay briefly in the day's `session` summary by default.
- Clarified when assistant suggestions may become long-term memory: only when the user explicitly accepts, repeats, adopts, or expresses them as their own needs, wishes, decisions, or current understanding.
- Updated `AGENTS.md`, `README.md`, and `README.zh-CN.md` to keep assistant advice out of `fact/`, `feeling/`, and `summary/` by default, while still allowing adopted user-owned material to be filed in `feeling/` or `summary/current.md` when appropriate.
- Simplified the agent rules around temporary aggregation, automatic splitting, fact naming, and repeated advice-filing guidance while preserving public template structures for easier onboarding.
- Kept `support/` only as a placeholder for users who want to design their own extension, not as part of the default filing flow.
- Refined the Simplified Chinese README opening so it reads as public-facing template documentation rather than private project notes.

## [1.0.2] - 2026-06-07

### Added

- Added a future-node filing rule to `AGENTS.md`: temporary states that keep developing around exams, presentations, dates, meetings, travel, or administrative deadlines should be filed into a corresponding `fact/events/` entry instead of remaining only in `session/`.
- Clarified that when there is not enough information to know whether a temporary state will keep developing, it may first be kept in `summary/current.md` and `session/`, then promoted into a corresponding event if it recurs.

## [1.0.1] - 2026-06-06

### Added

- Added explicit `fact/events/` and `feeling/by_event/` file structure templates to `AGENTS.md`.
- Added reusable blank templates under `docs/templates/`.
- Expanded sanitized example files to demonstrate the recommended fact and feeling formats.

## [1.0.0] - 2026-06-05

### Added

- Initial public LifeArchive template.
- Added directory structure for facts, feelings, summaries, sessions, support notes, inbox fragments, archive material, and examples.
- Added agent maintenance rules in `AGENTS.md`.
- Added bottom-memory protection rules for preserving existing `fact/` and `feeling/` details during cleanup or restructuring.
- Added write-confirmation rules so agents only claim that files were updated after a successful write.
- Added fact original-wording guidance: `fact/events/` should be based on user statements that can be treated as factual, while feelings, interpretations, and attitude changes belong in `feeling/`.
- Added lightweight post-write self-check rules for sorting, links, recent-update fields, and necessary summary synchronization.
- Added privacy guidance for keeping real memory repositories private.

### Changed

- Separated facts, feelings, summaries, session updates, inbox fragments, and assistant support material into distinct responsibilities.
- Clarified the boundary between user-owned feelings and assistant-generated suggestions so supportive analysis does not get mixed into underlying emotional records by default.
