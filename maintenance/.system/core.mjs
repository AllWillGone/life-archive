import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export const BASELINE_SCHEMA = 5;
export const RUN_SCHEMA = 5;
export const PROPOSAL_SCHEMA = 5;
export const RUN_STATUSES = new Set(["auditing", "awaiting_decision", "applying"]);
export const OPERATION_TYPES = new Set([
  "replace_exact_block",
  "replace_file",
  "create_file",
  "delete_file",
  "move_file",
]);

const DECISIONS = new Set(["pending", "approved", "rejected", "deferred", "applied", "failed"]);
const HEX_SHA256 = /^[0-9a-f]{64}$/;

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function ordinalCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort(ordinalCompare)
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function canonicalHash(value) {
  return sha256(Buffer.from(canonicalJson(value), "utf8"));
}

export function serializeJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function serializedJsonHash(value) {
  return sha256(Buffer.from(serializeJson(value), "utf8"));
}

export function normalizeRelative(value, label = "path") {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is empty`);
  const normalized = value.replaceAll("\\", "/");
  if (
    normalized.startsWith("/")
    || /^[A-Za-z]:/.test(normalized)
    || normalized.includes("\0")
    || normalized.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`${label} is not a safe repository-relative path: ${value}`);
  }
  return normalized;
}

export function resolveInside(root, relative, label = "path") {
  const safe = normalizeRelative(relative, label);
  const resolvedRoot = path.resolve(root);
  const absolute = path.resolve(resolvedRoot, ...safe.split("/"));
  const prefix = `${resolvedRoot}${path.sep}`;
  if (absolute !== resolvedRoot && !absolute.startsWith(prefix)) {
    throw new Error(`${label} escapes the repository root: ${relative}`);
  }
  return { relative: safe, absolute };
}

export async function pathExists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

export async function assertNoSymlink(root, relative, { allowMissingLeaf = false } = {}) {
  const safe = normalizeRelative(relative);
  let cursor = path.resolve(root);
  const parts = safe.split("/");
  for (let index = 0; index < parts.length; index += 1) {
    cursor = path.join(cursor, parts[index]);
    try {
      const stat = await fs.lstat(cursor);
      if (stat.isSymbolicLink()) throw new Error(`symbolic links are not allowed: ${safe}`);
    } catch (error) {
      if (allowMissingLeaf && error.code === "ENOENT") return;
      throw error;
    }
  }
}

export async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function atomicWrite(filePath, content, { backup = false } = {}) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const token = `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const temporary = `${filePath}.tmp-${token}`;
  const previous = `${filePath}.previous`;
  await fs.writeFile(temporary, content);
  try {
    if (await pathExists(filePath)) {
      const stat = await fs.lstat(filePath);
      if (stat.isSymbolicLink()) throw new Error(`refusing to replace symbolic link: ${filePath}`);
      if (backup) await fs.copyFile(filePath, previous);
    }
    await fs.rename(temporary, filePath);
  } catch (error) {
    await fs.rm(temporary, { force: true });
    throw error;
  }
}

export async function atomicWriteJson(filePath, value, options) {
  await atomicWrite(filePath, serializeJson(value), options);
}

