import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  manifestRoot,
  scanWorkspace,
  serializeJson,
  validateBaselineShape,
} from "../core.mjs";

const execFileAsync = promisify(execFile);
const systemSource = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixedReviewTime = "2000-01-01T00:00:00.000Z";

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, serializeJson(value), "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeRelative(context, relative, content) {
  const absolute = path.join(context.root, ...relative.split("/"));
  await fs.mkdir(path.dirname(absolute), { recursive: true });
  await fs.writeFile(absolute, content, "utf8");
}

async function readRelative(context, relative) {
  return fs.readFile(path.join(context.root, ...relative.split("/")), "utf8");
}

function baselineFromScan(scan, { schema = 5 } = {}) {
  if (schema === 4) {
    return {
      schema_version: 4,
      protocol: "maintenance-4",
      baseline_id: "BL4-fixture",
      created_at: fixedReviewTime,
      files: scan.files,
      root_hash: scan.root_hash,
      open_items: [],
      last_result: null,
    };
  }
  const files = scan.files.map((record) => ({
    ...record,
    reviewed_at: fixedReviewTime,
    policy_version: scan.rules.policy_version,
    dependencies: {},
    outcome: "fixture_review",
  }));
  return {
    schema_version: 5,
    protocol: "maintenance-5",
    baseline_id: "BL5-fixture",
    created_at: fixedReviewTime,
    policy_version: scan.rules.policy_version,
    policy_sha256: scan.policy_sha256,
    executor_version: scan.rules.executor_version,
    root_hash: manifestRoot(files),
    files,
    open_items: [],
    last_result: null,
  };
}

async function fixture(t, { createBaseline = true } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "maintenance-v5-integration-"));
  const maintenance = path.join(root, "maintenance");
  const system = path.join(maintenance, ".system");
  await fs.mkdir(path.join(system, "tests"), { recursive: true });
  for (const name of ["audit.mjs", "core.mjs", "rules.json"]) {
    await fs.copyFile(path.join(systemSource, name), path.join(system, name));
  }
  for (const [relative, content] of Object.entries({
    "AGENTS.md": "# Fixture rules\n",
    "README.md": "# Fixture memory system\n",
    "CHANGELOG.md": "# Fixture changelog\n",
    "fact/events/event.md": "# Fact\nfact original\n[Person](../../people/person.md)\n",
    "fact/events/second.md": "# Second\nsecond original\n",
    "feeling/by_event/event.md": "# Feeling\nfeeling original\n",
    "feeling/by_event/second.md": "# Second feeling\nsecond feeling original\n",
    "fact/index.md": "# Fact index\n- event\n- second\n",
    "feeling/index.md": "# Feeling index\n- event\n- second\n",
    "summary/current.md": "# Current\ncurrent original\n",
    "summary/overview.md": "# Overview\noverview original\n",
    "summary/people.md": "# People\n- person\n- other\n",
    "summary/timeline.md": "# Timeline\ntimeline original\n",
    "summary/topics.md": "# Topics\ntopics original\n",
    "session/2026/day.md": "# Session\nsession original\n",
    "people/person.md": "# Person\nperson original\n",
    "people/other.md": "# Other\nother original\n",
    "inbox/unresolved.md": "# Inbox\nnone\n",
  })) {
    await writeRelative({ root }, relative, content);
  }
  const scan = await scanWorkspace(root, maintenance);
  if (createBaseline) await writeJson(path.join(maintenance, "baseline.json"), baselineFromScan(scan));
  const context = {
    root,
    maintenance,
    audit: path.join(system, "audit.mjs"),
  };
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return context;
}

