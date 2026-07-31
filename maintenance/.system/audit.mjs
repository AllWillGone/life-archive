#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import {
  BASELINE_SCHEMA,
  PROPOSAL_SCHEMA,
  RUN_SCHEMA,
  atomicCreate,
  atomicWrite,
  atomicWriteJson,
  buildTextPreview,
  canonicalHash,
  compareBaseline,
  compareSelectedReviews,
  computePolicyFingerprint,
  manifestRoot,
  normalizeRelative,
  operationAfterContent,
  operationHash,
  operationPaths,
  ordinalCompare,
  pathExists,
  proposalPayloadHash,
  readJson,
  renderProposal,
  resolveInside,
  scanSelectedScope,
  scanWorkspace,
  sealOperation,
  sealProposal,
  serializeJson,
  sha256,
  validateBaselineShape,
  validateProposalShape,
  validateRunShape,
  verifyProposalPreconditions,
  withAuditLock,
} from "./core.mjs";

const maintenanceDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(maintenanceDir, "..");
const baselinePath = path.join(maintenanceDir, "baseline.json");
const proposalDataPath = path.join(maintenanceDir, "proposal.json");
const proposalViewPath = path.join(maintenanceDir, "proposal.md");
const proposalArchiveDir = path.join(maintenanceDir, "proposals");
const runDir = path.join(maintenanceDir, "run");
const statePath = path.join(runDir, "state.json");

const COMMAND_OPTIONS = {
  init: { id: { type: "string" } },
  status: {},
  validate: {},
  scope: {
    path: { type: "string", multiple: true },
    "paths-file": { type: "string" },
  },
  start: {
    path: { type: "string", multiple: true },
    "paths-file": { type: "string" },
    mode: { type: "string" },
  },
  checkpoint: { file: { type: "string" } },
  publish: { file: { type: "string" } },
  show: {
    operation: { type: "string", multiple: true },
    path: { type: "string", multiple: true },
    pending: { type: "boolean" },
    all: { type: "boolean" },
    expanded: { type: "boolean" },
  },
  revise: { file: { type: "string" } },
  decision: { file: { type: "string" } },
  apply: {},
  refresh: { mode: { type: "string" } },
  "migrate-v4": {},
};

const READ_ONLY_COMMANDS = new Set(["status", "validate", "scope"]);

function parseCommand(argv) {
  const command = argv[0] ?? "status";
  const options = COMMAND_OPTIONS[command];
  if (!options) throw new Error("unknown command " + command);
  const parsed = parseArgs({
    args: argv.slice(1),
    options,
    allowPositionals: false,
    strict: true,
  });
  return { command, options: parsed.values };
}

function now() {
  return new Date().toISOString();
}

function compactTimestamp() {
  return now().replace(/[-:TZ.]/g, "").slice(0, 14);
}

function nextBaselineId(label) {
  return "BL5-" + compactTimestamp() + "-" + String(label).replace(/[^A-Za-z0-9._-]/g, "_");
}

function requireOption(value, message) {
  if (value === undefined || value === null || value === "") throw new Error(message);
  return value;
}

async function readRepoJson(relativeValue, label) {
  const relative = normalizeRelative(requireOption(relativeValue, label + " requires --file"), label);
  return readJson(resolveInside(repoRoot, relative, label).absolute);
}

async function readPathList(options) {
  const values = [...(options.path ?? [])];
  if (options["paths-file"]) {
    const relative = normalizeRelative(options["paths-file"], "paths file");
    const raw = await fs.readFile(resolveInside(repoRoot, relative, "paths file").absolute, "utf8");
    const trimmed = raw.trim();
    if (trimmed.startsWith("[")) {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed) || parsed.some((value) => typeof value !== "string")) {
        throw new Error("paths file JSON must be an array of strings");
      }
      values.push(...parsed);
    } else {
      values.push(...raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith("#")));
    }
  }
  return [...new Set(values.map((value) => normalizeRelative(value, "selected path")))].sort(ordinalCompare);
}

async function loadBaseline({ allowV4 = false } = {}) {
  if (!(await pathExists(baselinePath))) throw new Error("baseline.json does not exist; run init first");
  const baseline = await readJson(baselinePath);
  if (allowV4 && baseline.schema_version === 4) return baseline;
  const errors = validateBaselineShape(baseline);
  if (errors.length) throw new Error("invalid baseline:\n" + errors.join("\n"));
  return baseline;
}

async function loadState() {
  if (!(await pathExists(statePath))) return null;
  const state = await readJson(statePath);
  const errors = validateRunShape(state);
  if (errors.length) throw new Error("invalid run state:\n" + errors.join("\n"));
  return state;
}

async function loadProposal({ repairView = false } = {}) {
  if (!(await pathExists(proposalDataPath))) return null;
  const proposal = await readJson(proposalDataPath);
  const errors = validateProposalShape(proposal);
  if (errors.length) throw new Error("invalid proposal:\n" + errors.join("\n"));
  if (repairView) {
    const expected = renderProposal(proposal);
    const current = await fs.readFile(proposalViewPath, "utf8").catch(() => null);
    if (current !== expected) await atomicWrite(proposalViewPath, expected, { backup: false });
  }
  return proposal;
}

async function writeState(state) {
  const errors = validateRunShape(state);
  if (errors.length) throw new Error("refusing to write invalid run state:\n" + errors.join("\n"));
  await atomicWriteJson(statePath, state, { backup: false });
}

async function writeProposal(proposal) {
  const sealed = sealProposal(proposal);
  const errors = validateProposalShape(sealed);
  if (errors.length) throw new Error("refusing to write invalid proposal:\n" + errors.join("\n"));
  await atomicWriteJson(proposalDataPath, sealed, { backup: false });
  await atomicWrite(proposalViewPath, renderProposal(sealed), { backup: false });
  return sealed;
}

async function archiveProposal(proposal) {
  const runLabel = String(proposal.run_id ?? "unknown-run").replace(/[^A-Za-z0-9._-]/g, "_");
  const stem = `${proposal.proposal_id}-v${proposal.version}-${runLabel}`;
  await atomicWriteJson(path.join(proposalArchiveDir, `${stem}.json`), proposal, { backup: false });
  await atomicWrite(path.join(proposalArchiveDir, `${stem}.md`), renderProposal(proposal), { backup: false });
}

function recordsByPath(files) {
  return new Map((files ?? []).map((record) => [record.path, record]));
}