export async function atomicCreate(filePath, content) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const token = `${process.pid}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const temporary = `${filePath}.tmp-create-${token}`;
  await fs.writeFile(temporary, content, { flag: "wx" });
  try {
    await fs.link(temporary, filePath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function processIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    if (error.code === "EPERM") return true;
    throw error;
  }
}

async function archiveStaleLock(maintenanceDir, lockPath, label, token = "unknown") {
  const recoveryDir = path.join(maintenanceDir, ".system", "recovery");
  await fs.mkdir(recoveryDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[^0-9A-Za-z]/g, "");
  const archive = path.join(recoveryDir, `${label}-${stamp}-${String(token).replace(/[^0-9A-Za-z]/g, "") || "unknown"}.json`);
  try {
    await fs.rename(lockPath, archive);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

export async function withAuditLock(
  maintenanceDir,
  callback,
  { malformedLockGraceMs = 30_000 } = {},
) {
  const lockPath = path.join(maintenanceDir, ".system", "audit.lock");
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  const token = crypto.randomBytes(12).toString("hex");
  const record = { pid: process.pid, token, created_at: new Date().toISOString() };

  let acquired = false;
  for (let attempt = 0; attempt < 4 && !acquired; attempt += 1) {
    try {
      // Publish a complete lock record in one create-only step.
      await atomicCreate(lockPath, `${JSON.stringify(record)}\n`);
      acquired = true;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      const stat = await fs.lstat(lockPath).catch(() => null);
      const raw = await fs.readFile(lockPath, "utf8").catch(() => "");
      let existing = null;
      try { existing = JSON.parse(raw); } catch {}
      if (existing && processIsAlive(existing.pid)) {
        throw new Error(`audit lock is held by live process ${existing.pid}`);
      }
      if (!existing && stat && Date.now() - stat.mtimeMs < malformedLockGraceMs) {
        throw new Error("audit lock is incomplete and still within its recovery grace period");
      }
      await archiveStaleLock(
        maintenanceDir,
        lockPath,
        existing ? "stale-lock" : "malformed-lock",
        existing?.token,
      );
    }
  }
  if (!acquired) throw new Error(`could not acquire audit lock: ${lockPath}`);

  try {
    return await callback();
  } finally {
    let current = null;
    try { current = JSON.parse(await fs.readFile(lockPath, "utf8")); } catch {}
    if (current?.token === token) await fs.rm(lockPath, { force: true });
  }
}

export async function loadRules(maintenanceDir) {
  const rulesPath = path.join(maintenanceDir, ".system", "rules.json");
  const raw = await fs.readFile(rulesPath);
  const rules = JSON.parse(raw.toString("utf8"));
  if (rules.schema_version !== 1 || rules.protocol !== "maintenance-5") {
    throw new Error("unsupported maintenance rules file");
  }
  return { rules, raw, rulesPath };
}

export function semanticRulesConfig(rules) {
  const config = {
    system_files: rules.system_files ?? [],
    memory_roots: rules.memory_roots ?? [],
    allowed_write_roots: rules.allowed_write_roots ?? [],
    allowed_write_files: rules.allowed_write_files ?? [],
    excluded_names: rules.excluded_names ?? [],
    derived_paths: rules.derived_paths ?? [],
  };
  for (const field of Object.keys(config)) {
    if (!Array.isArray(config[field])) continue;
    const unique = new Map(config[field].map((entry) => [canonicalJson(entry), canonicalize(entry)]));
    config[field] = [...unique.entries()]
      .sort(([left], [right]) => ordinalCompare(left, right))
      .map(([, entry]) => entry);
  }
  return config;
}

export async function computePolicyFingerprint(repoRoot, maintenanceDir) {
  const { rules } = await loadRules(maintenanceDir);
  const agentsRaw = await fs.readFile(path.join(repoRoot, "AGENTS.md"));
  const semanticConfig = semanticRulesConfig(rules);
  const configSha256 = canonicalHash(semanticConfig);
  const agentsSha256 = sha256(agentsRaw);
  const policySha256 = canonicalHash({
    policy_version: rules.policy_version,
    config_sha256: configSha256,
    agents_sha256: agentsSha256,
  });
  return {
    rules,
    semantic_config: semanticConfig,
    policy_sha256: policySha256,
    config_sha256: configSha256,
    agents_sha256: agentsSha256,
  };
}

// Transitional name for callers moving from maintenance-4. It deliberately
// excludes evaluator source from the semantic fingerprint.
export async function computeRulesHash(repoRoot, maintenanceDir) {
  const fingerprint = await computePolicyFingerprint(repoRoot, maintenanceDir);
  return {
    ...fingerprint,
    rules_sha256: fingerprint.policy_sha256,
    rules_config_sha256: fingerprint.config_sha256,
  };
}

function classifyRole(relative, configuredRole = "memory") {
  if (relative === "AGENTS.md") return "system_rules";
  if (relative === "README.md") return "system_readme";
  if (relative === "CHANGELOG.md") return "system_changelog";
  if (relative === "fact/index.md") return "fact_index";
  if (relative.startsWith("fact/events/")) return "fact_event";
  if (relative === "feeling/index.md") return "feeling_index";
  if (relative.startsWith("feeling/by_event/")) return "feeling_event";
  if (relative === "summary/current.md") return "summary_current";
  return configuredRole;
}

function configuredRole(rules, relative) {
  if ((rules.system_files ?? []).includes(relative)) return classifyRole(relative, "system");
  const root = (rules.memory_roots ?? []).find(
    (entry) => relative === entry.path || relative.startsWith(`${entry.path}/`),
  );
  return classifyRole(relative, root?.role ?? "memory");
}

function auditPathAllowed(rules, relative) {
  if ((rules.system_files ?? []).includes(relative)) return true;
  return (rules.memory_roots ?? []).some(
    (entry) => relative === entry.path || relative.startsWith(`${entry.path}/`),
  );
}

export function extractLinkedPaths(relative, content) {
  const output = new Set();
  const addTarget = (rawValue) => {
    let target = String(rawValue ?? "").trim();
    if (target.startsWith("<") && target.includes(">")) target = target.slice(1, target.indexOf(">"));
    else target = target.split(/\s+(?=["'(])/u, 1)[0];
    target = target.split("#", 1)[0].trim();
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) return;
    try { target = decodeURIComponent(target); } catch {}
    const joined = path.posix.normalize(path.posix.join(path.posix.dirname(relative), target));
    try { output.add(normalizeRelative(joined)); } catch {}
  };

  const text = String(content ?? "");
  const inline = /!?\[[^\]\r\n]*\]\(\s*(<[^>\r\n]+>|[^)\s]+)(?:\s+["'(][^)\r\n]*)?\)/g;
  for (const match of text.matchAll(inline)) addTarget(match[1]);
  const references = /^\s{0,3}\[[^\]\r\n]+\]:\s*(<[^>\r\n]+>|[^\s]+)/gm;
  for (const match of text.matchAll(references)) addTarget(match[1]);
  const bare = /(?:^|[\s`"'(（])((?:fact|feeling|people|summary|session|inbox)\/[^\s`"'()（）,，;；]+\.md)(?=$|[\s`"')）,，;；])/gm;
  for (const match of text.matchAll(bare)) {
    try { output.add(normalizeRelative(match[1])); } catch {}
  }
  return [...output].sort(ordinalCompare);
}

function fileRecord(relative, role, raw) {
  const content = raw.toString("utf8");
  return {
    path: relative,
    role,
    sha256: sha256(raw),
    bytes: raw.byteLength,
    links: extractLinkedPaths(relative, content),
  };
}

async function scanDirectory(repoRoot, rootRelative, configured, excludedNames, output) {
  const { absolute } = resolveInside(repoRoot, rootRelative, "memory root");
  if (!(await pathExists(absolute))) return;
  const rootStat = await fs.lstat(absolute);
  if (rootStat.isSymbolicLink()) throw new Error(`symbolic memory root is not allowed: ${rootRelative}`);

  async function visit(directory, relativeDirectory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => ordinalCompare(left.name, right.name));
    for (const entry of entries) {
      if (excludedNames.has(entry.name)) continue;
      const relative = `${relativeDirectory}/${entry.name}`.replace(/^\//, "").replaceAll("\\", "/");
      const absoluteEntry = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`symbolic links are not allowed in audit scope: ${relative}`);
      if (entry.isDirectory()) await visit(absoluteEntry, relative);
      else if (entry.isFile()) {
        output.push(fileRecord(normalizeRelative(relative), classifyRole(relative, configured), await fs.readFile(absoluteEntry)));
      }
    }
  }

  await visit(absolute, rootRelative.replaceAll("\\", "/"));
}

export function manifestRoot(files) {
  const payload = [...files]
    .sort((left, right) => ordinalCompare(left.path, right.path))
    .map((record) => `${record.path}\0${record.sha256 ?? "<absent>"}`)
    .join("\n");
  return sha256(Buffer.from(payload, "utf8"));
}

function assertUniquePaths(files, label) {
  const seen = new Set();
  const caseFolded = new Map();
  for (const file of files) {
    if (seen.has(file.path)) throw new Error(`${label} repeats path ${file.path}`);
    seen.add(file.path);
    const folded = file.path.toLowerCase();
    if (caseFolded.has(folded) && caseFolded.get(folded) !== file.path) {
      throw new Error(`case-colliding ${label} paths: ${caseFolded.get(folded)} and ${file.path}`);
    }
    caseFolded.set(folded, file.path);
  }
}

export async function scanWorkspace(repoRoot, maintenanceDir) {
  const policy = await computePolicyFingerprint(repoRoot, maintenanceDir);
  const files = [];
  const excludedNames = new Set(policy.rules.excluded_names ?? []);
  for (const systemFile of policy.rules.system_files ?? []) {
    const { relative, absolute } = resolveInside(repoRoot, systemFile, "system file");
    await assertNoSymlink(repoRoot, relative);
    files.push(fileRecord(relative, classifyRole(relative, "system"), await fs.readFile(absolute)));
  }
  for (const entry of policy.rules.memory_roots ?? []) {
    await scanDirectory(
      repoRoot,
      normalizeRelative(entry.path, "memory root"),
      entry.role,
      excludedNames,
      files,
    );
  }
  files.sort((left, right) => ordinalCompare(left.path, right.path));
  assertUniquePaths(files, "audit scope");
  return {
    files,
    root_hash: manifestRoot(files),
    policy_sha256: policy.policy_sha256,
    config_sha256: policy.config_sha256,
    agents_sha256: policy.agents_sha256,
    rules: policy.rules,
  };
}

