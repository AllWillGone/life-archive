import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  BASELINE_SCHEMA,
  PROPOSAL_SCHEMA,
  RUN_SCHEMA,
  atomicCreate,
  atomicWrite,
  buildTextPreview,
  compareBaseline,
  compareFileReview,
  compareSelectedReviews,
  computePolicyFingerprint,
  extractLinkedPaths,
  normalizeRelative,
  operationHash,
  renderProposal,
  resolveInside,
  scanSelectedScope,
  scanWorkspace,
  sealOperation,
  sealProposal,
  sha256,
  validateBaselineShape,
  validateProposalShape,
  validateRunShape,
  verifyProposalPreconditions,
  withAuditLock,
} from "../core.mjs";

async function write(root, relative, content) {
  const filePath = path.join(root, ...relative.split("/"));
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf8");
  return filePath;
}

async function read(root, relative) {
  return fs.readFile(path.join(root, ...relative.split("/")), "utf8");
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "maintenance-core-v5-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const maintenance = path.join(root, "maintenance");
  const rules = {
    schema_version: 1,
    protocol: "maintenance-5",
    policy_version: "5.0",
    system_files: ["AGENTS.md"],
    memory_roots: [
      { path: "fact", role: "fact" },
      { path: "feeling", role: "feeling" },
      { path: "people", role: "people" },
      { path: "summary", role: "summary" },
      { path: "session", role: "session" },
      { path: "inbox", role: "inbox" },
    ],
    allowed_write_roots: ["fact", "feeling", "people", "summary", "session", "inbox"],
    allowed_write_files: [],
    excluded_names: [".ignored"],
    derived_paths: ["summary/current.md"],
    evaluator_files: ["maintenance/.system/core.mjs"],
  };
  const contents = {
    alpha: "# Alpha\n\n[shared](../../people/shared.md)\n",
    alphaFeeling: "# Alpha feeling\n\npeople/shared.md\n",
    beta: "# Beta\n\npeople/shared.md\n",
    betaFeeling: "# Beta feeling\n",
    person: "# Shared\n\ninbox/second-hop.md\n",
  };

  await write(root, "AGENTS.md", "# Test policy\n");
  await write(root, "maintenance/.system/rules.json", `${JSON.stringify(rules, null, 2)}\n`);
  await write(root, "maintenance/.system/core.mjs", "// evaluator source\n");
  await write(root, "fact/index.md", "# Fact index\n");
  await write(root, "feeling/index.md", "# Feeling index\n");
  await write(root, "summary/people.md", "# People index\n");
  await write(root, "summary/current.md", "# Current\n");
  await write(root, "fact/events/alpha.md", contents.alpha);
  await write(root, "feeling/by_event/alpha.md", contents.alphaFeeling);
  await write(root, "fact/events/beta.md", contents.beta);
  await write(root, "feeling/by_event/beta.md", contents.betaFeeling);
  await write(root, "people/shared.md", contents.person);
  await write(root, "inbox/second-hop.md", "# Second hop\n");
  await write(root, "session/unrelated.md", "# Unrelated\n");
  return { root, maintenance, rules, contents };
}

async function makeBaseline(root, maintenance) {
  const scan = await scanWorkspace(root, maintenance);
  return {
    schema_version: BASELINE_SCHEMA,
    baseline_id: "BL-TEST",
    policy_sha256: scan.policy_sha256,
    root_hash: scan.root_hash,
    files: scan.files,
  };
}

function replaceOperation({
  id,
  path: relative,
  before,
  after,
  suggested = true,
  decision = "pending",
}) {
  return sealOperation({
    operation_id: id,
    type: "replace_file",
    path: relative,
    before_content: before,
    new_content: after,
    precondition_sha256: sha256(Buffer.from(before, "utf8")),
    expected_after_sha256: sha256(Buffer.from(after, "utf8")),
    reason: "The current text needs a precise correction.",
    effect: "The selected text is corrected.",
    preserves: "All unrelated text remains unchanged.",
    risk: "The user should review the exact before and after text.",
    recommendation: "Apply only after explicit approval.",
    suggested,
    decision,
  });
}

