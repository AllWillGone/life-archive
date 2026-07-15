# Context-Loading Strategy: Exploratory Observation

[简体中文](2026-07-13-context-loading-observation.zh-CN.md)

Evidence level: **Exploratory observation**

Date: 2026-07-13

Public LifeArchive commit or released version: Not recorded

## Question

How did different test-environment model configurations behave when a prompt let them decide how much LifeArchive context to read at startup?

The observation focused on context coverage and approximate window occupancy. It did not evaluate memory-retrieval accuracy, response quality, or long-term maintenance quality.

## Recorded Conditions

| Field | Recorded value |
| --- | --- |
| Context window | `256k`; the original note did not preserve the unit or whether this was a configured value or a model limit |
| Archive | A private LifeArchive instance; no private fixture, prompt output, filenames, or memory content is published |
| Prompt comparison | A baseline strategy and a revised strategy that let the model choose how much context to read |
| Model labels | Local display labels copied from the test environment; no canonical model IDs or label source were preserved |
| Run count | Not recorded |
| Measurement | Approximate context-window occupancy; instrumentation and accounting boundaries were not recorded |

The labels below must not be interpreted as verified public product names. They may include local aliases or reasoning presets.

## Observations

| Environment label | Context-loading strategy | Observed file coverage | Approximate occupancy after loading |
| --- | --- | --- | --- |
| `5.5 xhigh` | Baseline; the model was not left to choose the reading scope freely | Exact file coverage was not recorded | About 50% |
| `5.5 xhigh` | Revised prompt; the model chose how much to read | Occupancy decreased; exact file coverage was not recorded | About 40%-45% |
| `5.6 terra` | The model chose how much to read | Read the overall file listing and only the most recent or relevant 1-2 fact files; little else | About 10%-15% |
| `sol` | The model chose how much to read | Read the overall file listing and only the most recent or relevant 1-2 fact files; little else | About 10%-15% |

## Interpretation

Under these recorded conditions, the same instruction to choose a reading scope produced materially different startup behavior across environment labels.

For `5.5 xhigh`, approximate occupancy was lower with the revised prompt. For `5.6 terra` and `sol`, occupancy was much lower, but the observed file coverage was also narrow. Lower occupancy therefore did not, by itself, demonstrate more effective context construction.

This supports LifeArchive's current use of explicit routing steps: start with current state and indexes, then read linked underlying files when the task needs them. It does not establish that one model or configuration is generally better than another.

## Limitations

- The exact baseline and revised prompts were not preserved.
- The archive snapshot, starting context, client version, tool configuration, and reset procedure were not recorded.
- The relevant public LifeArchive commit or released version was not recorded.
- The number of runs and run-to-run variance were not recorded.
- Window occupancy was approximate, and it is unknown whether system prompts, tool output, and pre-existing context were included.
- File coverage was described qualitatively rather than captured as a complete trace.
- No task-level correctness, recall, citation, or response-quality metric was measured.
- The model labels are not canonical identifiers.

Because of these limitations, the results are historical observations and cannot support causal claims, model rankings, or a reproducible benchmark.

## Suggested Replication

Use a versioned synthetic archive, preserve both prompts verbatim, record canonical environment identifiers where available, reset the context between repeated runs, and capture every file read. Measure both cost and usefulness: input tokens, files opened, relevant-event recall, unsupported claims, link accuracy, and response quality.