function eventPairFor(relative) {
  if (relative.startsWith("fact/events/")) {
    return `feeling/by_event/${relative.slice("fact/events/".length)}`;
  }
  if (relative.startsWith("feeling/by_event/")) {
    return `fact/events/${relative.slice("feeling/by_event/".length)}`;
  }
  return null;
}

function baselineByPath(baseline) {
  return new Map((baseline?.files ?? []).map((record) => [record.path, record]));
}

async function readObservedPath(repoRoot, rules, relative) {
  const role = configuredRole(rules, relative);
  const { absolute } = resolveInside(repoRoot, relative);
  if (!(await pathExists(absolute))) {
    await assertNoSymlink(repoRoot, relative, { allowMissingLeaf: true });
    return {
      record: { path: relative, role, sha256: null, bytes: null, links: [], exists: false, tombstone: true },
      content: null,
    };
  }
  await assertNoSymlink(repoRoot, relative);
  const stat = await fs.lstat(absolute);
  if (!stat.isFile()) throw new Error(`selected audit path is not a file: ${relative}`);
  const raw = await fs.readFile(absolute);
  return {
    record: { ...fileRecord(relative, role, raw), exists: true, tombstone: false },
    content: raw.toString("utf8"),
  };
}

async function observePath(repoRoot, rules, relative, overrides) {
  const actual = await readObservedPath(repoRoot, rules, relative);
  if (!overrides?.has(relative)) {
    return { ...actual, dependency_links: actual.record.links ?? [] };
  }

  const role = configuredRole(rules, relative);
  const content = overrides.get(relative);
  const prospective = content === null
    ? { path: relative, role, sha256: null, bytes: null, links: [], exists: false, tombstone: true }
    : {
      ...fileRecord(relative, role, Buffer.from(String(content), "utf8")),
      exists: true,
      tombstone: false,
    };
  return {
    record: prospective,
    content: content === null ? null : String(content),
    dependency_links: [...new Set([
      ...(actual.record.links ?? []),
      ...(prospective.links ?? []),
    ])].sort(ordinalCompare),
  };
}

export async function scanSelectedScope(
  repoRoot,
  maintenanceDir,
  baseline,
  targetValues,
  { contentOverrides = null } = {},
) {
  const policy = await computePolicyFingerprint(repoRoot, maintenanceDir);
  const requested = Array.isArray(targetValues) ? targetValues : [targetValues];
  const targetPaths = [...new Set(requested.map((value) => normalizeRelative(value, "selected target")))]
    .sort(ordinalCompare);
  if (!targetPaths.length) throw new Error("selected audit needs at least one target");
  for (const relative of targetPaths) {
    if (!auditPathAllowed(policy.rules, relative)) throw new Error(`selected target is outside the audit scope: ${relative}`);
  }

  const targetSet = new Set(targetPaths);
  let overrides = null;
  if (contentOverrides !== null && contentOverrides !== undefined) {
    if (typeof contentOverrides.entries !== "function") {
      throw new Error("contentOverrides must be a Map of selected target paths");
    }
    overrides = new Map();
    for (const [pathValue, content] of contentOverrides.entries()) {
      const relative = normalizeRelative(pathValue, "content override path");
      if (!targetSet.has(relative)) throw new Error(`content override is not a selected target: ${relative}`);
      if (content !== null && typeof content !== "string") {
        throw new Error(`content override must be text or null: ${relative}`);
      }
      overrides.set(relative, content);
    }
  }

  const prior = baselineByPath(baseline);
  const observed = new Map();
  const dependencyLinks = new Map();
  const ensureObserved = async (relative) => {
    if (!observed.has(relative)) {
      const result = await observePath(repoRoot, policy.rules, relative, overrides);
      observed.set(relative, result.record);
      dependencyLinks.set(relative, result.dependency_links ?? []);
    }
    return observed.get(relative);
  };

  for (const relative of targetPaths) {
    const record = await ensureObserved(relative);
    if (!record.exists && !prior.has(relative)) {
      throw new Error(`selected target does not exist and has no baseline tombstone source: ${relative}`);
    }
  }

  const dependencyMap = new Map();
  const addDependency = (relativeValue, reason, forTarget) => {
    let relative;
    try { relative = normalizeRelative(relativeValue, "selected dependency"); } catch { return; }
    if (!auditPathAllowed(policy.rules, relative) || targetSet.has(relative)) return;
    const current = dependencyMap.get(relative) ?? {
      path: relative,
      reasons: new Set(),
      for_targets: new Set(),
    };
    current.reasons.add(reason);
    current.for_targets.add(forTarget);
    dependencyMap.set(relative, current);
  };
  const linksFor = (relative) => {
    return [...new Set([
      ...(dependencyLinks.get(relative) ?? []),
      ...(prior.get(relative)?.links ?? []),
    ])].sort(ordinalCompare);
  };
  const addLinks = (source, forTarget) => {
    for (const linked of linksFor(source)) addDependency(linked, `linked_from:${source}`, forTarget);
  };

  for (const target of targetPaths) {
    addLinks(target, target);
    const pair = eventPairFor(target);
    if (pair) {
      addDependency(pair, "event_pair", target);
      await ensureObserved(pair);
      addLinks(pair, target);
      addDependency("fact/index.md", "fact_index", target);
      addDependency("feeling/index.md", "feeling_index", target);
    }
    if (target.startsWith("people/")) addDependency("summary/people.md", "people_index", target);
  }

  // A person card reached through an event link still needs its routing index,
  // but links from that card are intentionally not followed (one-hop scope).
  for (const dependency of [...dependencyMap.values()]) {
    if (!dependency.path.startsWith("people/")) continue;
    for (const forTarget of dependency.for_targets) {
      addDependency("summary/people.md", "people_index", forTarget);
    }
  }

  const dependencies = [...dependencyMap.values()]
    .map((entry) => ({
      path: entry.path,
      reasons: [...entry.reasons].sort(ordinalCompare),
      for_targets: [...entry.for_targets].sort(ordinalCompare),
    }))
    .sort((left, right) => ordinalCompare(left.path, right.path));
  for (const dependency of dependencies) await ensureObserved(dependency.path);

  const requiredPaths = [...new Set([...targetPaths, ...dependencies.map((entry) => entry.path)])]
    .sort(ordinalCompare);
  const files = requiredPaths.map((relative) => observed.get(relative));
  assertUniquePaths(files, "selected audit");
  const scope = {
    kind: "selected",
    target_paths: targetPaths,
    dependency_paths: dependencies.map((entry) => entry.path),
    required_paths: requiredPaths,
    dependencies,
    global_completion: false,
  };
  const scopeSha256 = canonicalHash({
    policy_sha256: policy.policy_sha256,
    target_paths: targetPaths,
    dependencies,
    files: files.map((record) => ({
      path: record.path,
      sha256: record.sha256,
      bytes: record.bytes,
      tombstone: record.tombstone,
    })),
  });
  return {
    scope,
    files,
    scope_sha256: scopeSha256,
    policy_sha256: policy.policy_sha256,
    config_sha256: policy.config_sha256,
    agents_sha256: policy.agents_sha256,
    rules: policy.rules,
  };
}