function baselineRecord(record, {
  reviewedAt,
  policyVersion,
  dependencies = {},
  outcome = "reviewed",
} = {}) {
  if (!record || record.sha256 === null) return null;
  return {
    path: record.path,
    role: record.role,
    sha256: record.sha256,
    bytes: record.bytes,
    links: record.links ?? [],
    reviewed_at: reviewedAt ?? now(),
    policy_version: policyVersion,
    dependencies,
    outcome,
  };
}

function initialBaselineId(requested) {
  if (requested === undefined) return nextBaselineId("initial");
  if (typeof requested !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(requested)) {
    throw new Error("init --id must contain only letters, numbers, dot, underscore or hyphen");
  }
  return requested;
}

async function commandInit(options) {
  if (await pathExists(baselinePath)) throw new Error("baseline.json already exists; refusing to replace it");
  if (await pathExists(statePath)) throw new Error("an active run exists without a baseline; refusing initialization");
  if (await pathExists(proposalDataPath) || await pathExists(proposalViewPath)) {
    throw new Error("an active proposal exists without a baseline; refusing initialization");
  }

  const scan = await scanWorkspace(repoRoot, maintenanceDir);
  const reviewedAt = now();
  const files = scan.files.map((record) => baselineRecord(record, {
    reviewedAt,
    policyVersion: scan.rules.policy_version,
    dependencies: {},
    outcome: "initial_import",
  }));
  const baseline = {
    schema_version: BASELINE_SCHEMA,
    protocol: "maintenance-5",
    baseline_id: initialBaselineId(options.id),
    created_at: reviewedAt,
    policy_version: scan.rules.policy_version,
    policy_sha256: scan.policy_sha256,
    executor_version: scan.rules.executor_version,
    root_hash: manifestRoot(files),
    files,
    open_items: [],
    last_result: { id: "initialization", status: "initialized" },
  };
  const errors = validateBaselineShape(baseline);
  if (errors.length) throw new Error("generated baseline is invalid:\n" + errors.join("\n"));
  await atomicCreate(baselinePath, serializeJson(baseline));
  console.log(`Initialized ${baseline.baseline_id}: ${files.length} files in the audit scope.`);
}

function selectedDependencyHashes(scan, target) {
  const records = recordsByPath(scan.files);
  const dependencies = {};
  for (const entry of scan.scope.dependencies ?? []) {
    if (!(entry.for_targets ?? []).includes(target)) continue;
    dependencies[entry.path] = records.get(entry.path)?.sha256 ?? null;
  }
  return dependencies;
}

function updateBaselineForScope(baseline, scan, {
  id,
  status,
  proposal = null,
  outcome = "reviewed",
} = {}) {
  const current = recordsByPath(scan.files);
  const targets = new Set(scan.scope.target_paths);
  const kept = (baseline.files ?? []).filter((record) => !targets.has(record.path));
  for (const target of scan.scope.target_paths) {
    const record = baselineRecord(current.get(target), {
      policyVersion: scan.rules.policy_version,
      dependencies: selectedDependencyHashes(scan, target),
      outcome,
    });
    if (record) kept.push(record);
  }
  kept.sort((left, right) => ordinalCompare(left.path, right.path));
  const deferred = proposal
    ? proposal.operations.filter((operation) => operation.decision === "deferred").map((operation) => ({
      proposal_id: proposal.proposal_id,
      version: proposal.version,
      operation_id: operation.operation_id,
      path: operation.path,
      status: "deferred",
      revisit_on: "next_relevant_audit",
    }))
    : [];
  const replacedProposalId = proposal?.proposal_id ?? null;
  return {
    ...baseline,
    schema_version: BASELINE_SCHEMA,
    protocol: "maintenance-5",
    baseline_id: nextBaselineId(id ?? "audit"),
    created_at: now(),
    policy_version: scan.rules.policy_version,
    policy_sha256: scan.policy_sha256,
    executor_version: scan.rules.executor_version,
    files: kept,
    root_hash: manifestRoot(kept),
    open_items: [
      ...(baseline.open_items ?? []).filter(
        (entry) => !replacedProposalId || entry.proposal_id !== replacedProposalId,
      ),
      ...deferred,
    ],
    last_result: {
      id: id ?? "audit",
      status: status ?? "reviewed",
      targets: scan.scope.target_paths,
      recorded_at: now(),
    },
  };
}

async function finishRun(baseline, state, scan, options = {}) {
  const updated = updateBaselineForScope(baseline, scan, options);
  await atomicWriteJson(baselinePath, updated, { backup: false });
  await fs.rm(runDir, { recursive: true, force: true });
  return updated;
}

async function rescanStateScope(state, baseline, contentOverrides = null) {
  return scanSelectedScope(
    repoRoot,
    maintenanceDir,
    baseline,
    state.audit_scope.target_paths,
    { contentOverrides },
  );
}

function scopeUnits(scan, previousUnits = []) {
  const previous = new Map(previousUnits.map((unit) => [unit.path, unit]));
  return scan.scope.target_paths.map((target) => {
    const dependencyPaths = (scan.scope.dependencies ?? [])
      .filter((entry) => (entry.for_targets ?? []).includes(target))
      .map((entry) => entry.path)
      .sort(ordinalCompare);
    const prior = previous.get(target);
    return {
      id: "document:" + target,
      path: target,
      status: prior?.status === "completed" ? "completed" : "planned",
      dependency_paths: dependencyPaths,
      summary: prior?.summary ?? null,
      findings: prior?.findings ?? [],
    };
  });
}

function nextAuditAction(units) {
  const next = units.find((unit) => unit.status !== "completed");
  return next ? { type: "audit_unit", unit_id: next.id } : { type: "synthesize" };
}

function createState(mode, baseline, scan) {
  const units = scopeUnits(scan);
  return {
    schema_version: RUN_SCHEMA,
    run_id: "audit-" + compactTimestamp(),
    status: "auditing",
    mode,
    baseline_id: baseline.baseline_id,
    policy_version: scan.rules.policy_version,
    policy_sha256: scan.policy_sha256,
    audit_scope: scan.scope,
    observed: Object.fromEntries(scan.files.map((record) => [record.path, {
      sha256: record.sha256,
      bytes: record.bytes,
      tombstone: record.tombstone ?? false,
    }])),
    units,
    proposal: null,
    next_action: nextAuditAction(units),
    started_at: now(),
    updated_at: now(),
  };
}