test("init creates a valid v5 baseline exactly once", async (t) => {
  const context = await fixture(t, { createBaseline: false });
  const invalid = await cli(context, "init", "--id", "bad id");
  assert.notEqual(invalid.code, 0);

  const initialized = await cli(context, "init", "--id", "BL5-public-fixture");
  assert.equal(initialized.code, 0, initialized.stderr);
  const baselinePath = path.join(context.maintenance, "baseline.json");
  const original = await fs.readFile(baselinePath);
  const baseline = JSON.parse(original.toString("utf8"));
  assert.equal(baseline.schema_version, 5);
  assert.equal(baseline.protocol, "maintenance-5");
  assert.equal(baseline.baseline_id, "BL5-public-fixture");
  assert.equal(baseline.executor_version, 5);
  assert.deepEqual(validateBaselineShape(baseline), []);
  assert.ok(baseline.files.length > 0);
  assert.ok(baseline.files.every((record) => (
    record.reviewed_at
    && record.policy_version === baseline.policy_version
    && record.outcome === "initial_import"
    && record.dependencies
  )));

  const validation = await cli(context, "validate");
  assert.equal(validation.code, 0, validation.stderr);
  const duplicate = await cli(context, "init");
  assert.notEqual(duplicate.code, 0);
  assert.deepEqual(await fs.readFile(baselinePath), original);
});

test("init refuses orphaned run or proposal state", async (t) => {
  const runContext = await fixture(t, { createBaseline: false });
  await writeJson(path.join(runContext.maintenance, "run", "state.json"), { orphaned: true });
  const withRun = await cli(runContext, "init");
  assert.notEqual(withRun.code, 0);
  await assert.rejects(fs.access(path.join(runContext.maintenance, "baseline.json")));

  const proposalContext = await fixture(t, { createBaseline: false });
  await writeJson(path.join(proposalContext.maintenance, "proposal.json"), { orphaned: true });
  const withProposal = await cli(proposalContext, "init");
  assert.notEqual(withProposal.code, 0);
  await assert.rejects(fs.access(path.join(proposalContext.maintenance, "baseline.json")));
});

async function cliWithEnv(context, environment, ...arguments_) {
  try {
    const result = await execFileAsync(process.execPath, [context.audit, ...arguments_], {
      cwd: context.root,
      windowsHide: true,
      env: { ...process.env, ...environment },
    });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: Number.isInteger(error.code) ? error.code : 1,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? "",
    };
  }
}

async function cli(context, ...arguments_) {
  return cliWithEnv(context, {}, ...arguments_);
}

async function readState(context) {
  return readJson(path.join(context.maintenance, "run", "state.json"));
}

async function readProposal(context) {
  return readJson(path.join(context.maintenance, "proposal.json"));
}

async function completeAllUnits(context) {
  while (true) {
    const state = await readState(context);
    const unit = state.units.find((entry) => entry.status !== "completed");
    if (!unit) return;
    await writeJson(path.join(context.root, "checkpoint.json"), {
      run_id: state.run_id,
      unit_id: unit.id,
      status: "completed",
      summary: `reviewed ${unit.path}`,
      findings: [],
    });
    const result = await cli(context, "checkpoint", "--file", "checkpoint.json");
    assert.equal(result.code, 0, result.stderr);
  }
}

async function startSelected(context, ...paths) {
  const arguments_ = ["start"];
  for (const relative of paths) arguments_.push("--path", relative);
  const result = await cli(context, ...arguments_);
  assert.equal(result.code, 0, result.stderr);
  await completeAllUnits(context);
}

function exactOperation(operationId, relative, oldText, newText, extra = {}) {
  return {
    operation_id: operationId,
    type: "replace_exact_block",
    path: relative,
    old_text: oldText,
    new_text: newText,
    reason: extra.reason ?? "The reviewed text should be updated.",
    effect: extra.effect ?? "Only the exact selected block changes.",
    preserves: extra.preserves ?? "All surrounding text remains unchanged.",
    risk: extra.risk ?? "Low; exact matching is required.",
    recommendation: extra.recommendation ?? "Review the before and after blocks.",
    suggested: extra.suggested ?? true,
  };
}

function fileOperation(operationId, relative, newContent) {
  return {
    operation_id: operationId,
    type: "replace_file",
    path: relative,
    new_content: newContent,
    reason: "The user supplied a complete alternative.",
    effect: "The selected file is replaced.",
    preserves: "No other path is changed.",
    risk: "Review the complete replacement preview.",
    recommendation: "Use the user-authored alternative.",
    suggested: true,
  };
}

async function publish(context, operations, proposalId = "PTEST") {
  await writeJson(path.join(context.root, "proposal-draft.json"), {
    proposal_id: proposalId,
    version: 1,
    operations,
  });
  const result = await cli(context, "publish", "--file", "proposal-draft.json");
  assert.equal(result.code, 0, result.stderr);
  return operations.length ? readProposal(context) : null;
}