export function compareFileReview(beforeRecord, afterRecord, { explicit = false } = {}) {
  const pathValue = afterRecord?.path ?? beforeRecord?.path;
  if (!pathValue) throw new Error("file review has no path");
  if (beforeRecord?.path && afterRecord?.path && beforeRecord.path !== afterRecord.path) {
    throw new Error(`file review path mismatch: ${beforeRecord.path} and ${afterRecord.path}`);
  }
  const beforeSha = beforeRecord?.sha256 ?? null;
  const afterSha = afterRecord?.sha256 ?? null;
  let change = "unchanged";
  if (beforeSha === null && afterSha !== null) change = "added";
  else if (beforeSha !== null && afterSha === null) change = "deleted";
  else if (beforeSha !== afterSha || (beforeRecord?.bytes ?? null) !== (afterRecord?.bytes ?? null)) change = "modified";
  return {
    path: pathValue,
    change,
    before_sha256: beforeSha,
    after_sha256: afterSha,
    before_bytes: beforeRecord?.bytes ?? null,
    after_bytes: afterRecord?.bytes ?? null,
    tombstone: afterSha === null,
    needs_review: explicit || change !== "unchanged",
  };
}

export function compareBaseline(baseline, currentFiles, { includeUnchanged = false } = {}) {
  const before = baselineByPath(baseline);
  const after = new Map((currentFiles ?? []).map((record) => [record.path, record]));
  const paths = [...new Set([...before.keys(), ...after.keys()])].sort(ordinalCompare);
  return paths
    .map((relative) => compareFileReview(before.get(relative), after.get(relative)))
    .filter((review) => includeUnchanged || review.change !== "unchanged");
}

export function compareSelectedReviews(baseline, selectedScan) {
  const before = baselineByPath(baseline);
  const after = new Map(selectedScan.files.map((record) => [record.path, record]));
  const targetSet = new Set(selectedScan.scope.target_paths);
  return selectedScan.scope.required_paths.map((relative) => {
    const review = compareFileReview(
      before.get(relative),
      after.get(relative),
      { explicit: targetSet.has(relative) },
    );
    if (!targetSet.has(relative) && !before.has(relative) && review.after_sha256 === null) {
      return { ...review, change: "missing_dependency", needs_review: true };
    }
    return review;
  });
}

function previewLines(value) {
  return String(value ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
}

function lineEndingStyle(value) {
  const text = String(value ?? "");
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const withoutCrlf = text.replaceAll("\r\n", "");
  const lf = (withoutCrlf.match(/\n/g) ?? []).length;
  const cr = (withoutCrlf.match(/\r/g) ?? []).length;
  const styles = [crlf && "CRLF", lf && "LF", cr && "CR"].filter(Boolean);
  return styles.length ? styles.join("+") : "none";
}

function escapedText(value) {
  return JSON.stringify(String(value ?? "")).slice(1, -1);
}

function linePositionIndex(lines) {
  const positions = new Map();
  for (const [index, line] of lines.entries()) {
    const indexes = positions.get(line) ?? [];
    indexes.push(index);
    positions.set(line, indexes);
  }
  return positions;
}

function nextLineIndex(positions, line, current) {
  const indexes = positions.get(line);
  if (!indexes) return null;
  let low = 0;
  let high = indexes.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (indexes[middle] <= current) low = middle + 1;
    else high = middle;
  }
  return low < indexes.length ? indexes[low] : null;
}

function fallbackEdits(beforeLines, afterLines) {
  const beforePositions = linePositionIndex(beforeLines);
  const afterPositions = linePositionIndex(afterLines);
  const edits = [];
  let left = 0;
  let right = 0;
  while (left < beforeLines.length || right < afterLines.length) {
    if (left >= beforeLines.length) {
      edits.push({ type: "insert", text: afterLines[right] });
      right += 1;
    } else if (right >= afterLines.length) {
      edits.push({ type: "delete", text: beforeLines[left] });
      left += 1;
    } else if (beforeLines[left] === afterLines[right]) {
      edits.push({ type: "equal", text: beforeLines[left] });
      left += 1;
      right += 1;
    } else {
      const nextBefore = nextLineIndex(beforePositions, afterLines[right], left);
      const nextAfter = nextLineIndex(afterPositions, beforeLines[left], right);
      const deletionDistance = nextBefore === null ? null : nextBefore - left;
      const insertionDistance = nextAfter === null ? null : nextAfter - right;
      if (deletionDistance !== null && (insertionDistance === null || deletionDistance <= insertionDistance)) {
        for (let index = 0; index < deletionDistance; index += 1) edits.push({ type: "delete", text: beforeLines[left + index] });
        left += deletionDistance;
      } else if (insertionDistance !== null) {
        for (let index = 0; index < insertionDistance; index += 1) edits.push({ type: "insert", text: afterLines[right + index] });
        right += insertionDistance;
      } else {
        edits.push({ type: "delete", text: beforeLines[left] }, { type: "insert", text: afterLines[right] });
        left += 1;
        right += 1;
      }
    }
  }
  return edits;
}