async function commandStatus() {
  const baseline = await loadBaseline({ allowV4: true });
  const state = await loadState().catch(() => null);
  const proposal = await loadProposal().catch(() => null);
  console.log(JSON.stringify({
    baseline: {
      schema_version: baseline.schema_version,
      id: baseline.baseline_id,
      files: baseline.files?.length ?? 0,
      open_items: baseline.open_items?.length ?? 0,
      last_result: baseline.last_result ?? null,
    },
    run: state && {
      id: state.run_id,
      status: state.status,
      mode: state.mode,
      targets: state.audit_scope?.target_paths ?? [],
      next_action: state.next_action,
    },
    proposal: proposal && {
      id: proposal.proposal_id,
      version: proposal.version,
      status: proposal.status,
      operations: proposal.operations.map((operation) => ({
        id: operation.operation_id,
        path: operation.path,
        decision: operation.decision,
      })),
      legacy_summary: proposal.legacy_summary ? {
        source_schema: proposal.legacy_summary.source_schema,
        operation_counts: proposal.legacy_summary.operation_counts,
      } : null,
    },
  }, null, 2));
}

function dependencyChanges(baseline, scan) {
  const current = recordsByPath(scan.files);
  const direct = new Set(compareBaseline(baseline, scan.files).map((entry) => entry.path));
  const changes = [];
  for (const record of baseline.files ?? []) {
    const stale = Object.entries(record.dependencies ?? {}).filter(
      ([relative, expected]) => (current.get(relative)?.sha256 ?? null) !== expected,
    );
    if (stale.length && !direct.has(record.path)) {
      changes.push({
        path: record.path,
        change: "dependency_changed",
        dependencies: stale.map(([relative]) => relative).sort(ordinalCompare),
      });
    }
  }
  return changes.sort((left, right) => ordinalCompare(left.path, right.path));
}

async function commandValidate() {
  const baseline = await loadBaseline();
  const scan = await scanWorkspace(repoRoot, maintenanceDir);
  const direct = compareBaseline(baseline, scan.files);
  const dependent = dependencyChanges(baseline, scan);
  const policyChanged = baseline.policy_version !== scan.rules.policy_version
    || baseline.policy_sha256 !== scan.policy_sha256;
  const changes = [...direct, ...dependent].sort((left, right) => ordinalCompare(left.path, right.path));
  const status = policyChanged ? "POLICY_STALE" : changes.length ? "DRIFT" : "VALID";
  console.log("Audit validation: " + status);
  console.log("Baseline: " + baseline.baseline_id);
  console.log("Files: " + scan.files.length + "; changed: " + changes.length);
  if (policyChanged) {
    console.log("Baseline policy: " + baseline.policy_version);
    console.log("Current policy: " + scan.rules.policy_version);
  }
  for (const change of changes) {
    const suffix = change.dependencies?.length ? " (" + change.dependencies.join(", ") + ")" : "";
    console.log(change.change + ": " + change.path + suffix);
  }
  if (policyChanged || changes.length) process.exitCode = 2;
}

async function commandScope(options) {
  const baseline = await loadBaseline();
  const targets = await readPathList(options);
  if (!targets.length) throw new Error("scope requires --path or --paths-file");
  const scan = await scanSelectedScope(repoRoot, maintenanceDir, baseline, targets);
  console.log(JSON.stringify({
    targets: scan.scope.target_paths,
    dependencies: scan.scope.dependencies,
    policy_version: scan.rules.policy_version,
  }, null, 2));
}

async function commandStart(options) {
  const baseline = await loadBaseline();
  if (await loadState()) throw new Error("an active audit run already exists");
  const selected = await readPathList(options);
  if (selected.length && options.mode) throw new Error("--mode cannot be combined with selected paths");
  if (options.mode && options.mode !== "full") throw new Error("--mode only accepts full");

  let mode;
  let targets;
  if (selected.length) {
    mode = "selected";
    targets = selected;
  } else {
    const fullScan = await scanWorkspace(repoRoot, maintenanceDir);
    const direct = compareBaseline(baseline, fullScan.files);
    const dependent = dependencyChanges(baseline, fullScan);
    targets = options.mode === "full"
      ? fullScan.files.map((record) => record.path)
      : [...new Set([...direct, ...dependent].map((entry) => entry.path))].sort(ordinalCompare);
    mode = options.mode === "full" ? "full" : "incremental";
    if (!targets.length) {
      console.log("No unreviewed changes; no run created.");
      return;
    }
  }

  const scan = await scanSelectedScope(repoRoot, maintenanceDir, baseline, targets);
  if (mode !== "selected") {
    scan.scope = { ...scan.scope, kind: "global", global_completion: true };
  }
  const state = createState(mode, baseline, scan);
  await writeState(state);
  console.log(
    "Started " + state.run_id + ": " + state.audit_scope.target_paths.length
    + " targets; " + state.audit_scope.dependency_paths.length + " read-only dependencies.",
  );
}

async function commandCheckpoint(options) {
  const state = await loadState();
  if (!state) throw new Error("no active run");
  if (state.status !== "auditing") throw new Error("run is not auditing");
  const update = await readRepoJson(options.file, "checkpoint");
  if (update.run_id !== state.run_id) throw new Error("checkpoint run_id mismatch");
  const unit = state.units.find((entry) => entry.id === update.unit_id);
  if (!unit) throw new Error("unknown checkpoint unit " + (update.unit_id ?? "(missing)"));
  const status = update.status ?? update.unit_status;
  if (!["partial", "completed"].includes(status)) throw new Error("checkpoint status must be partial or completed");
  if (status === "completed" && (typeof update.summary !== "string" || !Array.isArray(update.findings))) {
    throw new Error("completed checkpoint needs summary and findings");
  }
  if (status === "partial" && (!update.next_exact_read || !update.stop_reason)) {
    throw new Error("partial checkpoint needs next_exact_read and stop_reason");
  }
  const units = state.units.map((entry) => entry.id === unit.id ? {
    ...entry,
    status,
    summary: update.summary ?? entry.summary,
    findings: update.findings ?? entry.findings ?? [],
    next_exact_read: update.next_exact_read ?? null,
    stop_reason: update.stop_reason ?? null,
  } : entry);
  const next = { ...state, units, next_action: nextAuditAction(units), updated_at: now() };
  await writeState(next);
  console.log("Saved progress for " + unit.id + "; next action: " + next.next_action.type + ".");
}

function operationContent(operation, current) {
  if (operation.type === "replace_exact_block") {
    const count = current.split(operation.old_text).length - 1;
    if (count !== 1) throw new Error(operation.operation_id + " old_text must occur exactly once");
    return current.replace(operation.old_text, operation.new_text);
  }
  if (operation.type === "replace_file" || operation.type === "create_file") return operation.new_content;
  if (operation.type === "delete_file") return null;
  if (operation.type === "move_file") return current;
  throw new Error("unsupported operation type " + operation.type);
}

