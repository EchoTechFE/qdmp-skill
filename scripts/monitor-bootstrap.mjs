#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DISTRIBUTION_FILE = path.join(PLUGIN_ROOT, "telemetry-distribution.json");
const MAX_ARTIFACT_BYTES = 20 * 1024 * 1024;

function canonicalRoot(candidate) {
  const resolved = path.resolve(candidate || process.cwd());
  try { return fs.realpathSync.native(resolved); } catch { return resolved; }
}

function readJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}

function atomicWriteJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
  fs.chmodSync(file, 0o600);
}

function receiptFile(projectRoot, homeDir = os.homedir()) {
  const root = canonicalRoot(projectRoot);
  const id = crypto.createHash("sha256").update(root).digest("hex").slice(0, 32);
  return { root, file: path.join(homeDir, ".qdmp-skill", "telemetry-install", `${id}.json`) };
}

function distribution(overrides = {}) {
  const configured = readJson(DISTRIBUTION_FILE, {}) ?? {};
  const sourceOverride = overrides.repository_source || process.env.QDMP_TELEMETRY_SOURCE || "";
  const artifactOverride = overrides.artifact_url || process.env.QDMP_TELEMETRY_ARTIFACT_URL || "";
  const refOverride = Object.hasOwn(overrides, "repository_ref")
    ? overrides.repository_ref
    : process.env.QDMP_TELEMETRY_REF;
  return {
    version: configured.version || "",
    artifact_url: sourceOverride ? "" : (artifactOverride || configured.artifact_url || ""),
    artifact_sha256: overrides.artifact_sha256 || process.env.QDMP_TELEMETRY_ARTIFACT_SHA256 || configured.artifact_sha256 || "",
    archive_root: configured.archive_root || "",
    repository_source: sourceOverride || configured.repository_source || "",
    // A source override identifies a different distribution. Never leak the
    // production tag into a local QA path; callers can explicitly provide a
    // matching ref when the override is another Git repository.
    repository_ref: refOverride !== undefined ? refOverride : (sourceOverride ? "" : configured.repository_ref || ""),
    marketplace_name: configured.marketplace_name || "agent-runtime-telemetry-marketplace",
    plugin_name: configured.plugin_name || "agent-runtime-telemetry"
  };
}

function commandResult(command, args, options = {}) {
  const result = (options.spawn ?? spawnSync)(command, args, { encoding: "utf8", env: process.env });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || `exit ${result.status}`).trim();
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
  const text = String(result.stdout || "").trim();
  try { return text ? JSON.parse(text) : {}; } catch { return { output: text }; }
}

function marketplaceEntry(command, expectedName, options = {}) {
  const listed = commandResult(command, ["plugin", "marketplace", "list", "--json"], options);
  return listed.marketplaces?.find((candidate) => candidate.name === expectedName) ?? null;
}

function sameSource(actual, expected) {
  if (!actual) return false;
  return actual === expected || canonicalRoot(actual) === canonicalRoot(expected);
}

function ensureMarketplace(command, release, source, options = {}) {
  const entry = marketplaceEntry(command, release.marketplace_name, options);
  const previousSource = entry?.marketplaceSource?.source || "";
  if (entry && sameSource(previousSource, source)) return;
  if (entry) commandResult(command, ["plugin", "marketplace", "remove", release.marketplace_name, "--json"], options);
  try {
    const addArgs = ["plugin", "marketplace", "add", source, "--json"];
    if (!release.artifact_url && release.repository_ref) addArgs.push("--ref", release.repository_ref);
    commandResult(command, addArgs, options);
  } catch (error) {
    if (previousSource) {
      try { commandResult(command, ["plugin", "marketplace", "add", previousSource, "--json"], options); } catch {}
    }
    throw error;
  }
}

function validateArchiveListing(text, expectedRoot) {
  const entries = String(text).split(/\r?\n/).filter(Boolean);
  if (!entries.length) throw new Error("telemetry artifact is empty");
  for (const entry of entries) {
    const normalized = entry.replaceAll("\\", "/").replace(/\/+$/, "");
    const segments = normalized.split("/");
    if (!normalized || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || segments.includes("..")) {
      throw new Error(`unsafe telemetry artifact path: ${entry}`);
    }
    if (segments[0] !== expectedRoot) throw new Error(`unexpected telemetry artifact root: ${segments[0]}`);
  }
}

function rejectArchiveLinks(text) {
  for (const line of String(text).split(/\r?\n/).filter(Boolean)) {
    if (/^[lh]/.test(line.trimStart())) throw new Error("telemetry artifact must not contain symbolic or hard links");
  }
}

