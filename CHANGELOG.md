# Changelog

## [1.1.0] - 2026-06-19

### Added

- Added a summary slimming prompt to keep `summary/` files lightweight navigation entries instead of duplicate underlying records.
- Added clearer fact creation boundaries to the cleanup prompt: ordinary small incidents, one-off chats, short-term emotional shifts, and additions to existing events should usually merge into existing records, the day's `session`, or `inbox`.
- Added "best for" and "not for" guidance to the reusable prompts.

### Changed

- Changed `support/` from a default long-term filing destination to an optional support layer. Ordinary advice, action reminders, comfort, and in-the-moment analysis now default to the day's `session` summary unless the user explicitly wants long-term support notes.
- Updated `AGENTS.md`, `README.md`, and `README.zh-CN.md` to keep assistant advice out of `fact/`, `feeling/`, and `summary/` by default.
- Updated public template wording to preserve the optional `support/` directory without forcing private archives to maintain a separate support index.
- Refined the Simplified Chinese README opening so it reads as public-facing template documentation rather than private project notes.

## [1.0.2] - 2026-06-07

### Added

- Added a future-node filing rule to `AGENTS.md`: temporary states that keep developing around exams, presentations, dates, meetings, travel, or administrative deadlines should be filed into a corresponding `fact/events/` entry instead of remaining only in `session/`.

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
- Added privacy guidance for keeping real memory repositories private.