async function normalizeOperation(input, { currentId = null } = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("operation must be an object");
  const operationId = input.operation_id ?? currentId;
  if (!operationId) throw new Error("operation_id is required");
  const type = input.type;
  const relative = normalizeRelative(input.path, operationId + ".path");
  const source = resolveInside(repoRoot, relative).absolute;
  const sourceExists = await pathExists(source);
  const beforeContent = sourceExists ? await fs.readFile(source, "utf8") : null;
  if (type === "create_file" && sourceExists) throw new Error(operationId + " create target already exists");
  if (type !== "create_file" && !sourceExists) throw new Error(operationId + " source does not exist");
  if (type === "move_file") {
    const destination = resolveInside(repoRoot, normalizeRelative(input.destination_path, operationId + ".destination_path")).absolute;
    if (await pathExists(destination)) throw new Error(operationId + " move destination already exists");
  }
  const base = {
    ...input,
    operation_id: operationId,
    path: relative,
    before_content: type === "create_file" ? undefined : beforeContent,
    precondition_sha256: type === "create_file" ? null : sha256(Buffer.from(beforeContent, "utf8")),
    decision: "pending",
    suggested: input.suggested ?? true,
  };
  if (type === "move_file") base.destination_path = normalizeRelative(input.destination_path, operationId + ".destination_path");
  const afterContent = operationContent(base, beforeContent ?? "");
  base.expected_after_sha256 = afterContent === null ? null : sha256(Buffer.from(afterContent, "utf8"));
  base.preview = type === "move_file"
    ? { kind: "move_file", from: relative, to: base.destination_path }
    : buildTextPreview(beforeContent ?? "", afterContent ?? "");
  return sealOperation(base);
}

function operationOverrides(operations) {
  const overrides = new Map();
  const ordered = [...operations].sort(
    (left, right) => ordinalCompare(left.operation_id, right.operation_id),
  );
  for (const operation of ordered) {
    if (operation.type === "move_file") {
      overrides.set(operation.path, null);
      overrides.set(operation.destination_path, operation.before_content);
    } else if (operation.type === "replace_exact_block" && overrides.has(operation.path)) {
      overrides.set(operation.path, operationContent(operation, overrides.get(operation.path)));
    } else {
      overrides.set(operation.path, operationAfterContent(operation));
    }
  }
  return overrides;
}

function operationDependencies(scan, operation) {
  const records = recordsByPath(scan.files);
  const touched = new Set(operationPaths(operation));
  return (scan.scope.dependencies ?? [])
    .filter((entry) => (entry.for_targets ?? []).some((target) => touched.has(target)))
    .map((entry) => ({
      path: entry.path,
      sha256: records.get(entry.path)?.sha256 ?? null,
      reasons: entry.reasons,
    }))
    .sort((left, right) => ordinalCompare(left.path, right.path));
}

async function commandPublish(options) {
  const state = await loadState();
  if (!state) throw new Error("no active run");
  if (state.status !== "auditing") throw new Error("run is not auditing");
  if (state.units.some((unit) => unit.status !== "completed")) {
    throw new Error("all audit units must be completed before publish");
  }
  const draft = await readRepoJson(options.file, "publish");
  if (!Array.isArray(draft.operations)) throw new Error("proposal draft needs operations");
  const baseline = await loadBaseline();
  const currentScan = await rescanStateScope(state, baseline);
  const observed = recordsByPath(currentScan.files);
  for (const relative of currentScan.scope.required_paths) {
    const expected = state.observed?.[relative]?.sha256 ?? null;
    if ((observed.get(relative)?.sha256 ?? null) !== expected) {
      throw new Error("audit input changed after review: " + relative + "; run refresh");
    }
  }

  if (!draft.operations.length) {
    await finishRun(baseline, state, currentScan, {
      id: draft.proposal_id ?? state.run_id,
      status: "accepted_as_is",
      outcome: "accepted_as_is",
    });
    console.log("No changes proposed; selected file reviews were updated.");
    return;
  }

  const operations = [];
  for (const input of draft.operations) operations.push(await normalizeOperation(input));
  const ids = operations.map((operation) => operation.operation_id);
  if (new Set(ids).size !== ids.length) throw new Error("proposal repeats an operation ID");
  const targetPaths = [...new Set([
    ...state.audit_scope.target_paths,
    ...operations.flatMap(operationPaths),
  ])].sort(ordinalCompare);
  const scoped = await scanSelectedScope(
    repoRoot,
    maintenanceDir,
    baseline,
    targetPaths,
    { contentOverrides: operationOverrides(operations) },
  );
  const completedOperations = operations.map((operation) => sealOperation({
    ...operation,
    dependencies: operationDependencies(scoped, operation),
  }));
  const previous = await loadProposal({ repairView: true });
  if (previous) {
    if (previous.run_id === state.run_id && !["closed", "stale"].includes(previous.status)) {
      const approved = previous.operations
        .filter((operation) => operation.decision === "approved")
        .map((operation) => operation.operation_id);
      const recoveredStatus = approved.length ? "applying" : "awaiting_decision";
      await writeState({
        ...state,
        status: recoveredStatus,
        audit_scope: previous.audit_scope,
        proposal: {
          id: previous.proposal_id,
          version: previous.version,
          payload_sha256: previous.payload_sha256,
        },
        next_action: approved.length
          ? { type: "apply_approved", operation_ids: approved }
          : {
            type: "await_user_decision",
            proposal_id: previous.proposal_id,
            version: previous.version,
          },
        updated_at: now(),
      });
      console.log("Recovered already-published " + previous.proposal_id + " v" + previous.version + ".");
      return;
    }
    if (!["closed", "stale"].includes(previous.status)) {
      throw new Error("another proposal is still active");
    }
    await archiveProposal(previous);
  }
  const proposal = await writeProposal({
    schema_version: PROPOSAL_SCHEMA,
    storage_format: "proposal-json-v5",
    proposal_id: requireOption(draft.proposal_id, "proposal_id is required"),
    version: draft.version ?? 1,
    status: "awaiting_decision",
    run_id: state.run_id,
    based_on_baseline_id: baseline.baseline_id,
    policy_version: scoped.rules.policy_version,
    policy_sha256: scoped.policy_sha256,
    based_on_scope_sha256: scoped.scope_sha256,
    audit_scope: scoped.scope,
    excluded_scope: draft.excluded_scope ?? [],
    operations: completedOperations,
    decisions: [],
    executions: [],
    revisions: [],
    created_at: now(),
    completed_at: null,
  });
  if (process.env.MAINTENANCE_TEST_FAILPOINT === "after_proposal_write") {
    throw new Error("test failpoint after_proposal_write");
  }
  await writeState({
    ...state,
    status: "awaiting_decision",
    audit_scope: scoped.scope,
    proposal: {
      id: proposal.proposal_id,
      version: proposal.version,
      payload_sha256: proposal.payload_sha256,
    },
    next_action: {
      type: "await_user_decision",
      proposal_id: proposal.proposal_id,
      version: proposal.version,
    },
    updated_at: now(),
  });
  const addedDependencies = scoped.scope.dependency_paths.filter(
    (relative) => !state.audit_scope.dependency_paths.includes(relative),
  );
  console.log(
    "Published " + proposal.proposal_id + " v" + proposal.version
    + " with " + proposal.operations.length + " operations."
    + (addedDependencies.length ? " Added dependencies: " + addedDependencies.join(", ") + "." : ""),
  );
}

