# Experiments

English | [简体中文](README.zh-CN.md)

This directory contains LifeArchive system-design studies, prompt comparisons, and model-behavior evaluations. It is a project research layer, not part of autobiographical memory.

## Boundary

- Put experimental conditions, prompts, model or client labels, measurements, results, and technical conclusions here.
- Do not write experiments into `fact/`, `feeling/`, `summary/`, or `session/`, and do not add them to autobiographical indexes or timelines.
- Normal autobiographical conversations do not read this directory by default. Read it only for LifeArchive design, testing, or maintenance work.
- When an experiment changes system behavior or directory responsibilities, keep the evidence here and record the released change in `CHANGELOG.md`.

## Evidence Levels

| Level | Meaning | Minimum expectation |
| --- | --- | --- |
| Exploratory observation | A useful behavior noticed under incompletely recorded or uncontrolled conditions | Preserve what was observed and state every material limitation |
| Controlled experiment | A comparison using a fixed fixture, recorded prompts and environment, repeated runs, and defined metrics | Publish enough sanitized material for another person to repeat the procedure |
| Benchmark | A stable, versioned evaluation intended for comparison over time | Add validated scoring, representative fixtures, variance, and change control |

Do not label an exploratory observation as a controlled experiment or benchmark.

## Public-Safety Requirements

- Use synthetic fixtures whenever possible. Otherwise, remove direct and indirect identifiers thoroughly enough to prevent re-identification.
- Do not publish raw private chats, real memory excerpts, private absolute paths, account identifiers, unredacted screenshots, credentials, or unsanitized model output.
- Record the origin and license of third-party datasets, prompts, or other material. Do not include material that cannot be redistributed.
- Treat model names shown by a client as environment labels unless a canonical model identifier and source were recorded. Do not infer an official product name from a local alias.
- Review filenames, staged changes, links, and Git history before publication. `.gitignore` does not protect files already tracked by Git.

## Record Requirements

Each report should include, when available:

- objective and hypothesis;
- date and relevant public LifeArchive commit or released version; never record a private memory repository commit hash;
- client, tool, model identifier, reasoning configuration, and the source of each label;
- exact prompts or a versioned protocol;
- synthetic fixture and starting context;
- run count and reset procedure;
- metric definitions and measurement method;
- per-run results, aggregate results, and variance;
- limitations, failed runs, and missing metadata;
- conclusion and any resulting product decision.

Use [the experiment template](experiment-template.md) for new work. A small observation may remain one file named `YYYY-MM-DD-topic.md`; a study with prompts, fixtures, or raw results should use its own directory. Add `.zh-CN.md` beside an English report when maintaining a Chinese translation.

## Index

| Date | Study | Evidence level | Status |
| --- | --- | --- | --- |
| 2026-07-13 | [Context-loading strategy](2026-07-13-context-loading-observation.md) ([中文](2026-07-13-context-loading-observation.zh-CN.md)) | Exploratory observation | Historical note; controlled replication needed |