export function buildTextPreview(before, after, { contextLines = 1, maxCells = 4_000_000 } = {}) {
  const beforeText = String(before ?? "");
  const afterText = String(after ?? "");
  const beforeLineEndings = lineEndingStyle(beforeText);
  const afterLineEndings = lineEndingStyle(afterText);
  const beforeLines = previewLines(before);
  const afterLines = previewLines(after);
  if (beforeText !== afterText && beforeLines.join("\n") === afterLines.join("\n")) {
    return {
      kind: "line_diff",
      context_lines: contextLines,
      before_line_endings: beforeLineEndings,
      after_line_endings: afterLineEndings,
      hunks: [{
        before_start: 1,
        after_start: 1,
        before: escapedText(beforeText),
        after: escapedText(afterText),
        notation: "escaped_line_endings",
      }],
    };
  }
  let edits;
  if (beforeLines.length * afterLines.length > maxCells) edits = fallbackEdits(beforeLines, afterLines);
  else {
    const table = Array.from(
      { length: beforeLines.length + 1 },
      () => new Uint32Array(afterLines.length + 1),
    );
    for (let left = beforeLines.length - 1; left >= 0; left -= 1) {
      for (let right = afterLines.length - 1; right >= 0; right -= 1) {
        table[left][right] = beforeLines[left] === afterLines[right]
          ? table[left + 1][right + 1] + 1
          : Math.max(table[left + 1][right], table[left][right + 1]);
      }
    }
    edits = [];
    let left = 0;
    let right = 0;
    while (left < beforeLines.length || right < afterLines.length) {
      if (left < beforeLines.length && right < afterLines.length && beforeLines[left] === afterLines[right]) {
        edits.push({ type: "equal", text: beforeLines[left] });
        left += 1;
        right += 1;
      } else if (left < beforeLines.length && (right >= afterLines.length || table[left + 1][right] >= table[left][right + 1])) {
        edits.push({ type: "delete", text: beforeLines[left] });
        left += 1;
      } else {
        edits.push({ type: "insert", text: afterLines[right] });
        right += 1;
      }
    }
  }

  const changed = edits
    .map((edit, index) => edit.type === "equal" ? -1 : index)
    .filter((index) => index >= 0);
  if (!changed.length) return { kind: "line_diff", context_lines: contextLines, hunks: [] };
  const ranges = [];
  let first = changed[0];
  let last = changed[0];
  for (const index of changed.slice(1)) {
    if (index - last <= contextLines * 2 + 1) last = index;
    else {
      ranges.push([first, last]);
      first = index;
      last = index;
    }
  }
  ranges.push([first, last]);

  return {
    kind: "line_diff",
    context_lines: contextLines,
    ...(beforeLineEndings !== afterLineEndings ? {
      before_line_endings: beforeLineEndings,
      after_line_endings: afterLineEndings,
    } : {}),
    hunks: ranges.map(([changeStart, changeEnd]) => {
      const start = Math.max(0, changeStart - contextLines);
      const end = Math.min(edits.length, changeEnd + contextLines + 1);
      const section = edits.slice(start, end);
      return {
        before_start: 1 + edits.slice(0, start).filter((edit) => edit.type !== "insert").length,
        after_start: 1 + edits.slice(0, start).filter((edit) => edit.type !== "delete").length,
        before: section.filter((edit) => edit.type !== "insert").map((edit) => edit.text).join("\n"),
        after: section.filter((edit) => edit.type !== "delete").map((edit) => edit.text).join("\n"),
      };
    }),
  };
}

export function operationPaths(operation) {
  return operation.type === "move_file"
    ? [operation.path, operation.destination_path]
    : [operation.path];
}

export function operationAfterContent(operation) {
  if (operation.type === "replace_exact_block") {
    const occurrences = String(operation.before_content ?? "").split(operation.old_text).length - 1;
    if (occurrences !== 1) throw new Error(`${operation.operation_id} old_text must occur exactly once`);
    return operation.before_content.replace(operation.old_text, operation.new_text);
  }
  if (operation.type === "replace_file" || operation.type === "create_file") return operation.new_content;
  if (operation.type === "delete_file") return null;
  if (operation.type === "move_file") return operation.before_content;
  throw new Error(`unsupported operation type ${operation.type}`);
}

export function operationPayload(operation) {
  const payload = { ...operation };
  delete payload.operation_sha256;
  delete payload.decision;
  delete payload.result;
  return payload;
}

export function operationHash(operation) {
  return canonicalHash(operationPayload(operation));
}

export function sealOperation(operation) {
  const sealed = { ...operation };
  sealed.path = normalizeRelative(sealed.path, `${sealed.operation_id ?? "operation"}.path`);
  if (sealed.type === "move_file") {
    sealed.destination_path = normalizeRelative(
      sealed.destination_path,
      `${sealed.operation_id ?? "operation"}.destination_path`,
    );
  }
  sealed.operation_sha256 = operationHash(sealed);
  return sealed;
}

export function proposalPayload(metadata) {
  return {
    proposal_id: metadata.proposal_id,
    version: metadata.version,
    based_on_baseline_id: metadata.based_on_baseline_id,
    policy_sha256: metadata.policy_sha256,
    ...(Object.hasOwn(metadata, "based_on_root_hash") ? { based_on_root_hash: metadata.based_on_root_hash } : {}),
    ...(Object.hasOwn(metadata, "based_on_scope_sha256") ? { based_on_scope_sha256: metadata.based_on_scope_sha256 } : {}),
    ...(Object.hasOwn(metadata, "audit_scope") ? { audit_scope: metadata.audit_scope } : {}),
    excluded_scope: metadata.excluded_scope ?? [],
    operations: (metadata.operations ?? []).map((operation) => ({
      ...operationPayload(operation),
      operation_sha256: operation.operation_sha256 ?? operationHash(operation),
    })),
  };
}

export function proposalPayloadHash(metadata) {
  return canonicalHash(proposalPayload(metadata));
}

export function sealProposal(metadata) {
  const sealed = {
    ...metadata,
    schema_version: PROPOSAL_SCHEMA,
    storage_format: "proposal-json-v5",
    operations: (metadata.operations ?? []).map(sealOperation),
  };
  sealed.payload_sha256 = proposalPayloadHash(sealed);
  return sealed;
}

function requireHex(value, label, errors) {
  if (typeof value !== "string" || !HEX_SHA256.test(value)) errors.push(`${label} is not a SHA-256 value`);
}