async function commandShow(options) {
  const proposal = await loadProposal({ repairView: true });
  if (!proposal) throw new Error("no proposal");
  const markdown = renderProposal(proposal, {
    operation: options.operation ?? null,
    path: options.path ?? null,
    pending: options.pending ?? false,
    all: options.all ?? false,
    expanded: options.expanded ?? false,
  });
  console.log(markdown);
}

function revisionChanges(draft) {
  if (Array.isArray(draft.changes)) return draft.changes;
  if (draft.replacement_operation) {
    return [{
      action: "replace",
      operation_id: draft.operation_id,
      operation: draft.replacement_operation,
    }];
  }
  throw new Error("revision draft needs changes");
}

async function commandRevise(options) {
  const state = await loadState();
  if (!state) throw new Error("no active run");
  if (!["awaiting_decision", "applying"].includes(state.status)) throw new Error("run has no revisable proposal");
  const current = await loadProposal({ repairView: true });
  if (!current || current.status === "closed") throw new Error("no active proposal to revise");
  const draft = await readRepoJson(options.file, "revise");
  if (draft.proposal_id !== current.proposal_id || draft.from_version !== current.version) {
    throw new Error("revision does not bind the active proposal version");
  }
  if (draft.from_payload_sha256 && draft.from_payload_sha256 !== current.payload_sha256) {
    throw new Error("revision payload binding mismatch");
  }
  if (typeof draft.user_words !== "string" || !draft.user_words.trim()) {
    throw new Error("revision needs user_words");
  }

  let operations = [...current.operations];
  const changedIds = new Set();
  const records = [];
  for (const change of revisionChanges(draft)) {
    const action = change.action ?? "replace";
    if (action === "add") {
      const added = await normalizeOperation(change.operation);
      if (operations.some((operation) => operation.operation_id === added.operation_id)) {
        throw new Error("revision repeats operation " + added.operation_id);
      }
      operations.push(added);
      changedIds.add(added.operation_id);
      records.push({ action, operation_id: added.operation_id, after_sha256: added.operation_sha256 });
      continue;
    }

    const operationId = change.operation_id;
    const index = operations.findIndex((operation) => operation.operation_id === operationId);
    if (index < 0) throw new Error("unknown revision operation " + operationId);
    const original = operations[index];
    if (original.decision === "applied") throw new Error("applied operations cannot be revised");
    if (action === "remove") {
      operations.splice(index, 1);
      changedIds.add(operationId);
      records.push({ action, operation_id: operationId, before_sha256: original.operation_sha256 });
      continue;
    }
    if (action !== "replace") throw new Error("unsupported revision action " + action);
    const replacement = await normalizeOperation(
      { ...change.operation, operation_id: operationId },
      { currentId: operationId },
    );
    operations[index] = replacement;
    changedIds.add(operationId);
    records.push({
      action,
      operation_id: operationId,
      before_sha256: original.operation_sha256,
      after_sha256: replacement.operation_sha256,
    });
  }
  if (!changedIds.size) throw new Error("revision makes no changes");

  operations.sort((left, right) => ordinalCompare(left.operation_id, right.operation_id));
  const baseline = await loadBaseline();
  const targetPaths = [...new Set([
    ...current.audit_scope.target_paths,
    ...operations.flatMap(operationPaths),
  ])].sort(ordinalCompare);
  const scoped = await scanSelectedScope(
    repoRoot,
    maintenanceDir,
    baseline,
    targetPaths,
    { contentOverrides: operationOverrides(operations) },
  );
  operations = operations.map((operation) => changedIds.has(operation.operation_id)
    ? sealOperation({ ...operation, decision: "pending", dependencies: operationDependencies(scoped, operation) })
    : operation);
  await archiveProposal(current);
  const revised = await writeProposal({
    ...current,
    version: current.version + 1,
    status: "awaiting_decision",
    policy_version: scoped.rules.policy_version,
    policy_sha256: scoped.policy_sha256,
    based_on_scope_sha256: scoped.scope_sha256,
    audit_scope: scoped.scope,
    operations,
    revisions: [
      ...(current.revisions ?? []),
      {
        from_version: current.version,
        to_version: current.version + 1,
        user_words: draft.user_words,
        changes: records,
        recorded_at: now(),
      },
    ],
    completed_at: null,
  });
  await writeState({
    ...state,
    status: "awaiting_decision",
    audit_scope: scoped.scope,
    proposal: {
      id: revised.proposal_id,
      version: revised.version,
      payload_sha256: revised.payload_sha256,
    },
    next_action: {
      type: "await_user_decision",
      proposal_id: revised.proposal_id,
      version: revised.version,
    },
    updated_at: now(),
  });
  console.log(
    "Revised " + revised.proposal_id + " as v" + revised.version
    + "; changed operations are pending: " + [...changedIds].sort(ordinalCompare).join(", ") + ".",
  );
}

function selectionSet(value) {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value.map(String);
  return String(value).split(",").map((entry) => entry.trim()).filter(Boolean);
}

function proposalUnresolved(proposal) {
  return proposal.operations.some((operation) => ["pending", "approved"].includes(operation.decision ?? "pending"));
}

function baselineWithTombstones(baseline, targets) {
  const known = new Set((baseline.files ?? []).map((record) => record.path));
  const placeholders = targets.filter((relative) => !known.has(relative)).map((relative) => ({
    path: relative,
    role: "memory",
    sha256: null,
    bytes: null,
    links: [],
  }));
  return placeholders.length ? { ...baseline, files: [...baseline.files, ...placeholders] } : baseline;
}