function exactOperation({ id, path: relative, before, oldText, newText }) {
  const after = before.replace(oldText, newText);
  return sealOperation({
    operation_id: id,
    type: "replace_exact_block",
    path: relative,
    before_content: before,
    old_text: oldText,
    new_text: newText,
    precondition_sha256: sha256(Buffer.from(before, "utf8")),
    expected_after_sha256: sha256(Buffer.from(after, "utf8")),
    reason: "The exact block needs correction.",
    effect: "Only the selected block changes.",
    preserves: "All other source text remains unchanged.",
    risk: "Review the exact block before approval.",
    recommendation: "Apply only after explicit approval.",
    suggested: true,
    decision: "pending",
  });
}

function proposalFor(operations) {
  return sealProposal({
    proposal_id: "P-TEST",
    version: 1,
    based_on_baseline_id: "BL-TEST",
    policy_sha256: "a".repeat(64),
    based_on_root_hash: "b".repeat(64),
    status: "awaiting_decision",
    excluded_scope: [],
    operations,
  });
}

function count(text, needle) {
  return text.split(needle).length - 1;
}

test("schema constants use maintenance-5", () => {
  assert.equal(BASELINE_SCHEMA, 5);
  assert.equal(RUN_SCHEMA, 5);
  assert.equal(PROPOSAL_SCHEMA, 5);
});

test("repository-relative path validation rejects traversal and absolute paths", () => {
  assert.equal(normalizeRelative("fact\\events\\a.md"), "fact/events/a.md");
  for (const unsafe of ["../a.md", "/a.md", "C:/a.md", "fact//a.md", "fact/./a.md"]) {
    assert.throws(() => normalizeRelative(unsafe));
  }
  const resolved = resolveInside(path.join("C:", "fixture"), "fact/events/a.md");
  assert.ok(resolved.absolute.endsWith(path.join("fact", "events", "a.md")));
});

test("atomic writes are replace-only by default and backups are opt-in", async (t) => {
  const { root } = await fixture(t);
  const target = await write(root, "scratch/value.txt", "one");
  await atomicWrite(target, "two");
  assert.equal(await fs.readFile(target, "utf8"), "two");
  await assert.rejects(fs.access(`${target}.previous`));
  await atomicWrite(target, "three", { backup: true });
  assert.equal(await fs.readFile(target, "utf8"), "three");
  assert.equal(await fs.readFile(`${target}.previous`, "utf8"), "two");

  const createTarget = path.join(root, "scratch", "create-only.txt");
  await atomicCreate(createTarget, "created");
  await assert.rejects(atomicCreate(createTarget, "overwrite"), { code: "EEXIST" });
  assert.equal(await fs.readFile(createTarget, "utf8"), "created");
});

test("lock publication is complete and an old empty lock is recovered", async (t) => {
  const { maintenance } = await fixture(t);
  const lockPath = path.join(maintenance, ".system", "audit.lock");
  await fs.writeFile(lockPath, "");
  const old = new Date(Date.now() - 60_000);
  await fs.utimes(lockPath, old, old);

  const result = await withAuditLock(
    maintenance,
    async () => {
      const lock = JSON.parse(await fs.readFile(lockPath, "utf8"));
      assert.equal(lock.pid, process.pid);
      assert.match(lock.token, /^[0-9a-f]{24}$/);
      return "done";
    },
    { malformedLockGraceMs: 0 },
  );
  assert.equal(result, "done");
  await assert.rejects(fs.access(lockPath));
  const recovery = await fs.readdir(path.join(maintenance, ".system", "recovery"));
  assert.ok(recovery.some((name) => name.startsWith("malformed-lock-")));
});

