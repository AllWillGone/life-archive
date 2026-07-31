# Public Template Safety Notes

English | [简体中文](public-template-safety.zh-CN.md)

LifeArchive is safe to publish only when it contains rules, empty structure, synthetic or thoroughly sanitized examples, and reviewed research material. A working autobiographical archive should normally remain private.

## Audit State

The reusable maintenance-5 engine lives under `maintenance/.system/`, but every generated baseline, run, machine proposal, Markdown proposal, proposal archive, migration backup, lock, and recovery file is private working state. Initialize a baseline only in a private copy with `node maintenance/.system/audit.mjs init`; never copy state from another archive or publish it with the template.

The public allowlist may include reusable source, rules, isolated tests, and documentation under `maintenance/`. It must exclude `baseline.json`, `run/`, `proposal.json`, `proposal.md`, `proposals/`, `*.previous`, `.system/audit.lock`, and `.system/recovery/`. Inspect staged files even when `.gitignore` contains these patterns.

## Before First Use

- Create a new private directory or private repository. Do not fill a clone or fork that still points to the public template remote.
- If using Git, run `git remote -v` and verify repository visibility before writing personal material.
- Decide deliberately whether Git should version personal records. The template's `.gitignore` excludes some new low-level files, but files already tracked by Git can still be committed after editing.
- Restrict filesystem and AI-service access to what is needed. Check the relevant service's retention and training settings.
- Use encrypted storage or backups when the sensitivity of the archive requires it. A private repository is access control, not encryption.
- Never store passwords, API keys, access tokens, private keys, seed phrases, recovery codes, or full financial and government identifiers in the archive.

## Information That Can Identify Someone

Review both contents and metadata for:

- real names, aliases, usernames, email addresses, phone numbers, and account identifiers;
- locations, workplaces, schools, dates, relationship details, health information, intimate experiences, and rare event combinations;
- filenames under `people/`, `fact/`, `feeling/`, `session/`, and `inbox/`;
- summaries and indexes, which may reveal sensitive information even without detailed event files;
- raw chats, model outputs, screenshots, attachments, exported logs, and private absolute paths;
- commit author names and emails, commit messages, branches, tags, stashes, remotes, and deleted content retained in Git history;
- cloud-sync copies, backups, caches, and previously published forks.

Replacing a name is not sufficient when the remaining details can still re-identify a person.

## Before Publishing

1. Publish from a clean copy or new repository that has never contained private memory. Deleting files from the latest commit does not remove them from Git history.
2. Use an allowlist of intended public files. Do not copy private `fact/`, `feeling/`, `people/`, `summary/`, `session/`, `inbox/`, attachments, or private-repository history.
3. Replace examples and experiment fixtures with synthetic material. Sanitize prompts and model output line by line; do not rely on directory names as proof of safety.
4. Inspect filenames, `git status`, staged changes, tracked files, links, commit metadata, branches, tags, and repository history.
5. Scan for credentials and direct identifiers, then manually review indirect identifiers and unusual combinations that automated scans miss.
6. Have a second reviewer inspect the publication when the source material was sensitive.

`.gitignore` is defense in depth only. It does not hide tracked files, erase history, encrypt data, or prevent an explicit force-add.

If private material or a credential is published, treat it as exposed: revoke or rotate credentials immediately, restrict repository access, and follow the hosting provider's history-removal process. Copies and caches may persist even after cleanup.