async function scanClosingScope(baseline, targetPaths) {
  return scanSelectedScope(
    repoRoot,
    maintenanceDir,
    baselineWithTombstones(baseline, targetPaths),
    targetPaths,
  );
}

async function closeProposalAndRun(proposal, state, baseline, status) {
  const closed = await writeProposal({
    ...proposal,
    status: "closed",
    completed_at: proposal.completed_at ?? now(),
  });
  await archiveProposal(closed);
  const scan = await scanClosingScope(baseline, closed.audit_scope.target_paths);
  await finishRun(baseline, state, scan, {
    id: closed.proposal_id + "-v" + closed.version,
    status,
    proposal: closed,
    outcome: closed.operations.some((operation) => operation.decision === "applied")
      ? "proposal_applied"
      : "reviewed",
  });
  return closed;
}

async function commandDecision(options) {
  const state = await loadState();
  if (!state) throw new Error("no active run");
  const proposal = await loadProposal({ repairView: true });
  if (!proposal || proposal.status === "closed") throw new Error("no active proposal");
  const input = await readRepoJson(options.file, "decision");
  if (input.proposal_id !== proposal.proposal_id || input.version !== proposal.version) {
    throw new Error("decision does not bind the active proposal version");
  }
  if (input.payload_sha256 && input.payload_sha256 !== proposal.payload_sha256) {
    throw new Error("decision payload binding mismatch");
  }
  if (typeof input.user_words !== "string" || !input.user_words.trim()) {
    throw new Error("decision needs user_words");
  }
  const approved = selectionSet(input.approved);
  const rejected = selectionSet(input.rejected);
  const deferred = selectionSet(input.deferred);
  const selected = [...approved, ...rejected, ...deferred];
  if (new Set(selected).size !== selected.length) throw new Error("decision repeats an operation");
  const byId = new Map(proposal.operations.map((operation) => [operation.operation_id, operation]));
  for (const id of selected) {
    const operation = byId.get(id);
    if (!operation) throw new Error("unknown decision operation " + id);
    if (operation.decision === "applied") throw new Error("applied operation cannot be decided again: " + id);
  }
  if (!selected.length) throw new Error("decision selects no operations");

  const operationHashes = {};
  for (const id of selected) operationHashes[id] = byId.get(id).operation_sha256;
  const operations = proposal.operations.map((operation) => {
    if (approved.includes(operation.operation_id)) return { ...operation, decision: "approved" };
    if (rejected.includes(operation.operation_id)) return { ...operation, decision: "rejected" };
    if (deferred.includes(operation.operation_id)) return { ...operation, decision: "deferred" };
    return operation;
  });
  const record = {
    proposal_id: proposal.proposal_id,
    version: proposal.version,
    payload_sha256: proposal.payload_sha256,
    approved,
    rejected,
    deferred,
    operation_hashes: operationHashes,
    user_words: input.user_words,
    recorded_at: now(),
  };
  let next = await writeProposal({
    ...proposal,
    operations,
    decisions: [...(proposal.decisions ?? []), record],
    status: approved.length ? "applying" : "awaiting_decision",
  });
  const baseline = await loadBaseline();
  if (!proposalUnresolved(next)) {
    next = await closeProposalAndRun(next, state, baseline, "decided_without_pending");
    console.log("Recorded decision and closed " + next.proposal_id + " v" + next.version + ".");
    return;
  }
  await writeState({
    ...state,
    status: approved.length ? "applying" : "awaiting_decision",
    proposal: {
      id: next.proposal_id,
      version: next.version,
      payload_sha256: next.payload_sha256,
    },
    next_action: approved.length
      ? { type: "apply_approved", operation_ids: approved }
      : { type: "await_user_decision", proposal_id: next.proposal_id, version: next.version },
    updated_at: now(),
  });
  console.log(
    "Recorded decision: approved=" + approved.length
    + ", rejected=" + rejected.length + ", deferred=" + deferred.length + ".",
  );
}

function approvalFor(proposal, operation) {
  return [...(proposal.decisions ?? [])].reverse().find(
    (decision) => (decision.approved ?? []).includes(operation.operation_id)
      && decision.operation_hashes?.[operation.operation_id] === operation.operation_sha256,
  );
}

async function fileShaOrNull(relative) {
  const absolute = resolveInside(repoRoot, relative).absolute;
  return await pathExists(absolute) ? sha256(await fs.readFile(absolute)) : null;
}

async function assertDependenciesCurrent(operations) {
  const failures = [];
  const cache = new Map();
  for (const operation of operations) {
    for (const dependency of operation.dependencies ?? []) {
      if (!cache.has(dependency.path)) cache.set(dependency.path, await fileShaOrNull(dependency.path));
      if (cache.get(dependency.path) !== dependency.sha256) {
        failures.push(operation.operation_id + ": " + dependency.path);
      }
    }
  }
  if (failures.length) throw new Error("approved operation dependencies changed: " + failures.join(", "));
}

function applyGroups(operations) {
  const groups = new Map();
  for (const operation of operations) {
    const key = operation.path;
    const group = groups.get(key) ?? [];
    group.push(operation);
    groups.set(key, group);
  }
  for (const [relative, group] of groups) {
    if (group.length > 1 && group.some((operation) => operation.type !== "replace_exact_block")) {
      throw new Error("overlapping approved operations require exact-block replacements: " + relative);
    }
    if (group.length > 1 && new Set(group.map((operation) => operation.precondition_sha256)).size !== 1) {
      throw new Error("overlapping approved operations have different before states: " + relative);
    }
    group.sort((left, right) => ordinalCompare(left.operation_id, right.operation_id));
  }
  const touched = new Map();
  for (const [relative, group] of groups) {
    for (const operation of group) {
      for (const target of operationPaths(operation)) {
        if (target !== relative && touched.has(target)) throw new Error("approved operations overlap path " + target);
        touched.set(target, relative);
      }
    }
  }
  return [...groups.entries()].sort(([left], [right]) => ordinalCompare(left, right));
}

function groupAfterContent(group) {
  let content = group[0].before_content ?? "";
  for (const operation of group) content = operationContent(operation, content);
  return content;
}