async function decide(context, proposal, selections, userWords = "Use these exact choices.") {
  await writeJson(path.join(context.root, "decision.json"), {
    proposal_id: proposal.proposal_id,
    version: proposal.version,
    payload_sha256: proposal.payload_sha256,
    user_words: userWords,
    ...selections,
  });
  return cli(context, "decision", "--file", "decision.json");
}

test("selected scope supports multiple paths, path lists, and strict options", async (t) => {
  const context = await fixture(t);
  await fs.writeFile(
    path.join(context.root, "paths.txt"),
    "fact/events/event.md\nsummary/current.md\n",
    "utf8",
  );
  const scoped = await cli(context, "scope", "--paths-file", "paths.txt");
  assert.equal(scoped.code, 0, scoped.stderr);
  const result = JSON.parse(scoped.stdout);
  assert.deepEqual(result.targets, ["fact/events/event.md", "summary/current.md"]);
  const dependencies = new Map(result.dependencies.map((entry) => [entry.path, entry]));
  assert.ok(dependencies.has("feeling/by_event/event.md"));
  assert.deepEqual(dependencies.get("fact/index.md").for_targets, ["fact/events/event.md"]);

  const started = await cli(
    context,
    "start",
    "--path",
    "summary/current.md",
    "--path",
    "fact/events/event.md",
  );
  assert.equal(started.code, 0, started.stderr);
  const state = await readState(context);
  assert.equal(state.mode, "selected");
  assert.deepEqual(state.audit_scope.target_paths, ["fact/events/event.md", "summary/current.md"]);
  assert.equal(state.units.length, 2);

  const invalid = await cli(context, "status", "--unknown-option");
  assert.notEqual(invalid.code, 0);
  assert.match(invalid.stderr, /Unknown option|unknown/i);
});

test("a no-change result advances only the selected file review", async (t) => {
  const context = await fixture(t);
  const before = await readJson(path.join(context.maintenance, "baseline.json"));
  const untouchedBefore = before.files.find((entry) => entry.path === "summary/overview.md");
  await fs.appendFile(path.join(context.root, "fact", "events", "event.md"), "reviewed addition\n");

  await startSelected(context, "fact/events/event.md");
  await publish(context, [], "PNONE");

  const after = await readJson(path.join(context.maintenance, "baseline.json"));
  const reviewed = after.files.find((entry) => entry.path === "fact/events/event.md");
  const untouchedAfter = after.files.find((entry) => entry.path === "summary/overview.md");
  assert.notEqual(reviewed.sha256, before.files.find((entry) => entry.path === reviewed.path).sha256);
  assert.equal(reviewed.outcome, "accepted_as_is");
  assert.notEqual(reviewed.reviewed_at, fixedReviewTime);
  assert.deepEqual(untouchedAfter, untouchedBefore);
  await assert.rejects(fs.access(path.join(context.maintenance, "run", "state.json")));

  await fs.appendFile(path.join(context.root, "summary", "current.md"), "new current line\n");
  const validation = await cli(context, "validate");
  assert.equal(validation.code, 2);
  assert.match(validation.stdout, /modified: summary\/current\.md/);
  assert.doesNotMatch(validation.stdout, /modified: fact\/events\/event\.md/);

  const incremental = await cli(context, "start");
  assert.equal(incremental.code, 0, incremental.stderr);
  const state = await readState(context);
  assert.deepEqual(state.audit_scope.target_paths, ["summary/current.md"]);
});

test("publish rejects a dependency that changed after the audit unit completed", async (t) => {
  const context = await fixture(t);
  await startSelected(context, "fact/events/event.md");
  await fs.appendFile(path.join(context.root, "fact", "index.md"), "changed after review\n");
  await writeJson(path.join(context.root, "proposal-draft.json"), {
    proposal_id: "PSTALEINPUT",
    operations: [
      exactOperation("O1", "fact/events/event.md", "fact original", "stale suggestion"),
    ],
  });

  const result = await cli(context, "publish", "--file", "proposal-draft.json");
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /audit input changed after review: fact\/index\.md/);
  await assert.rejects(fs.access(path.join(context.maintenance, "proposal.json")));
});