test("semantic policy fingerprint ignores evaluator bytes and JSON formatting", async (t) => {
  const { root, maintenance, rules } = await fixture(t);
  const first = await computePolicyFingerprint(root, maintenance);

  await write(root, "maintenance/.system/core.mjs", "// different evaluator bytes\n");
  const evaluatorChanged = await computePolicyFingerprint(root, maintenance);
  assert.equal(evaluatorChanged.policy_sha256, first.policy_sha256);

  const rulesWithNoise = { ...rules, evaluator_files: ["a.mjs", "b.mjs"] };
  await write(root, "maintenance/.system/rules.json", JSON.stringify(rulesWithNoise));
  const formatted = await computePolicyFingerprint(root, maintenance);
  assert.equal(formatted.policy_sha256, first.policy_sha256);

  await write(root, "maintenance/.system/rules.json", JSON.stringify({
    ...rulesWithNoise,
    memory_roots: [...rulesWithNoise.memory_roots].reverse(),
    allowed_write_roots: [...rulesWithNoise.allowed_write_roots].reverse(),
    excluded_names: [...rulesWithNoise.excluded_names].reverse(),
  }));
  const reordered = await computePolicyFingerprint(root, maintenance);
  assert.equal(reordered.policy_sha256, first.policy_sha256);

  await write(
    root,
    "maintenance/.system/rules.json",
    JSON.stringify({ ...rulesWithNoise, policy_version: "5.1" }),
  );
  const policyChanged = await computePolicyFingerprint(root, maintenance);
  assert.notEqual(policyChanged.policy_sha256, first.policy_sha256);
  assert.equal(policyChanged.config_sha256, first.config_sha256);

  await write(root, "maintenance/.system/rules.json", JSON.stringify(rulesWithNoise));
  await write(root, "AGENTS.md", "# Changed policy\n");
  const agentsChanged = await computePolicyFingerprint(root, maintenance);
  assert.notEqual(agentsChanged.policy_sha256, first.policy_sha256);
});

test("global scan builds a valid baseline and detects changed files", async (t) => {
  const { root, maintenance } = await fixture(t);
  const baseline = await makeBaseline(root, maintenance);
  assert.deepEqual(validateBaselineShape(baseline), []);
  assert.ok(baseline.files.some((entry) => entry.path === "fact/events/alpha.md"));
  assert.ok(
    baseline.files.find((entry) => entry.path === "fact/events/alpha.md").links
      .includes("people/shared.md"),
  );
  const missingLinks = structuredClone(baseline);
  delete missingLinks.files[0].links;
  assert.ok(validateBaselineShape(missingLinks).some((error) => error.includes("links must be an array")));

  await write(root, "fact/events/alpha.md", "# Alpha changed\n");
  const current = await scanWorkspace(root, maintenance);
  const changes = compareBaseline(baseline, current.files);
  assert.deepEqual(
    changes.map((entry) => [entry.path, entry.change]),
    [["fact/events/alpha.md", "modified"]],
  );
});

test("selected scan accepts multiple targets and records dependency reasons per target", async (t) => {
  const { root, maintenance } = await fixture(t);
  const baseline = await makeBaseline(root, maintenance);
  const selected = await scanSelectedScope(
    root,
    maintenance,
    baseline,
    ["fact/events/beta.md", "fact/events/alpha.md", "fact/events/alpha.md"],
  );

  assert.deepEqual(
    selected.scope.target_paths,
    ["fact/events/alpha.md", "fact/events/beta.md"],
  );
  const dependencies = new Map(selected.scope.dependencies.map((entry) => [entry.path, entry]));
  assert.ok(dependencies.has("feeling/by_event/alpha.md"));
  assert.ok(dependencies.has("feeling/by_event/beta.md"));
  assert.deepEqual(dependencies.get("fact/index.md").for_targets, selected.scope.target_paths);
  assert.deepEqual(dependencies.get("feeling/index.md").for_targets, selected.scope.target_paths);

  const person = dependencies.get("people/shared.md");
  assert.deepEqual(person.for_targets, selected.scope.target_paths);
  assert.ok(person.reasons.includes("linked_from:fact/events/alpha.md"));
  assert.ok(person.reasons.includes("linked_from:feeling/by_event/alpha.md"));
  assert.ok(person.reasons.includes("linked_from:fact/events/beta.md"));

  const peopleIndex = dependencies.get("summary/people.md");
  assert.deepEqual(peopleIndex.reasons, ["people_index"]);
  assert.deepEqual(peopleIndex.for_targets, selected.scope.target_paths);
  assert.ok(!selected.scope.required_paths.includes("inbox/second-hop.md"));
  assert.ok(!selected.scope.required_paths.includes("session/unrelated.md"));
});