async function groupState(relative, group) {
  if (group.length > 1) {
    const currentSha = await fileShaOrNull(relative);
    const before = group[0].precondition_sha256;
    const after = sha256(Buffer.from(groupAfterContent(group), "utf8"));
    if (currentSha === before) return { state: "before", after_sha256: after };
    if (currentSha === after) return { state: "after", after_sha256: after };
    return { state: "conflict", after_sha256: after };
  }
  const operation = group[0];
  const sourceSha = await fileShaOrNull(operation.path);
  if (operation.type === "create_file") {
    if (sourceSha === null) return { state: "before", after_sha256: operation.expected_after_sha256 };
    if (sourceSha === operation.expected_after_sha256) return { state: "after", after_sha256: sourceSha };
  } else if (operation.type === "delete_file") {
    if (sourceSha === operation.precondition_sha256) return { state: "before", after_sha256: null };
    if (sourceSha === null) return { state: "after", after_sha256: null };
  } else if (operation.type === "move_file") {
    const destinationSha = await fileShaOrNull(operation.destination_path);
    if (sourceSha === operation.precondition_sha256 && destinationSha === null) {
      return { state: "before", after_sha256: operation.expected_after_sha256 };
    }
    if (sourceSha === null && destinationSha === operation.expected_after_sha256) {
      return { state: "after", after_sha256: destinationSha };
    }
  } else {
    if (sourceSha === operation.precondition_sha256) return { state: "before", after_sha256: operation.expected_after_sha256 };
    if (sourceSha === operation.expected_after_sha256) return { state: "after", after_sha256: sourceSha };
  }
  return { state: "conflict", after_sha256: operation.expected_after_sha256 };
}

async function writeGroup(relative, group, afterSha) {
  if (group.length > 1) {
    await atomicWrite(resolveInside(repoRoot, relative).absolute, groupAfterContent(group), { backup: false });
    return;
  }
  const operation = group[0];
  const source = resolveInside(repoRoot, operation.path).absolute;
  if (operation.type === "replace_exact_block" || operation.type === "replace_file") {
    await atomicWrite(source, operationAfterContent(operation), { backup: false });
  } else if (operation.type === "create_file") {
    await atomicCreate(source, operation.new_content);
  } else if (operation.type === "delete_file") {
    const recovery = path.join(runDir, "recovery", operation.operation_id + ".deleted");
    await fs.mkdir(path.dirname(recovery), { recursive: true });
    await fs.rename(source, recovery);
  } else if (operation.type === "move_file") {
    const destination = resolveInside(repoRoot, operation.destination_path).absolute;
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(source, destination);
  }
  const observed = operation.type === "move_file"
    ? await fileShaOrNull(operation.destination_path)
    : await fileShaOrNull(operation.path);
  if (observed !== afterSha) throw new Error("post-write verification failed for " + operation.operation_id);
}

async function commandApply() {
  const state = await loadState();
  if (!state) throw new Error("no active run");
  const proposal = await loadProposal({ repairView: true });
  if (!proposal) throw new Error("no active proposal");
  if (proposal.status === "closed") {
    const baseline = await loadBaseline();
    await closeProposalAndRun(proposal, state, baseline, "recovered_finalization");
    console.log("Recovered the closed proposal and finalized its run.");
    return;
  }
  const selected = proposal.operations.filter((operation) => operation.decision === "approved");
  if (!selected.length) {
    if (!proposalUnresolved(proposal)) {
      const baseline = await loadBaseline();
      await closeProposalAndRun(proposal, state, baseline, "recovered_finalization");
      console.log("Recovered operation receipts and finalized the run.");
      return;
    }
    throw new Error("proposal has no approved operations");
  }
  for (const operation of selected) {
    if (!approvalFor(proposal, operation)) {
      throw new Error("approved operation has no matching authorization: " + operation.operation_id);
    }
  }
  const policy = await computePolicyFingerprint(repoRoot, maintenanceDir);
  if (policy.rules.policy_version !== proposal.policy_version || policy.policy_sha256 !== proposal.policy_sha256) {
    throw new Error("audit policy changed before apply");
  }
  await assertDependenciesCurrent(selected);
  const groups = applyGroups(selected);
  const states = [];
  for (const [relative, group] of groups) {
    const observed = await groupState(relative, group);
    if (observed.state === "conflict") throw new Error("approved target drifted: " + relative);
    states.push({ relative, group, ...observed });
  }
  const notYetApplied = states
    .filter((entry) => entry.state === "before")
    .flatMap((entry) => entry.group);
  const preconditionErrors = await verifyProposalPreconditions(repoRoot, policy.rules, {
    ...proposal,
    operations: notYetApplied,
  });
  if (preconditionErrors.length) throw new Error(preconditionErrors.join("\n"));

  let working = proposal;
  for (const entry of states) {
    if (entry.state === "before") {
      await writeGroup(entry.relative, entry.group, entry.after_sha256);
      if (process.env.MAINTENANCE_TEST_FAILPOINT === "after_operation_write") {
        throw new Error("test failpoint after_operation_write");
      }
    }
    const verified = await groupState(entry.relative, entry.group);
    if (verified.state !== "after") throw new Error("group did not reach expected result: " + entry.relative);
    const ids = new Set(entry.group.map((operation) => operation.operation_id));
    const executions = entry.group
      .filter((operation) => !(working.executions ?? []).some(
        (receipt) => receipt.operation_id === operation.operation_id && receipt.operation_sha256 === operation.operation_sha256,
      ))
      .map((operation) => ({
        operation_id: operation.operation_id,
        operation_sha256: operation.operation_sha256,
        actual_before_sha256: operation.precondition_sha256 ?? null,
        actual_after_sha256: entry.after_sha256,
        status: "verified",
        verified_at: now(),
      }));
    working = await writeProposal({
      ...working,
      operations: working.operations.map((operation) => ids.has(operation.operation_id)
        ? { ...operation, decision: "applied", result: { summary: "已执行并验证。" } }
        : operation),
      executions: [...(working.executions ?? []), ...executions],
    });
    if (process.env.MAINTENANCE_TEST_FAILPOINT === "after_operation_receipt") {
      throw new Error("test failpoint after_operation_receipt");
    }
  }

  const baseline = await loadBaseline();
  if (!proposalUnresolved(working)) {
    await closeProposalAndRun(working, state, baseline, "applied_and_verified");
    console.log("Applied and verified " + selected.length + " operations; run closed.");
    return;
  }
  const next = await writeProposal({ ...working, status: "awaiting_decision" });
  await writeState({
    ...state,
    status: "awaiting_decision",
    proposal: { id: next.proposal_id, version: next.version, payload_sha256: next.payload_sha256 },
    next_action: { type: "await_user_decision", proposal_id: next.proposal_id, version: next.version },
    updated_at: now(),
  });
  console.log("Applied and verified " + selected.length + " operations; pending operations remain.");
}