test("proposal view defaults to suggested exact before and after blocks", async (t) => {
  const context = await fixture(t);
  await startSelected(context, "fact/events/event.md");
  const proposal = await publish(context, [
    exactOperation(
      "O1",
      "fact/events/event.md",
      "fact original",
      "fact revised\n[Other](../../people/other.md)",
    ),
    exactOperation(
      "O2",
      "summary/current.md",
      "current original",
      "hidden optional revision",
      { suggested: false },
    ),
  ], "PVIEW");

  const markdownPath = path.join(context.maintenance, "proposal.md");
  const markdown = await fs.readFile(markdownPath, "utf8");
  assert.match(markdown, /## 操作索引/);
  assert.match(markdown, /\*\*修改前\*\*/);
  assert.match(markdown, /\*\*修改后\*\*/);
  assert.match(markdown, /fact original/);
  assert.match(markdown, /fact revised/);
  assert.match(markdown, /\| O2 \|[^\n]*`summary\/current\.md`/);
  assert.doesNotMatch(markdown, /hidden optional revision/);
  assert.ok(proposal.audit_scope.dependency_paths.includes("people/other.md"));

  const all = await cli(context, "show", "--all");
  assert.equal(all.code, 0, all.stderr);
  assert.match(all.stdout, /hidden optional revision/);
  const one = await cli(context, "show", "--operation", "O1", "--expanded");
  assert.equal(one.code, 0, one.stderr);
  assert.match(one.stdout, /<details open>/);
  assert.doesNotMatch(one.stdout, /hidden optional revision/);

  await fs.writeFile(markdownPath, "tampered view\n", "utf8");
  const repaired = await cli(context, "show", "--operation", "O1");
  assert.equal(repaired.code, 0, repaired.stderr);
  assert.doesNotMatch(await fs.readFile(markdownPath, "utf8"), /tampered view/);
});

test("publish repairs state when proposal publication was interrupted", async (t) => {
  const context = await fixture(t);
  await startSelected(context, "summary/current.md");
  await writeJson(path.join(context.root, "proposal-draft.json"), {
    proposal_id: "PPUBLISHREPLAY",
    operations: [
      exactOperation("O1", "summary/current.md", "current original", "published once"),
    ],
  });
  const interrupted = await cliWithEnv(
    context,
    { MAINTENANCE_TEST_FAILPOINT: "after_proposal_write" },
    "publish",
    "--file",
    "proposal-draft.json",
  );
  assert.notEqual(interrupted.code, 0);
  assert.equal((await readState(context)).status, "auditing");
  assert.equal((await readProposal(context)).proposal_id, "PPUBLISHREPLAY");

  const recovered = await cli(context, "publish", "--file", "proposal-draft.json");
  assert.equal(recovered.code, 0, recovered.stderr);
  assert.match(recovered.stdout, /Recovered already-published/);
  assert.equal((await readState(context)).status, "awaiting_decision");
});

test("revision can add, remove, retarget, and preserve unchanged approval", async (t) => {
  const context = await fixture(t);
  await startSelected(context, "fact/events/event.md");
  let proposal = await publish(context, [
    exactOperation("O1", "fact/events/event.md", "fact original", "fact first proposal"),
    exactOperation("O2", "summary/current.md", "current original", "current approved"),
    exactOperation("O4", "people/person.md", "person original", "person removed proposal"),
  ], "PREVISE");
  const approvedHash = proposal.operations.find((entry) => entry.operation_id === "O2").operation_sha256;
  const decision = await decide(context, proposal, { approved: ["O2"] });
  assert.equal(decision.code, 0, decision.stderr);
  proposal = await readProposal(context);

  await writeJson(path.join(context.root, "revision.json"), {
    proposal_id: proposal.proposal_id,
    from_version: proposal.version,
    from_payload_sha256: proposal.payload_sha256,
    user_words: "Replace O1 completely, remove O4, and add O3.",
    changes: [
      {
        action: "replace",
        operation_id: "O1",
        operation: fileOperation("O1", "inbox/unresolved.md", "# Inbox\nuser alternative\n"),
      },
      { action: "remove", operation_id: "O4" },
      {
        action: "add",
        operation: exactOperation("O3", "people/person.md", "person original", "person custom"),
      },
    ],
  });
  const revisedResult = await cli(context, "revise", "--file", "revision.json");
  assert.equal(revisedResult.code, 0, revisedResult.stderr);
  const revised = await readProposal(context);
  assert.equal(revised.version, 2);
  assert.ok(
    (await fs.readdir(path.join(context.maintenance, "proposals")))
      .some((name) => name.startsWith("PREVISE-v1-") && name.endsWith(".json")),
  );
  assert.equal(revised.operations.some((entry) => entry.operation_id === "O4"), false);
  assert.equal(revised.operations.find((entry) => entry.operation_id === "O1").path, "inbox/unresolved.md");
  assert.equal(revised.operations.find((entry) => entry.operation_id === "O1").type, "replace_file");
  assert.equal(revised.operations.find((entry) => entry.operation_id === "O3").decision, "pending");
  const preserved = revised.operations.find((entry) => entry.operation_id === "O2");
  assert.equal(preserved.decision, "approved");
  assert.equal(preserved.operation_sha256, approvedHash);
  assert.ok(revised.audit_scope.target_paths.includes("fact/events/event.md"));
  assert.ok(revised.audit_scope.target_paths.includes("inbox/unresolved.md"));

  const applied = await cli(context, "apply");
  assert.equal(applied.code, 0, applied.stderr);
  assert.match(await readRelative(context, "summary/current.md"), /current approved/);
  assert.equal((await readProposal(context)).operations.find((entry) => entry.operation_id === "O2").decision, "applied");
});

test("apply ignores unrelated drift", async (t) => {
  const context = await fixture(t);
  await startSelected(context, "fact/events/event.md");
  let proposal = await publish(context, [
    exactOperation("O1", "fact/events/event.md", "fact original", "fact applied"),
  ], "PUNRELATED");
  const decision = await decide(context, proposal, { approved: ["O1"] });
  assert.equal(decision.code, 0, decision.stderr);
  await fs.appendFile(path.join(context.root, "summary", "current.md"), "unrelated drift\n");

  const applied = await cli(context, "apply");
  assert.equal(applied.code, 0, applied.stderr);
  assert.match(await readRelative(context, "fact/events/event.md"), /fact applied/);
  proposal = await readProposal(context);
  assert.equal(proposal.status, "closed");
  const validation = await cli(context, "validate");
  assert.equal(validation.code, 2);
  assert.match(validation.stdout, /summary\/current\.md/);
});

test("apply preflights every target and every bound dependency", async (t) => {
  const targetContext = await fixture(t);
  await startSelected(targetContext, "fact/events/event.md", "summary/current.md");
  let proposal = await publish(targetContext, [
    exactOperation("O1", "fact/events/event.md", "fact original", "must not be written"),
    exactOperation("O2", "summary/current.md", "current original", "blocked by drift"),
  ], "PTARGET");
  let decision = await decide(targetContext, proposal, { approved: ["O1", "O2"] });
  assert.equal(decision.code, 0, decision.stderr);
  await fs.appendFile(path.join(targetContext.root, "summary", "current.md"), "third-party change\n");
  const blockedTarget = await cli(targetContext, "apply");
  assert.notEqual(blockedTarget.code, 0);
  assert.match(blockedTarget.stderr, /drift/i);
  assert.match(await readRelative(targetContext, "fact/events/event.md"), /fact original/);
  assert.doesNotMatch(await readRelative(targetContext, "fact/events/event.md"), /must not be written/);

  const dependencyContext = await fixture(t);
  await startSelected(dependencyContext, "fact/events/event.md");
  proposal = await publish(dependencyContext, [
    exactOperation("O1", "fact/events/event.md", "fact original", "dependency guarded"),
  ], "PDEPENDENCY");
  decision = await decide(dependencyContext, proposal, { approved: ["O1"] });
  assert.equal(decision.code, 0, decision.stderr);
  await fs.appendFile(path.join(dependencyContext.root, "fact", "index.md"), "dependency drift\n");
  const blockedDependency = await cli(dependencyContext, "apply");
  assert.notEqual(blockedDependency.code, 0);
  assert.match(blockedDependency.stderr, /dependencies changed/i);
  assert.match(await readRelative(dependencyContext, "fact/events/event.md"), /fact original/);
});

test("partial approvals remain resumable", async (t) => {
  const context = await fixture(t);
  await startSelected(context, "fact/events/event.md", "summary/current.md");
  let proposal = await publish(context, [
    exactOperation("O1", "fact/events/event.md", "fact original", "fact first"),
    exactOperation("O2", "summary/current.md", "current original", "current second"),
  ], "PPARTIAL");
  let decision = await decide(context, proposal, { approved: ["O1"] });
  assert.equal(decision.code, 0, decision.stderr);
  let applied = await cli(context, "apply");
  assert.equal(applied.code, 0, applied.stderr);
  proposal = await readProposal(context);
  assert.equal(proposal.operations.find((entry) => entry.operation_id === "O1").decision, "applied");
  assert.equal(proposal.operations.find((entry) => entry.operation_id === "O2").decision, "pending");
  assert.equal(proposal.executions.filter((entry) => entry.operation_id === "O1").length, 1);

  decision = await decide(context, proposal, { approved: ["O2"] });
  assert.equal(decision.code, 0, decision.stderr);
  applied = await cli(context, "apply");
  assert.equal(applied.code, 0, applied.stderr);
  proposal = await readProposal(context);
  assert.equal(proposal.status, "closed");
  assert.equal(proposal.executions.filter((entry) => entry.operation_id === "O1").length, 1);
  assert.equal(proposal.executions.filter((entry) => entry.operation_id === "O2").length, 1);
  assert.ok(
    (await fs.readdir(path.join(context.maintenance, "proposals")))
      .some((name) => name.startsWith("PPARTIAL-v1-") && name.endsWith(".json")),
  );
  await assert.rejects(fs.access(path.join(context.maintenance, "run", "state.json")));
});

test("apply replays a completed write when its receipt was interrupted", async (t) => {
  const context = await fixture(t);
  await startSelected(context, "fact/events/event.md");
  let proposal = await publish(context, [
    exactOperation("O1", "fact/events/event.md", "fact original", "fact replayed"),
  ], "PREPLAY");
  const decision = await decide(context, proposal, { approved: ["O1"] });
  assert.equal(decision.code, 0, decision.stderr);

  const interrupted = await cliWithEnv(
    context,
    { MAINTENANCE_TEST_FAILPOINT: "after_operation_write" },
    "apply",
  );
  assert.notEqual(interrupted.code, 0);
  assert.match(await readRelative(context, "fact/events/event.md"), /fact replayed/);
  proposal = await readProposal(context);
  assert.equal(proposal.operations[0].decision, "approved");
  assert.equal(proposal.executions.length, 0);

  const replayed = await cli(context, "apply");
  assert.equal(replayed.code, 0, replayed.stderr);
  proposal = await readProposal(context);
  assert.equal(proposal.operations[0].decision, "applied");
  assert.equal(proposal.executions.filter((entry) => entry.operation_id === "O1").length, 1);
});

test("apply finalizes when the last receipt was saved before interruption", async (t) => {
  const context = await fixture(t);
  await startSelected(context, "summary/current.md");
  let proposal = await publish(context, [
    exactOperation("O1", "summary/current.md", "current original", "receipt saved"),
  ], "PRECEIPT");
  const decision = await decide(context, proposal, { approved: ["O1"] });
  assert.equal(decision.code, 0, decision.stderr);

  const interrupted = await cliWithEnv(
    context,
    { MAINTENANCE_TEST_FAILPOINT: "after_operation_receipt" },
    "apply",
  );
  assert.notEqual(interrupted.code, 0);
  proposal = await readProposal(context);
  assert.equal(proposal.operations[0].decision, "applied");
  assert.equal(proposal.executions.length, 1);
  assert.equal((await readState(context)).status, "applying");

  const recovered = await cli(context, "apply");
  assert.equal(recovered.code, 0, recovered.stderr);
  assert.match(recovered.stdout, /finalized the run/);
  assert.equal((await readProposal(context)).status, "closed");
  await assert.rejects(fs.access(path.join(context.maintenance, "run", "state.json")));
});

test("multiple exact replacements on one file are composed and written once", async (t) => {
  const context = await fixture(t);
  await writeRelative(context, "summary/current.md", "alpha\nmiddle\nomega\n");
  await startSelected(context, "summary/current.md");
  const proposal = await publish(context, [
    exactOperation("O1", "summary/current.md", "alpha", "ALPHA"),
    exactOperation("O2", "summary/current.md", "omega", "OMEGA"),
  ], "PGROUP");
  const decision = await decide(context, proposal, { approved: ["O1", "O2"] });
  assert.equal(decision.code, 0, decision.stderr);
  const applied = await cli(context, "apply");
  assert.equal(applied.code, 0, applied.stderr);
  assert.equal(await readRelative(context, "summary/current.md"), "ALPHA\nmiddle\nOMEGA\n");
  const closed = await readProposal(context);
  assert.equal(closed.executions.length, 2);
});

test("a selected deletion is reviewed as a tombstone and can later reappear", async (t) => {
  const context = await fixture(t);
  await fs.rm(path.join(context.root, "fact", "events", "event.md"));
  const started = await cli(context, "start", "--path", "fact/events/event.md");
  assert.equal(started.code, 0, started.stderr);
  const state = await readState(context);
  assert.equal(state.observed["fact/events/event.md"].tombstone, true);
  await completeAllUnits(context);
  await publish(context, [], "PDELETE");
  const baseline = await readJson(path.join(context.maintenance, "baseline.json"));
  assert.equal(baseline.files.some((entry) => entry.path === "fact/events/event.md"), false);

  await writeRelative(context, "fact/events/event.md", "# Reappeared\n");
  const validation = await cli(context, "validate");
  assert.equal(validation.code, 2);
  assert.match(validation.stdout, /added: fact\/events\/event\.md/);
});

test("v4 migration preserves reviews, open items, and a closed legacy summary", async (t) => {
  const context = await fixture(t);
  const scan = await scanWorkspace(context.root, context.maintenance);
  const legacyBaseline = baselineFromScan(scan, { schema: 4 });
  legacyBaseline.open_items = [
    { proposal_id: "P4", operation_id: "O2", status: "deferred" },
    { proposal_id: "P3", operation_id: "O9", status: "deferred" },
  ];
  await writeJson(path.join(context.maintenance, "baseline.json"), legacyBaseline);
  await writeJson(path.join(context.maintenance, "proposal.json"), {
    schema_version: 4,
    proposal_id: "P4",
    version: 1,
    status: "closed",
    operations: [
      { operation_id: "O1", decision: "applied", path: "summary/current.md" },
      { operation_id: "O2", decision: "deferred", path: "summary/overview.md" },
    ],
    decisions: [{ approved: ["O1"], deferred: ["O2"] }],
    executions: [{ operation_id: "O1", status: "verified" }],
    created_at: fixedReviewTime,
    completed_at: fixedReviewTime,
  });
  await fs.writeFile(path.join(context.maintenance, "proposal.md"), "legacy view\n", "utf8");

  const migrated = await cli(context, "migrate-v4");
  assert.equal(migrated.code, 0, migrated.stderr);
  const baseline = await readJson(path.join(context.maintenance, "baseline.json"));
  const proposal = await readProposal(context);
  assert.equal(baseline.schema_version, 5);
  assert.equal(baseline.open_items.length, 2);
  assert.ok(baseline.files.every((entry) => entry.outcome === "migrated_review"));
  assert.equal(proposal.schema_version, 5);
  assert.equal(proposal.status, "closed");
  assert.equal(proposal.operations.length, 0);
  assert.equal(proposal.legacy_summary.operation_counts.applied, 1);
  assert.equal(proposal.legacy_summary.operation_counts.deferred, 1);
  const migratedView = await fs.readFile(path.join(context.maintenance, "proposal.md"), "utf8");
  assert.match(migratedView, /maintenance-4 历史记录/);
  assert.match(migratedView, /applied=1/);
  assert.match(migratedView, /deferred=1/);
  assert.ok(
    (await fs.readdir(path.join(context.maintenance, "proposals")))
      .some((name) => name.startsWith("P4-v1-") && name.endsWith(".json")),
  );
  await fs.access(path.join(context.maintenance, "baseline.json.previous"));
  await fs.access(path.join(context.maintenance, "proposal.json.previous"));
});