function validateOperation(operation, errors) {
  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    errors.push("proposal operation must be an object");
    return;
  }
  const id = operation?.operation_id ?? "(missing)";
  if (typeof operation?.operation_id !== "string" || !/^[A-Za-z0-9._-]+$/.test(operation.operation_id)) {
    errors.push("operation_id is missing or invalid");
  }
  if (!OPERATION_TYPES.has(operation?.type)) errors.push(`${id} has unsupported type ${operation?.type}`);
  try {
    const normalized = normalizeRelative(operation.path, `${id}.path`);
    if (operation.path !== normalized) errors.push(`${id}.path must use normalized forward slashes`);
  } catch (error) { errors.push(error.message); }
  if (operation?.suggested !== undefined && typeof operation.suggested !== "boolean") errors.push(`${id}.suggested must be boolean`);
  if (!DECISIONS.has(operation?.decision ?? "pending")) errors.push(`${id} has invalid decision`);
  for (const field of ["reason", "effect", "preserves", "risk", "recommendation"]) {
    if (typeof operation?.[field] !== "string" || !operation[field].trim()) errors.push(`${id} is missing ${field}`);
  }

  if (operation?.type === "create_file") {
    if (operation.precondition_sha256 !== null && operation.precondition_sha256 !== undefined) errors.push(`${id} create precondition must be null`);
    if (typeof operation.new_content !== "string") errors.push(`${id} create needs new_content`);
  } else {
    requireHex(operation?.precondition_sha256, `${id}.precondition_sha256`, errors);
    if (typeof operation?.before_content !== "string") errors.push(`${id} needs before_content`);
    else if (sha256(Buffer.from(operation.before_content, "utf8")) !== operation.precondition_sha256) errors.push(`${id} before_content does not match its precondition`);
  }

  if (operation?.type === "delete_file") {
    if (operation.expected_after_sha256 !== null && operation.expected_after_sha256 !== undefined) errors.push(`${id} delete expected-after must be null`);
  } else {
    requireHex(operation?.expected_after_sha256, `${id}.expected_after_sha256`, errors);
  }
  if (operation?.type === "replace_exact_block") {
    if (typeof operation.old_text !== "string" || !operation.old_text || typeof operation.new_text !== "string") {
      errors.push(`${id} needs old_text and new_text`);
    }
  }
  if (operation?.type === "replace_file" && typeof operation.new_content !== "string") errors.push(`${id} replace_file needs new_content`);
  if (operation?.type === "move_file") {
    try {
      const normalized = normalizeRelative(operation.destination_path, `${id}.destination_path`);
      if (operation.destination_path !== normalized) errors.push(`${id}.destination_path must use normalized forward slashes`);
    } catch (error) { errors.push(error.message); }
  }

  if (OPERATION_TYPES.has(operation?.type)) {
    try {
      const after = operationAfterContent(operation);
      const expected = after === null ? null : sha256(Buffer.from(after, "utf8"));
      if ((operation.expected_after_sha256 ?? null) !== expected) errors.push(`${id} expected-after hash does not match its exact result`);
    } catch (error) {
      errors.push(error.message);
    }
  }
  requireHex(operation?.operation_sha256, `${id}.operation_sha256`, errors);
  if (HEX_SHA256.test(operation?.operation_sha256 ?? "") && operation.operation_sha256 !== operationHash(operation)) {
    errors.push(`${id} operation hash mismatch`);
  }
}

function validateOperationGroups(operations, errors) {
  const touched = new Map();
  for (const operation of operations) {
    if (!operation || typeof operation !== "object" || !OPERATION_TYPES.has(operation.type)) continue;
    let paths;
    try { paths = operationPaths(operation).map((entry) => normalizeRelative(entry)); } catch { continue; }
    for (const relative of paths) {
      const key = relative.toLowerCase();
      const entry = touched.get(key) ?? { relative, operations: [] };
      entry.operations.push(operation);
      touched.set(key, entry);
    }
  }

  for (const { relative, operations: group } of touched.values()) {
    if (group.length < 2) continue;
    const exactBlockGroup = group.every((operation) => (
      operation.type === "replace_exact_block"
      && operation.path.toLowerCase() === relative.toLowerCase()
    ));
    if (!exactBlockGroup) {
      errors.push(`proposal has overlapping operations for ${relative}`);
      continue;
    }
    if (
      new Set(group.map((operation) => operation.precondition_sha256)).size !== 1
      || new Set(group.map((operation) => operation.before_content)).size !== 1
    ) {
      errors.push(`same-path exact-block operations need one shared before state: ${relative}`);
      continue;
    }
    let content = group[0].before_content;
    for (const operation of [...group].sort((left, right) => ordinalCompare(left.operation_id, right.operation_id))) {
      if (typeof content !== "string" || typeof operation.old_text !== "string" || !operation.old_text) break;
      const occurrences = content.split(operation.old_text).length - 1;
      if (occurrences !== 1) {
        errors.push(`${operation.operation_id} cannot be composed in operation ID order for ${relative}`);
        break;
      }
      content = content.replace(operation.old_text, operation.new_text);
    }
  }
}

function validateAuditScope(scope, errors) {
  if (!scope || typeof scope !== "object" || Array.isArray(scope)) {
    errors.push("proposal.audit_scope must be an object");
    return;
  }
  if (!["selected", "global", "legacy"].includes(scope.kind)) {
    errors.push(`proposal.audit_scope has invalid kind ${scope.kind}`);
  }
  for (const field of ["target_paths", "dependency_paths", "required_paths"]) {
    if (!Array.isArray(scope[field])) {
      errors.push(`proposal.audit_scope.${field} must be an array`);
      continue;
    }
    const seen = new Set();
    for (const value of scope[field]) {
      try {
        const normalized = normalizeRelative(value, `proposal.audit_scope.${field}`);
        if (value !== normalized) errors.push(`proposal.audit_scope.${field} contains a non-normalized path`);
        if (seen.has(normalized)) errors.push(`proposal.audit_scope.${field} repeats ${normalized}`);
        seen.add(normalized);
      } catch (error) {
        errors.push(error.message);
      }
    }
  }
  if (!Array.isArray(scope.dependencies)) errors.push("proposal.audit_scope.dependencies must be an array");
  if (typeof scope.global_completion !== "boolean") {
    errors.push("proposal.audit_scope.global_completion must be boolean");
  }
  if (scope.kind !== "legacy" && Array.isArray(scope.target_paths) && !scope.target_paths.length) {
    errors.push("proposal.audit_scope needs at least one target path");
  }
}

