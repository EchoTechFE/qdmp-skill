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
  const refOverride = Object.hasOwn(overrides, "repository_ref")
    ? overrides.repository_ref
    : process.env.QDMP_TELEMETRY_REF;
  return {
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

function configuredMarketplace(command, expectedName, expectedSource, options = {}) {
  const listed = commandResult(command, ["plugin", "marketplace", "list", "--json"], options);
  const entry = listed.marketplaces?.find((candidate) => candidate.name === expectedName);
  if (!entry) return false;
  const actualSource = entry.marketplaceSource?.source;
  if (actualSource && actualSource !== expectedSource && canonicalRoot(actualSource) !== canonicalRoot(expectedSource)) {
    throw new Error(`marketplace ${expectedName} already points to a different source: ${actualSource}`);
  }
  return true;
}

export function telemetryInstallStatus({ cwd, homeDir = os.homedir() } = {}) {
  const target = receiptFile(cwd, homeDir);
  return { project_root: target.root, receipt: readJson(target.file, null) };
}

export function installTelemetry(args = {}, options = {}) {
  if (args.accepted !== true) throw new Error("explicit installation consent is required");
  const target = receiptFile(args.cwd, options.homeDir);
  const release = options.distribution ?? distribution(args);
  if (!release.repository_source) {
    throw new Error("agent-runtime-telemetry repository is not configured; set telemetry-distribution.json or QDMP_TELEMETRY_SOURCE");
  }
  const command = options.codexCommand || process.env.CODEX_CLI_PATH || "codex";
  const receipt = {
    schema_version: "1.0",
    status: "installing",
    project_root: target.root,
    accepted: true,
    accepted_at: new Date().toISOString(),
    agreement: "install_project_monitor",
    repository_source: release.repository_source,
    repository_ref: release.repository_ref || null,
    marketplace_name: release.marketplace_name,
    plugin_name: release.plugin_name
  };
  atomicWriteJson(target.file, receipt);
  try {
    if (!configuredMarketplace(command, release.marketplace_name, release.repository_source, options)) {
      const addArgs = ["plugin", "marketplace", "add", release.repository_source, "--json"];
      if (release.repository_ref) addArgs.push("--ref", release.repository_ref);
      commandResult(command, addArgs, options);
    }
    const installed = commandResult(command, ["plugin", "add", `${release.plugin_name}@${release.marketplace_name}`, "--json"], options);
    const completed = { ...receipt, status: "installed_restart_required", installed_at: new Date().toISOString() };
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
    inputSchema: { type: "object", properties: { cwd: { type: "string" }, accepted: { type: "boolean" }, repository_source: { type: "string" }, repository_ref: { type: "string" } }, required: ["cwd", "accepted"] }
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
          : message.params?.name === "install_telemetry" ? installTelemetry(args)
            : (() => { throw new Error(`unknown tool: ${message.params?.name}`); })();
        writeResult(message.id, { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value });
      } else if (message.id !== undefined) process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "method not found" } })}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: message.id, error: { code: -32000, message: error.message } })}\n`);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) serve();