test("a person target includes its index and follows only its own direct links", async (t) => {
  const { root, maintenance } = await fixture(t);
  const baseline = await makeBaseline(root, maintenance);
  const selected = await scanSelectedScope(root, maintenance, baseline, "people/shared.md");
  assert.ok(selected.scope.dependency_paths.includes("summary/people.md"));
  assert.ok(selected.scope.dependency_paths.includes("inbox/second-hop.md"));
  assert.ok(!selected.scope.dependency_paths.includes("session/unrelated.md"));
});

test("selected content overrides support user-authored alternatives without disk writes", async (t) => {
  const { root, maintenance, contents } = await fixture(t);
  const baseline = await makeBaseline(root, maintenance);
  const edited = "# Alpha edited\n";
  const selected = await scanSelectedScope(
    root,
    maintenance,
    baseline,
    "fact/events/alpha.md",
    { contentOverrides: new Map([["fact/events/alpha.md", edited]]) },
  );
  const target = selected.files.find((entry) => entry.path === "fact/events/alpha.md");
  assert.equal(target.sha256, sha256(Buffer.from(edited, "utf8")));
  assert.equal(await read(root, "fact/events/alpha.md"), contents.alpha);
  assert.ok(selected.scope.dependency_paths.includes("people/shared.md"));
  const review = compareSelectedReviews(baseline, selected)
    .find((entry) => entry.path === "fact/events/alpha.md");
  assert.equal(review.change, "modified");
  assert.equal(review.needs_review, true);
  await assert.rejects(
    scanSelectedScope(root, maintenance, baseline, "fact/events/alpha.md", {
      contentOverrides: new Map([["fact/events/beta.md", contents.beta]]),
    }),
    /not a selected target/,
  );
});

test("combined overrides discover links and merge their reasons across targets", async (t) => {
  const { root, maintenance, contents } = await fixture(t);
  const baseline = await makeBaseline(root, maintenance);
  const alpha = `${contents.alpha}\n[inbox](../../inbox/second-hop.md)\n`;
  const beta = `${contents.beta}\ninbox/second-hop.md\n`;
  const selected = await scanSelectedScope(
    root,
    maintenance,
    baseline,
    ["fact/events/alpha.md", "fact/events/beta.md"],
    {
      contentOverrides: new Map([
        ["fact/events/alpha.md", alpha],
        ["fact/events/beta.md", beta],
      ]),
    },
  );
  const dependency = selected.scope.dependencies
    .find((entry) => entry.path === "inbox/second-hop.md");
  assert.deepEqual(dependency.for_targets, ["fact/events/alpha.md", "fact/events/beta.md"]);
  assert.ok(dependency.reasons.includes("linked_from:fact/events/alpha.md"));
  assert.ok(dependency.reasons.includes("linked_from:fact/events/beta.md"));
});

test("a newly referenced missing dependency is explicit in per-file review", async (t) => {
  const { root, maintenance } = await fixture(t);
  const baseline = await makeBaseline(root, maintenance);
  const selected = await scanSelectedScope(
    root,
    maintenance,
    baseline,
    "fact/events/alpha.md",
    { contentOverrides: new Map([["fact/events/alpha.md", "people/missing.md\n"]]) },
  );
  const review = compareSelectedReviews(baseline, selected)
    .find((entry) => entry.path === "people/missing.md");
  assert.equal(review.change, "missing_dependency");
  assert.equal(review.needs_review, true);
});