async function commandRefresh(options) {
  const state = await loadState();
  if (!state) throw new Error("no active run");
  const baseline = await loadBaseline();
  let targets = state.audit_scope.target_paths;
  let mode = state.mode;
  if (options.mode) {
    if (options.mode !== "full") throw new Error("refresh --mode only accepts full");
    const full = await scanWorkspace(repoRoot, maintenanceDir);
    targets = full.files.map((record) => record.path);
    mode = "full";
  }
  const scan = await scanSelectedScope(
    repoRoot,
    maintenanceDir,
    baselineWithTombstones(baseline, targets),
    targets,
  );
  if (mode === "full") scan.scope = { ...scan.scope, kind: "global", global_completion: true };
  const proposal = state.proposal ? await loadProposal({ repairView: true }) : null;
  if (proposal && proposal.status !== "closed") {
    const stale = await writeProposal({ ...proposal, status: "stale", completed_at: now() });
    await archiveProposal(stale);
  }
  const units = scopeUnits(scan).map((unit) => ({ ...unit, status: "planned", summary: null, findings: [] }));
  await writeState({
    ...state,
    status: "auditing",
    mode,
    policy_version: scan.rules.policy_version,
    policy_sha256: scan.policy_sha256,
    audit_scope: scan.scope,
    observed: Object.fromEntries(scan.files.map((record) => [record.path, {
      sha256: record.sha256,
      bytes: record.bytes,
      tombstone: record.tombstone ?? false,
    }])),
    units,
    proposal: null,
    next_action: nextAuditAction(units),
    updated_at: now(),
  });
  console.log("Refreshed " + state.run_id + ": " + targets.length + " targets.");
}

function migrateLegacyProposal(legacy, baseline, policy) {
  const counts = Object.fromEntries(
    ["pending", "approved", "rejected", "deferred", "applied", "failed"].map((decision) => [
      decision,
      (legacy.operations ?? []).filter((operation) => (operation.decision ?? "pending") === decision).length,
    ]),
  );
  return sealProposal({
    schema_version: PROPOSAL_SCHEMA,
    storage_format: "proposal-json-v5",
    proposal_id: legacy.proposal_id,
    version: legacy.version,
    status: "closed",
    run_id: legacy.run_id ?? "legacy-v4",
    based_on_baseline_id: baseline.baseline_id,
    policy_version: policy.rules.policy_version,
    policy_sha256: policy.policy_sha256,
    audit_scope: {
      kind: "legacy",
      target_paths: [],
      dependency_paths: [],
      required_paths: [],
      dependencies: [],
      global_completion: false,
    },
    excluded_scope: [],
    operations: [],
    decisions: [],
    executions: [],
    revisions: [],
    legacy_summary: {
      source_schema: legacy.schema_version,
      operation_counts: counts,
      decisions: legacy.decisions ?? [],
      executions: legacy.executions ?? [],
      operations: legacy.operations ?? [],
    },
    created_at: legacy.created_at ?? now(),
    completed_at: legacy.completed_at ?? now(),
  });
}

async function commandMigrateV4() {
  const legacy = await loadBaseline({ allowV4: true });
  if (legacy.schema_version !== 4) throw new Error("baseline is not maintenance-4");
  if (await pathExists(statePath)) throw new Error("cannot migrate an active maintenance-4 run");
  const policy = await computePolicyFingerprint(repoRoot, maintenanceDir);
  const files = (legacy.files ?? []).map((record) => ({
    path: record.path,
    role: record.role,
    sha256: record.sha256,
    bytes: record.bytes,
    links: record.links ?? [],
    reviewed_at: legacy.created_at ?? now(),
    policy_version: policy.rules.policy_version,
    dependencies: {},
    outcome: "migrated_review",
  })).sort((left, right) => ordinalCompare(left.path, right.path));
  const migrated = {
    schema_version: BASELINE_SCHEMA,
    protocol: "maintenance-5",
    baseline_id: nextBaselineId("migration"),
    created_at: now(),
    policy_version: policy.rules.policy_version,
    policy_sha256: policy.policy_sha256,
    executor_version: policy.rules.executor_version,
    root_hash: manifestRoot(files),
    files,
    open_items: legacy.open_items ?? [],
    last_result: legacy.last_result ?? null,
    migration: {
      from_schema: 4,
      from_baseline_id: legacy.baseline_id,
      migrated_at: now(),
      preserved_open_items: (legacy.open_items ?? []).length,
      legacy_dispositions: (legacy.dispositions ?? []).length,
      legacy_archives: (legacy.proposal_archives ?? []).length,
    },
  };
  const errors = validateBaselineShape(migrated);
  if (errors.length) throw new Error("migration produced invalid baseline:\n" + errors.join("\n"));
  const legacyProposal = await readJson(proposalDataPath).catch(() => null);
  const migratedProposal = legacyProposal?.schema_version === 4
    ? migrateLegacyProposal(legacyProposal, migrated, policy)
    : null;
  const migratedView = migratedProposal ? renderProposal(migratedProposal) : null;
  await atomicWriteJson(baselinePath, migrated, { backup: true });
  if (migratedProposal) {
    await atomicWriteJson(proposalDataPath, migratedProposal, { backup: true });
    await atomicWrite(proposalViewPath, migratedView, { backup: true });
    await archiveProposal(migratedProposal);
  }
  console.log(
    "Migrated " + legacy.baseline_id + " to maintenance-5; preserved "
    + migrated.open_items.length + " open items.",
  );
}

async function dispatch(command, options) {
  if (command === "init") return commandInit(options);
  if (command === "status") return commandStatus();
  if (command === "validate") return commandValidate(options);
  if (command === "scope") return commandScope(options);
  if (command === "start") return commandStart(options);
  if (command === "checkpoint") return commandCheckpoint(options);
  if (command === "publish") return commandPublish(options);
  if (command === "show") return commandShow(options);
  if (command === "revise") return commandRevise(options);
  if (command === "decision") return commandDecision(options);
  if (command === "apply") return commandApply(options);
  if (command === "refresh") return commandRefresh(options);
  if (command === "migrate-v4") return commandMigrateV4(options);
  throw new Error("unknown command " + command);
}

async function main() {
  const { command, options } = parseCommand(process.argv.slice(2));
  if (READ_ONLY_COMMANDS.has(command)) await dispatch(command, options);
  else await withAuditLock(maintenanceDir, () => dispatch(command, options));
}

main().catch((error) => {
  console.error("Audit error: " + error.message);
  process.exitCode = 1;
});