function rejectExtractedLinks(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    const stat = fs.lstatSync(target);
    if (stat.isSymbolicLink()) throw new Error(`telemetry artifact contains a symbolic link: ${entry.name}`);
    if (stat.isDirectory()) rejectExtractedLinks(target);
  }
}

function validateExtractedPlugin(pluginRoot, release) {
  const plugin = readJson(path.join(pluginRoot, ".codex-plugin", "plugin.json"), null);
  const marketplace = readJson(path.join(pluginRoot, ".codex-plugin", "marketplace.json"), null);
  if (plugin?.name !== release.plugin_name) throw new Error("telemetry artifact contains an unexpected plugin");
  if (plugin?.version !== release.version) throw new Error(`telemetry artifact version ${plugin?.version || "missing"} does not match ${release.version}`);
  if (marketplace?.name !== release.marketplace_name) throw new Error("telemetry artifact contains an unexpected marketplace");
}

export async function prepareTelemetryArtifact(release, options = {}) {
  if (!/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/.test(release.version || "")) throw new Error("invalid telemetry artifact version");
  if (!/^https:\/\//.test(release.artifact_url || "")) throw new Error("telemetry artifact URL must use HTTPS");
  if (!/^[a-f0-9]{64}$/i.test(release.artifact_sha256 || "")) throw new Error("telemetry artifact SHA-256 is required");
  if (!/^[A-Za-z0-9._+-]+$/.test(release.archive_root || "")) throw new Error("invalid telemetry archive root");

  const homeDir = options.homeDir ?? os.homedir();
  const cacheRoot = path.join(homeDir, ".qdmp-skill", "telemetry-packages");
  const finalRoot = path.join(cacheRoot, `${release.version}-${release.artifact_sha256.slice(0, 12)}`);
  if (fs.existsSync(finalRoot)) {
    validateExtractedPlugin(finalRoot, release);
    return { plugin_root: finalRoot, cached: true };
  }

  const temporary = path.join(cacheRoot, `.installing-${process.pid}-${crypto.randomBytes(6).toString("hex")}`);
  const archive = path.join(temporary, "artifact.tar.gz");
  const extractRoot = path.join(temporary, "extract");
  fs.mkdirSync(extractRoot, { recursive: true, mode: 0o700 });
  try {
    const response = await (options.fetch ?? globalThis.fetch)(release.artifact_url, { redirect: "follow" });
    if (!response?.ok) throw new Error(`telemetry artifact download failed: HTTP ${response?.status ?? "unknown"}`);
    const declaredSize = Number(response.headers?.get?.("content-length") || 0);
    if (declaredSize > MAX_ARTIFACT_BYTES) throw new Error("telemetry artifact exceeds the 20 MiB limit");
    const content = Buffer.from(await response.arrayBuffer());
    if (!content.length || content.length > MAX_ARTIFACT_BYTES) throw new Error("telemetry artifact has an invalid size");
    const actualHash = crypto.createHash("sha256").update(content).digest("hex");
    if (actualHash.toLowerCase() !== release.artifact_sha256.toLowerCase()) {
      throw new Error(`telemetry artifact checksum mismatch: expected ${release.artifact_sha256}, received ${actualHash}`);
    }
    fs.writeFileSync(archive, content, { mode: 0o600 });
    const list = (options.spawn ?? spawnSync)("tar", ["-tzf", archive], { encoding: "utf8", env: process.env });
    if (list.error) throw list.error;
    if (list.status !== 0) throw new Error(`unable to inspect telemetry artifact: ${String(list.stderr || "tar failed").trim()}`);
    validateArchiveListing(list.stdout, release.archive_root);
    const verbose = (options.spawn ?? spawnSync)("tar", ["-tvzf", archive], { encoding: "utf8", env: process.env });
    if (verbose.error) throw verbose.error;
    if (verbose.status !== 0) throw new Error(`unable to inspect telemetry artifact links: ${String(verbose.stderr || "tar failed").trim()}`);
    rejectArchiveLinks(verbose.stdout);
    const extracted = (options.spawn ?? spawnSync)("tar", ["-xzf", archive, "-C", extractRoot], { encoding: "utf8", env: process.env });
    if (extracted.error) throw extracted.error;
    if (extracted.status !== 0) throw new Error(`unable to extract telemetry artifact: ${String(extracted.stderr || "tar failed").trim()}`);
    const pluginRoot = path.join(extractRoot, release.archive_root);
    rejectExtractedLinks(pluginRoot);
    validateExtractedPlugin(pluginRoot, release);
    fs.mkdirSync(cacheRoot, { recursive: true, mode: 0o700 });
    fs.renameSync(pluginRoot, finalRoot);
    atomicWriteJson(path.join(finalRoot, ".qdmp-distribution.json"), {
      version: release.version,
      artifact_url: release.artifact_url,
      artifact_sha256: release.artifact_sha256,
      installed_at: new Date().toISOString()
    });
    return { plugin_root: finalRoot, cached: false };
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
}

export function telemetryInstallStatus({ cwd, homeDir = os.homedir() } = {}) {
  const target = receiptFile(cwd, homeDir);
  return { project_root: target.root, receipt: readJson(target.file, null) };
}

export function resolveCodexCommand(options = {}) {
  if (options.codexCommand) return options.codexCommand;
  const platform = options.platform ?? process.platform;
  const homeDir = options.homeDir ?? os.homedir();
  const exists = options.existsSync ?? fs.existsSync;
  const desktopCandidates = platform === "darwin" ? [
    "/Applications/Codex.app/Contents/Resources/codex",
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    path.join(homeDir, "Applications", "Codex.app", "Contents", "Resources", "codex"),
    path.join(homeDir, "Applications", "ChatGPT.app", "Contents", "Resources", "codex")
  ] : [];
  return desktopCandidates.find((candidate) => exists(candidate))
    ?? process.env.CODEX_CLI_PATH
    ?? "codex";
}

export async function installTelemetry(args = {}, options = {}) {
  if (args.accepted !== true) throw new Error("explicit installation consent is required");
  const target = receiptFile(args.cwd, options.homeDir);
  const release = options.distribution ?? distribution(args);
  if (!release.artifact_url && !release.repository_source) {
    throw new Error("agent-runtime-telemetry distribution is not configured");
  }
  const command = resolveCodexCommand(options);
  const receipt = {
    schema_version: "1.0",
    status: "installing",
    project_root: target.root,
    accepted: true,
    accepted_at: new Date().toISOString(),
    agreement: "install_project_monitor",
    distribution_mode: release.artifact_url ? "verified_artifact" : "git_repository",
    version: release.version || null,
    artifact_url: release.artifact_url || null,
    artifact_sha256: release.artifact_sha256 || null,
    repository_source: release.artifact_url ? null : release.repository_source,
    repository_ref: release.artifact_url ? null : (release.repository_ref || null),
    marketplace_name: release.marketplace_name,
    plugin_name: release.plugin_name
  };
  atomicWriteJson(target.file, receipt);
  try {
    const prepared = release.artifact_url ? await prepareTelemetryArtifact(release, options) : null;
    const source = prepared?.plugin_root || release.repository_source;
    ensureMarketplace(command, release, source, options);
    const installed = commandResult(command, ["plugin", "add", `${release.plugin_name}@${release.marketplace_name}`, "--json"], options);
    const completed = { ...receipt, status: "installed_restart_required", installed_at: new Date().toISOString(), local_source: source, artifact_cached: prepared?.cached ?? null };
    atomicWriteJson(target.file, completed);
    return { ...completed, restart_required: true, install_result: installed };
  } catch (error) {
    atomicWriteJson(target.file, { ...receipt, status: "install_failed", failed_at: new Date().toISOString(), error: error.message });
    throw error;
  }
}

const TOOLS = [
  {
    name: "telemetry_install_status",
    description: "Read the project-scoped Agent Runtime Telemetry installation authorization and result.",
    inputSchema: { type: "object", properties: { cwd: { type: "string" } }, required: ["cwd"] }
  },
  {
    name: "install_telemetry",
    description: "Install Agent Runtime Telemetry only after explicit installation consent. This does not grant data collection consent.",
    inputSchema: { type: "object", properties: { cwd: { type: "string" }, accepted: { type: "boolean" }, repository_source: { type: "string" }, repository_ref: { type: "string" }, artifact_url: { type: "string" }, artifact_sha256: { type: "string" } }, required: ["cwd", "accepted"] }
  }
];

function writeResult(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`);
}

async function serve() {
  const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    try {
      if (message.method === "initialize") writeResult(message.id, { protocolVersion: message.params?.protocolVersion ?? "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "qdmp-monitor-bootstrap", version: "1.0.0" } });
      else if (message.method === "tools/list") writeResult(message.id, { tools: TOOLS });
      else if (message.method === "tools/call") {
        const args = message.params?.arguments ?? {};
        const value = message.params?.name === "telemetry_install_status" ? telemetryInstallStatus(args)
          : message.params?.name === "install_telemetry" ? await installTelemetry(args)
            : (() => { throw new Error(`unknown tool: ${message.params?.name}`); })();
        writeResult(message.id, { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });
      } else if (message.id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "method not found" } })}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: error.message } })}\n`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) serve();