test("deleted selected target is represented as a tombstone and keeps baseline links", async (t) => {
  const { root, maintenance } = await fixture(t);
  const baseline = await makeBaseline(root, maintenance);
  await fs.rm(path.join(root, "fact", "events", "alpha.md"));

  const selected = await scanSelectedScope(root, maintenance, baseline, "fact/events/alpha.md");
  const target = selected.files.find((entry) => entry.path === "fact/events/alpha.md");
  assert.equal(target.exists, false);
  assert.equal(target.tombstone, true);
  assert.equal(target.sha256, null);
  assert.ok(selected.scope.dependency_paths.includes("people/shared.md"));
  assert.ok(selected.scope.dependency_paths.includes("summary/people.md"));

  const review = compareSelectedReviews(baseline, selected)
    .find((entry) => entry.path === "fact/events/alpha.md");
  assert.equal(review.change, "deleted");
  assert.equal(review.needs_review, true);
});

test("per-file review marks an explicit unchanged target but not unchanged dependencies", async (t) => {
  const { root, maintenance } = await fixture(t);
  const baseline = await makeBaseline(root, maintenance);
  const selected = await scanSelectedScope(root, maintenance, baseline, "fact/events/alpha.md");
  const reviews = compareSelectedReviews(baseline, selected);
  assert.equal(reviews.find((entry) => entry.path === "fact/events/alpha.md").needs_review, true);
  assert.equal(reviews.find((entry) => entry.path === "fact/index.md").needs_review, false);

  const record = baseline.files.find((entry) => entry.path === "fact/events/alpha.md");
  assert.deepEqual(compareFileReview(record, record), {
    path: "fact/events/alpha.md",
    change: "unchanged",
    before_sha256: record.sha256,
    after_sha256: record.sha256,
    before_bytes: record.bytes,
    after_bytes: record.bytes,
    tombstone: false,
    needs_review: false,
  });
  assert.equal(compareFileReview(record, record, { explicit: true }).needs_review, true);
});

test("text preview emits exact before and after hunks", () => {
  const preview = buildTextPreview("head\nold\ntail", "head\nnew\ntail", { contextLines: 1 });
  assert.equal(preview.kind, "line_diff");
  assert.equal(preview.hunks.length, 1);
  assert.equal(preview.hunks[0].before, "head\nold\ntail");
  assert.equal(preview.hunks[0].after, "head\nnew\ntail");
  assert.deepEqual(
    buildTextPreview("same", "same"),
    { kind: "line_diff", context_lines: 1, hunks: [] },
  );
  const lineEndings = buildTextPreview("a\r\nb\r\n", "a\nb\n");
  assert.equal(lineEndings.before_line_endings, "CRLF");
  assert.equal(lineEndings.after_line_endings, "LF");
  assert.equal(lineEndings.hunks[0].notation, "escaped_line_endings");
  assert.ok(lineEndings.hunks[0].before.includes("\\r\\n"));
});