export function validateProposalShape(metadata) {
  const errors = [];
  if (metadata?.schema_version !== PROPOSAL_SCHEMA) errors.push("proposal schema_version must be 5");
  if (metadata?.storage_format !== "proposal-json-v5") errors.push("proposal storage_format must be proposal-json-v5");
  if (typeof metadata?.proposal_id !== "string" || !/^[A-Za-z0-9._-]+$/.test(metadata.proposal_id)) errors.push("proposal_id is missing or invalid");
  if (!Number.isInteger(metadata?.version) || metadata.version < 1) errors.push("proposal version must be positive");
  if (typeof metadata?.based_on_baseline_id !== "string" || !metadata.based_on_baseline_id) errors.push("based_on_baseline_id is missing");
  requireHex(metadata?.policy_sha256, "proposal.policy_sha256", errors);
  if (Object.hasOwn(metadata ?? {}, "based_on_root_hash")) {
    requireHex(metadata.based_on_root_hash, "proposal.based_on_root_hash", errors);
  }
  if (Object.hasOwn(metadata ?? {}, "based_on_scope_sha256")) {
    requireHex(metadata.based_on_scope_sha256, "proposal.based_on_scope_sha256", errors);
  }
  if (!["awaiting_decision", "applying", "closed", "stale"].includes(metadata?.status)) {
    errors.push(`proposal has invalid status ${metadata?.status}`);
  }
  if (!Array.isArray(metadata?.excluded_scope)) errors.push("proposal.excluded_scope must be an array");
  if (Object.hasOwn(metadata ?? {}, "audit_scope")) validateAuditScope(metadata.audit_scope, errors);
  if (!Array.isArray(metadata?.operations)) errors.push("proposal.operations must be an array");
  if (Object.hasOwn(metadata ?? {}, "presentation_sha256")) errors.push("proposal v5 must not bind a presentation hash");

  const ids = new Set();
  const operations = Array.isArray(metadata?.operations) ? metadata.operations : [];
  for (const operation of operations) {
    if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
      validateOperation(operation, errors);
      continue;
    }
    if (ids.has(operation.operation_id)) errors.push(`proposal repeats operation ${operation.operation_id}`);
    ids.add(operation.operation_id);
    validateOperation(operation, errors);
  }
  validateOperationGroups(operations, errors);
  requireHex(metadata?.payload_sha256, "proposal.payload_sha256", errors);
  if (HEX_SHA256.test(metadata?.payload_sha256 ?? "")) {
    try {
      if (metadata.payload_sha256 !== proposalPayloadHash(metadata)) errors.push("proposal payload hash mismatch");
    } catch (error) {
      errors.push(`proposal payload cannot be hashed: ${error.message}`);
    }
  }
  return errors;
}

export function validateBaselineShape(baseline) {
  const errors = [];
  if (baseline?.schema_version !== BASELINE_SCHEMA) errors.push("baseline schema_version must be 5");
  if (typeof baseline?.baseline_id !== "string" || !baseline.baseline_id) errors.push("baseline_id is missing");
  requireHex(baseline?.policy_sha256, "baseline.policy_sha256", errors);
  requireHex(baseline?.root_hash, "baseline.root_hash", errors);
  if (!Array.isArray(baseline?.files)) errors.push("baseline.files must be an array");
  const paths = new Set();
  for (const [index, record] of (baseline?.files ?? []).entries()) {
    let relative;
    try { relative = normalizeRelative(record.path, `baseline.files[${index}].path`); } catch (error) { errors.push(error.message); continue; }
    if (paths.has(relative)) errors.push(`baseline repeats ${relative}`);
    paths.add(relative);
    requireHex(record.sha256, `baseline ${relative}`, errors);
    if (!Number.isInteger(record.bytes) || record.bytes < 0) errors.push(`baseline ${relative} has invalid bytes`);
    if (!Array.isArray(record.links)) {
      errors.push(`baseline ${relative} links must be an array`);
    } else {
      const normalizedLinks = [];
      for (const [linkIndex, link] of record.links.entries()) {
        try {
          const normalized = normalizeRelative(link, `baseline ${relative}.links[${linkIndex}]`);
          if (link !== normalized) errors.push(`baseline ${relative} link is not normalized: ${link}`);
          normalizedLinks.push(normalized);
        } catch (error) {
          errors.push(error.message);
        }
      }
      const canonicalLinks = [...new Set(normalizedLinks)].sort(ordinalCompare);
      if (canonicalJson(normalizedLinks) !== canonicalJson(canonicalLinks)) {
        errors.push(`baseline ${relative} links must be unique and sorted`);
      }
    }
  }
  if (Array.isArray(baseline?.files) && HEX_SHA256.test(baseline?.root_hash ?? "") && manifestRoot(baseline.files) !== baseline.root_hash) {
    errors.push("baseline root_hash mismatch");
  }
  return errors;
}

export function validateRunShape(state) {
  const errors = [];
  if (state?.schema_version !== RUN_SCHEMA) errors.push("run schema_version must be 5");
  if (!RUN_STATUSES.has(state?.status)) errors.push(`unknown run status ${state?.status}`);
  if (typeof state?.run_id !== "string" || !state.run_id) errors.push("run_id is missing");
  if (!state?.next_action || typeof state.next_action.type !== "string") errors.push("run next_action is missing");
  return errors;
}

function allowedWritePath(rules, relative) {
  if ((rules.allowed_write_files ?? []).includes(relative)) return true;
  return (rules.allowed_write_roots ?? []).some(
    (root) => relative === root || relative.startsWith(`${root}/`),
  );
}

export async function verifyProposalPreconditions(repoRoot, rules, metadata) {
  const errors = [];
  for (const operation of metadata.operations ?? []) {
    if (["rejected", "deferred", "failed"].includes(operation.decision)) continue;
    const paths = operationPaths(operation);
    const disallowed = paths.filter((relative) => !allowedWritePath(rules, relative));
    if (disallowed.length) {
      errors.push(`${operation.operation_id} targets disallowed path ${disallowed.join(", ")}`);
      continue;
    }
    const source = resolveInside(repoRoot, operation.path).absolute;
    await assertNoSymlink(repoRoot, operation.path, { allowMissingLeaf: operation.type === "create_file" });
    const sourceExists = await pathExists(source);
    const sourceSha = sourceExists ? sha256(await fs.readFile(source)) : null;
    const applied = operation.decision === "applied";
    if (operation.type === "create_file") {
      if (applied ? sourceSha !== operation.expected_after_sha256 : sourceExists) errors.push(`${operation.operation_id} create state drift`);
    } else if (operation.type === "delete_file") {
      if (applied ? sourceExists : sourceSha !== operation.precondition_sha256) errors.push(`${operation.operation_id} delete state drift`);
    } else if (operation.type === "move_file") {
      const destination = resolveInside(repoRoot, operation.destination_path).absolute;
      await assertNoSymlink(repoRoot, operation.destination_path, { allowMissingLeaf: true });
      const destinationExists = await pathExists(destination);
      const destinationSha = destinationExists ? sha256(await fs.readFile(destination)) : null;
      if (applied) {
        if (sourceExists || destinationSha !== operation.expected_after_sha256) errors.push(`${operation.operation_id} move state drift`);
      } else if (sourceSha !== operation.precondition_sha256 || destinationExists) errors.push(`${operation.operation_id} move state drift`);
    } else if (sourceSha !== (applied ? operation.expected_after_sha256 : operation.precondition_sha256)) {
      errors.push(`${operation.operation_id} source state drift`);
    }
  }
  return errors;
}

