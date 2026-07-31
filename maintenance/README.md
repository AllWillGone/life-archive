# Maintenance-5 Periodic Audit

English | [简体中文](README.zh-CN.md)

`maintenance/` checks a private LifeArchive copy for structural problems, semantic-boundary issues, stale indexes, and unresolved filing work. It separates finding a problem from changing memory: the audit produces exact suggestions, while the user decides which operations, if any, may be applied.

Maintenance-5 uses a light-audit, strict-apply model:

- Audit one document, a selected set, all changed documents, or the full configured scope.
- Show only real suggestions by default, with exact before/after text and limited context.
- Let the user approve, reject, defer, add, remove, or replace individual operations.
- Keep hashes internal. They detect later content drift and bind a decision to the same operation; the user does not need to inspect them.
- Before any write, preflight every approved target and required dependency. One conflict stops the whole apply before any target changes.

## First Use

Copy the public template into a new private directory or private repository. Never fill a clone or fork that still points to the public remote, and never copy another archive's generated audit state.

Initialize the private copy once:

```powershell
node maintenance/.system/audit.mjs init
```

The command scans only the configured system files and memory roots, writes a local maintenance-5 `baseline.json`, and refuses to replace an existing baseline, run, or proposal. An optional local identifier is supported:

```powershell
node maintenance/.system/audit.mjs init --id BL5-my-private-copy
```

## Files and Privacy

- `.system/rules.json`: audit scope, allowed write scope, and semantic policy version.
- `.system/core.mjs`: scanning, dependency, preview, hashing, path, and atomic-write helpers.
- `.system/audit.mjs`: command-line workflow.
- `baseline.json`: per-document last-reviewed content state, review time, policy version, and required dependencies.
- `run/state.json`: current resumable audit progress; absent when no audit is active.
- `proposal.json`: authoritative proposal, decisions, and execution receipts.
- `proposal.md`: regenerated human view; editing it does not revise the authoritative proposal.
- `proposals/`: closed, invalidated, and superseded proposal versions.
- `.system/recovery/`: temporary recovery material created only while applying writes.

All generated state is private. Do not publish `baseline.json`, `run/`, `proposal.json`, `proposal.md`, `proposals/`, `.previous` migration backups, locks, or recovery material.

The audit engine itself is outside the autobiographical memory scope. Changes to `AGENTS.md` or semantic rules change the policy fingerprint; implementation-only changes do not force every memory document through another audit.

## Recommended Workflow

### 1. Check status

```powershell
node maintenance/.system/audit.mjs status
node maintenance/.system/audit.mjs validate
```

`validate` reports only changed or dependency-invalidated paths:

- `VALID`: no unaudited changes.
- `DRIFT`: documents were added, changed, deleted, or invalidated by a required dependency.
- `POLICY_STALE`: semantic audit policy changed.

### 2. Preview a scope

One document:

```powershell
node maintenance/.system/audit.mjs scope --path fact/events/example.md
```

Several documents:

```powershell
node maintenance/.system/audit.mjs scope --path fact/events/a.md --path feeling/by_event/a.md
```

A UTF-8 text file with one path per line, or a JSON string array:

```powershell
node maintenance/.system/audit.mjs scope --paths-file audit-paths.txt
```

`scope` lists targets and read-only dependencies, including why each dependency is needed and which target it supports. Fact/feeling pairs, required indexes, the people index, and direct one-hop links are included when relevant. Dependencies do not become write targets automatically.

### 3. Start an audit

Selected documents:

```powershell
node maintenance/.system/audit.mjs start --path fact/events/a.md --path feeling/by_event/a.md
```

All currently changed documents:

```powershell
node maintenance/.system/audit.mjs start
```

The full configured scope:

```powershell
node maintenance/.system/audit.mjs start --mode full
```

The default is changed-document audit, not full audit. Explicit paths may name unchanged documents for a deliberate re-review.

### 4. Save progress

After fully reviewing the current unit's target and required dependencies, write a small checkpoint input:

```json
{
  "run_id": "audit-20260731220000",
  "unit_id": "document:fact/events/a.md",
  "status": "completed",
  "summary": "Checked the event, its feeling pair, and index links.",
  "findings": []
}
```

```powershell
node maintenance/.system/audit.mjs checkpoint --file checkpoint.json
```

Use `status: "partial"` with `next_exact_read` and `stop_reason` when a unit is not finished. Maintenance-5 does not require manual EOF proofs, checkpoint hash chains, or transaction generations. Publication rechecks target content automatically.

### 5. Publish exact suggestions

A run with no recommended change can publish an empty operation list:

```json
{
  "proposal_id": "P007",
  "operations": []
}
```