test("proposal v5 binds exact operation payloads without a presentation hash", () => {
  const operation = replaceOperation({
    id: "O1",
    path: "fact/events/alpha.md",
    before: "old",
    after: "new",
  });
  const proposal = proposalFor([operation]);
  assert.deepEqual(validateProposalShape(proposal), []);
  assert.equal(Object.hasOwn(proposal, "presentation_sha256"), false);

  const approved = sealOperation({ ...operation, decision: "approved" });
  assert.equal(approved.operation_sha256, operation.operation_sha256);
  const changed = replaceOperation({
    id: "O1",
    path: "fact/events/alpha.md",
    before: "old",
    after: "different",
  });
  assert.notEqual(operationHash(changed), operation.operation_sha256);

  const tampered = structuredClone(proposal);
  tampered.operations[0].new_content = "tampered";
  const tamperErrors = validateProposalShape(tampered);
  assert.ok(tamperErrors.some((error) => error.includes("operation hash mismatch")));
  assert.ok(tamperErrors.some((error) => error.includes("payload hash mismatch")));

  const presentationBound = structuredClone(proposal);
  presentationBound.presentation_sha256 = "c".repeat(64);
  assert.ok(
    validateProposalShape(presentationBound)
      .some((error) => error.includes("must not bind a presentation hash")),
  );

  const normalized = replaceOperation({
    id: "O3",
    path: "fact\\events\\alpha.md",
    before: "old",
    after: "new",
  });
  assert.equal(normalized.path, "fact/events/alpha.md");

  const malformed = structuredClone(proposal);
  malformed.operations = [null];
  assert.doesNotThrow(() => validateProposalShape(malformed));
  assert.ok(validateProposalShape(malformed).some((error) => error.includes("must be an object")));

  const malformedScope = structuredClone(proposal);
  malformedScope.audit_scope = { kind: "selected" };
  assert.ok(
    validateProposalShape(malformedScope)
      .some((error) => error.includes("audit_scope.target_paths must be an array")),
  );

  const emptyBinding = structuredClone(proposal);
  emptyBinding.based_on_root_hash = "";
  assert.ok(
    validateProposalShape(emptyBinding)
      .some((error) => error.includes("based_on_root_hash")),
  );

  const overlap = proposalFor([
    operation,
    replaceOperation({
      id: "O2",
      path: "fact/events/alpha.md",
      before: "old",
      after: "another",
    }),
  ]);
  assert.ok(
    validateProposalShape(overlap)
      .some((error) => error.includes("overlapping operations")),
  );
});

test("proposal renderer starts with a full index and defaults to suggested details", () => {
  const first = replaceOperation({
    id: "O1",
    path: "fact/events/alpha.md",
    before: "alpha\nold\nomega",
    after: "alpha\nnew\nomega",
  });
  const second = replaceOperation({
    id: "O2",
    path: "fact/events/beta.md",
    before: "beta old",
    after: "beta new",
    suggested: false,
    decision: "rejected",
  });
  const proposal = proposalFor([first, second]);

  const rendered = renderProposal(proposal);
  assert.ok(rendered.indexOf("| ---") < rendered.indexOf("<details"));
  assert.ok(rendered.includes("| O2 | replace_file | `fact/events/beta.md`"));
  assert.equal(count(rendered, "<details"), 1);
  assert.ok(rendered.includes("<summary>O1"));
  assert.ok(!rendered.includes("<summary>O2"));
  assert.ok(rendered.includes("alpha\nold\nomega"));
  assert.ok(rendered.includes("alpha\nnew\nomega"));

  const all = renderProposal(proposal, { all: true });
  assert.equal(count(all, "<details"), 2);
  const operationOnly = renderProposal(proposal, { operation: "O2" });
  assert.equal(count(operationOnly, "<details"), 1);
  assert.ok(operationOnly.includes("<summary>O2"));
  assert.ok(!operationOnly.includes("fact/events/alpha.md"));
  const pathOnly = renderProposal(proposal, { path: "fact/events/beta.md" });
  assert.ok(pathOnly.includes("<summary>O2"));
  const windowsPath = renderProposal(proposal, { path: "fact\\events\\beta.md" });
  assert.ok(windowsPath.includes("<summary>O2"));
  const pendingOnly = renderProposal(proposal, { pending: true });
  assert.ok(pendingOnly.includes("<summary>O1"));
  assert.ok(!pendingOnly.includes("<summary>O2"));
  const flat = renderProposal(proposal, { operation: "O1", collapse: false });
  assert.ok(flat.includes("### O1"));
  assert.ok(!flat.includes("<details"));
  const expanded = renderProposal(proposal, { operation: "O1", expanded: true });
  assert.ok(expanded.includes("<details open>"));
});