function fenced(value) {
  const text = String(value ?? "");
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}text\n${text}\n${fence}`;
}

function renderLinePreview(preview) {
  if (!preview.hunks.length) return "修改前后没有文本差异。";
  const lines = [];
  if (preview.before_line_endings && preview.before_line_endings !== preview.after_line_endings) {
    lines.push(
      `- 换行符：${preview.before_line_endings} -> ${preview.after_line_endings}`,
      "",
    );
  }
  for (const [index, hunk] of preview.hunks.entries()) {
    lines.push(
      `**变更 ${index + 1}**（原第 ${hunk.before_start} 行 / 新第 ${hunk.after_start} 行）`,
      "",
      ...(hunk.notation === "escaped_line_endings" ? ["以下以转义形式显示换行符。", ""] : []),
      "**修改前**",
      "",
      fenced(hunk.before || "（无）"),
      "",
      "**修改后**",
      "",
      fenced(hunk.after || "（无）"),
      "",
    );
  }
  return lines.join("\n");
}

function operationPreview(operation) {
  if (operation.type === "move_file") {
    return [
      "**修改前**",
      "",
      `路径：\`${operation.path}\``,
      "",
      "**修改后**",
      "",
      `路径：\`${operation.destination_path}\``,
    ].join("\n");
  }
  if (operation.type === "create_file") {
    return [
      "**修改前**",
      "",
      "（文件不存在）",
      "",
      "**修改后**",
      "",
      operation.new_content ? fenced(operation.new_content) : "（空文件）",
    ].join("\n");
  }
  if (operation.type === "delete_file") {
    return [
      "**修改前**",
      "",
      operation.before_content ? fenced(operation.before_content) : "（空文件）",
      "",
      "**修改后**",
      "",
      "（文件不存在）",
    ].join("\n");
  }
  const before = operation.before_content;
  const after = operationAfterContent(operation) ?? "";
  return renderLinePreview(buildTextPreview(before, after));
}

function optionSet(value) {
  if (value === undefined || value === null) return null;
  return new Set((Array.isArray(value) ? value : [value]).map(String));
}

function pathOptionSet(value) {
  if (value === undefined || value === null) return null;
  return new Set(
    (Array.isArray(value) ? value : [value]).map((entry) => normalizeRelative(String(entry), "path filter")),
  );
}

function auditScopeLabel(scope) {
  if (scope?.kind === "selected") return `选定文档 ${scope.target_paths?.length ?? 0} 份`;
  if (scope?.kind === "legacy") return "maintenance-4 历史记录";
  return "全局";
}

export function renderProposal(
  metadata,
  {
    operation = null,
    path: pathFilter = null,
    pending = false,
    all = false,
    collapse = true,
    expanded = false,
  } = {},
) {
  const errors = validateProposalShape(metadata);
  if (errors.length) throw new Error(`cannot render invalid proposal:\n${errors.join("\n")}`);
  const operationIds = optionSet(operation);
  const paths = pathOptionSet(pathFilter);
  const explicitFilter = operationIds !== null || paths !== null || pending || all;
  let visible = metadata.operations.filter((entry) => {
    if (!explicitFilter && entry.suggested === false) return false;
    if (operationIds && !operationIds.has(entry.operation_id)) return false;
    if (paths && !operationPaths(entry).some((relative) => paths.has(relative))) return false;
    if (pending && (entry.decision ?? "pending") !== "pending") return false;
    return all || explicitFilter || entry.suggested !== false;
  });
  visible = visible.sort((left, right) => ordinalCompare(left.operation_id, right.operation_id));
  const visibleIds = new Set(visible.map((entry) => entry.operation_id));
  const indexed = explicitFilter && !all ? visible : metadata.operations;

  const lines = [
    `# 提议 ${metadata.proposal_id} v${metadata.version}`,
    "",
    `- 状态：${metadata.status ?? "awaiting_decision"}`,
    `- 审计范围：${auditScopeLabel(metadata.audit_scope)}`,
    `- 建议操作：${metadata.operations.filter((entry) => entry.suggested !== false).length}`,
  ];
  if (metadata.legacy_summary) {
    const counts = metadata.legacy_summary.operation_counts ?? {};
    const countText = Object.entries(counts)
      .filter(([, value]) => value)
      .map(([decision, value]) => `${decision}=${value}`)
      .join("，") || "无";
    lines.push(
      "",
      "## 历史摘要",
      "",
      `- 来源格式：schema ${metadata.legacy_summary.source_schema ?? "unknown"}`,
      `- 旧操作状态：${countText}`,
    );
  }
  lines.push(
    "",
    "## 操作索引",
    "",
    "| 操作 | 类型 | 文档 | 状态 | 有修改建议 |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const entry of indexed) {
    const id = visibleIds.has(entry.operation_id)
      ? `[${entry.operation_id}](#operation-${entry.operation_id})`
      : entry.operation_id;
    const pathsLabel = entry.type === "move_file"
      ? `\`${entry.path}\` -> \`${entry.destination_path}\``
      : `\`${entry.path}\``;
    lines.push(`| ${id} | ${entry.type} | ${pathsLabel} | ${entry.decision ?? "pending"} | ${entry.suggested === false ? "否" : "是"} |`);
  }
  lines.push("", "## 建议修改", "");
  if (!visible.length) lines.push("当前筛选条件下没有建议修改。", "");

  for (const entry of visible) {
    const title = `${entry.operation_id} · ${entry.path} · ${entry.decision ?? "pending"}`;
    const body = [
      `- 原因：${entry.reason}`,
      `- 预期效果：${entry.effect}`,
      `- 保留内容：${entry.preserves}`,
      `- 风险：${entry.risk}`,
      `- 建议：${entry.recommendation}`,
      "",
      operationPreview(entry),
    ].join("\n");
    lines.push(`<a id="operation-${entry.operation_id}"></a>`);
    if (collapse) {
      lines.push(
        `<details${expanded ? " open" : ""}>`,
        `<summary>${title}</summary>`,
        "",
        body,
        "",
        "</details>",
        "",
      );
    } else {
      lines.push(`### ${title}`, "", body, "");
    }
  }
  return `${lines.join("\n").trimEnd()}\n`;
}

export function summarizeChanges(baseline, changes) {
  const counts = {
    unchanged: baseline.files?.length ?? 0,
    modified: 0,
    added: 0,
    deleted: 0,
  };
  for (const change of changes) {
    if (change.change === "added") counts.added += 1;
    else if (change.change === "modified" || change.change === "deleted") {
      counts[change.change] += 1;
      counts.unchanged -= 1;
    }
  }
  return counts;
}