That closes only the audited targets as reviewed-without-change. It does not absorb other concurrent workspace changes into the baseline.

For a suggested edit, prefer the narrowest operation that expresses the change:

```json
{
  "proposal_id": "P007",
  "operations": [
    {
      "operation_id": "O1",
      "type": "replace_exact_block",
      "path": "summary/current.md",
      "old_text": "Exact existing text",
      "new_text": "Suggested replacement text",
      "reason": "The summary no longer matches the underlying record.",
      "effect": "Corrects only this summary statement.",
      "preserves": "All other paragraphs remain unchanged.",
      "risk": "Low; confirm the replacement does not broaden the meaning.",
      "recommendation": "Apply this operation."
    }
  ]
}
```

```powershell
node maintenance/.system/audit.mjs publish --file proposal-draft.json
```

Supported operations are `replace_exact_block`, `replace_file`, `create_file`, `delete_file`, and `move_file`. The engine seals exact before content, expected result, target preconditions, previews, and required dependencies.

### 6. Review before and after

`proposal.md` starts with a complete operation index, then expands only `suggested: true` operations by default. Each suggestion shows the operation type, path, exact before/after text, and limited context. Documents without suggestions and read-only dependencies are not dumped in full.

```powershell
node maintenance/.system/audit.mjs show --operation O1
node maintenance/.system/audit.mjs show --path summary/current.md
node maintenance/.system/audit.mjs show --pending
node maintenance/.system/audit.mjs show --all
node maintenance/.system/audit.mjs show --operation O1 --expanded
```

`--operation` and `--path` may be repeated. If the Markdown view is missing or edited, `show` regenerates it from `proposal.json`.

### 7. Customize a proposal

The user can keep, remove, replace, or add operations instead of choosing between accepting or rejecting the whole proposal. A revision can also change the target path or operation type:

```json
{
  "proposal_id": "P007",
  "from_version": 1,
  "user_words": "Keep O2, replace O1 with my wording, and remove O3.",
  "changes": [
    {
      "action": "replace",
      "operation_id": "O1",
      "operation": {
        "type": "replace_exact_block",
        "path": "summary/current.md",
        "old_text": "Exact existing text",
        "new_text": "User-confirmed replacement",
        "reason": "Uses the user's confirmed wording.",
        "effect": "Changes only the selected block.",
        "preserves": "All other content remains unchanged.",
        "risk": "Low.",
        "recommendation": "Use this version."
      }
    },
    { "action": "remove", "operation_id": "O3" }
  ]
}
```

```powershell
node maintenance/.system/audit.mjs revise --file revision.json
```

Applied operations cannot be revised. Valid decisions on unchanged operations are retained; new or changed operations return to pending.

### 8. Decide and apply

Decisions identify exact operation IDs:

```json
{
  "proposal_id": "P007",
  "version": 2,
  "user_words": "Approve O1, reject O2, and defer O4.",
  "approved": ["O1"],
  "rejected": ["O2"],
  "deferred": ["O4"]
}
```

```powershell
node maintenance/.system/audit.mjs decision --file decision.json
node maintenance/.system/audit.mjs apply
```

Decisions can be submitted in batches. The engine recognizes only explicitly listed operation IDs; it does not infer authorization from vague natural language.

## Apply Boundary

`checkpoint`, `publish`, `show`, `revise`, and `decision` modify maintenance state only. Only `apply` may modify memory documents.

Before writing, `apply` verifies all approved operations together:

- The approved operation content is unchanged from the user's decision.
- Every target is still at its audited before state, or at the exact expected after state when recovering an interrupted receipt.
- Required pairs, indexes, and direct-link dependencies have not changed.
- Semantic policy is unchanged, every path is inside the configured write scope, and no path traverses a symbolic link.
- Multiple exact-block replacements on one file compose in a deterministic order and are written once.

Unrelated workspace changes do not block a local operation and are never silently added to its baseline. Any target, dependency, or policy conflict stops the complete approved batch before the first target write. Use `refresh` to re-observe the current scope:

```powershell
node maintenance/.system/audit.mjs refresh
```

Atomic replacement and temporary recovery material make `apply` resumable after interruption without repeating a completed write.

## Migrating a Maintenance-4 Copy

Run this only when the private copy still has a schema-4 baseline and no active maintenance-4 run:

```powershell
node maintenance/.system/audit.mjs migrate-v4
```

Migration reuses existing reviewed file state without rescanning memory text as a completed audit. It preserves open items and archives legacy proposal history, but does not turn legacy operations whose exact before state cannot be reconstructed into executable maintenance-5 operations. Original state is kept in local `.previous` backups, which remain private.