test("renderer distinguishes empty files and chooses a safe dynamic fence", () => {
  const common = {
    reason: "Exact file state matters.",
    effect: "The requested file state is produced.",
    preserves: "No other path changes.",
    risk: "Review file existence as well as text.",
    recommendation: "Apply after approval.",
    suggested: true,
    decision: "pending",
  };
  const create = sealOperation({
    ...common,
    operation_id: "O1",
    type: "create_file",
    path: "fact/events/empty-created.md",
    precondition_sha256: null,
    expected_after_sha256: sha256(Buffer.from("", "utf8")),
    new_content: "",
  });
  const remove = sealOperation({
    ...common,
    operation_id: "O2",
    type: "delete_file",
    path: "fact/events/empty-deleted.md",
    before_content: "",
    precondition_sha256: sha256(Buffer.from("", "utf8")),
    expected_after_sha256: null,
  });
  const emptyRendered = renderProposal(proposalFor([create, remove]));
  assert.ok(emptyRendered.includes("（空文件）"));
  assert.ok(emptyRendered.includes("（文件不存在）"));

  const fencedOperation = replaceOperation({
    id: "O3",
    path: "fact/events/fenced.md",
    before: "before ````` marker",
    after: "after ````` marker",
  });
  const fencedRendered = renderProposal(proposalFor([fencedOperation]));
  assert.ok(fencedRendered.includes("``````text"));
});

test("same-path exact-block operations validate and render as independent precise suggestions", () => {
  const before = "first old\nmiddle\nsecond old";
  const first = exactOperation({
    id: "O1",
    path: "fact/events/alpha.md",
    before,
    oldText: "first old",
    newText: "first new",
  });
  const second = exactOperation({
    id: "O2",
    path: "fact/events/alpha.md",
    before,
    oldText: "second old",
    newText: "second new",
  });
  const proposal = proposalFor([first, second]);
  assert.deepEqual(validateProposalShape(proposal), []);
  const rendered = renderProposal(proposal);
  assert.equal(count(rendered, "<details"), 2);
  assert.ok(rendered.includes("first old"));
  assert.ok(rendered.includes("first new"));
  assert.ok(rendered.includes("second old"));
  assert.ok(rendered.includes("second new"));
});

test("proposal preconditions validate exact source bytes and allowed paths", async (t) => {
  const { root, maintenance, rules, contents } = await fixture(t);
  const operation = replaceOperation({
    id: "O1",
    path: "fact/events/alpha.md",
    before: contents.alpha,
    after: `${contents.alpha}\nextra\n`,
  });
  assert.deepEqual(
    await verifyProposalPreconditions(root, rules, { operations: [operation] }),
    [],
  );

  await write(root, "fact/events/alpha.md", "# Drifted\n");
  assert.ok(
    (await verifyProposalPreconditions(root, rules, { operations: [operation] }))
      .some((error) => error.includes("source state drift")),
  );

  const disallowed = replaceOperation({
    id: "O2",
    path: "maintenance/README.md",
    before: "before",
    after: "after",
  });
  assert.ok(
    (await verifyProposalPreconditions(root, rules, { operations: [disallowed] }))
      .some((error) => error.includes("disallowed path")),
  );
  assert.deepEqual(
    validateRunShape({
      schema_version: RUN_SCHEMA,
      status: "auditing",
      run_id: "R-TEST",
      next_action: { type: "review" },
    }),
    [],
  );
  assert.equal(maintenance.endsWith("maintenance"), true);
});

test("link extraction handles inline, reference, and repository-root paths", () => {
  const links = extractLinkedPaths(
    "fact/events/a.md",
    [
      "[person](../../people/a.md#section)",
      "[ref]: ../../summary/current.md",
      "feeling/by_event/a.md",
      "[web](https://example.com/x)",
    ].join("\n"),
  );
  assert.deepEqual(
    links,
    ["feeling/by_event/a.md", "people/a.md", "summary/current.md"],
  );
});
