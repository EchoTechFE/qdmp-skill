// QDMP software maintenance only. Never installs/activates telemetry or edits consent.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { releaseReader } from "./release-network.mjs";
import { atomicFile, atomicJson, directoryDigest, fileMap, syncDirectory, recoverPending } from "./recover-update.mjs";

const REPO = "EchoTechFE/qdmp-skill", MARKET = "qdmp-marketplace", PLUGIN = "qdmp@qdmp-marketplace";
const UUID = /^[a-f0-9-]{36}$/;
const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HOSTS = { codex: ".codex", "claude-code": ".claude", qoder: ".qoder" };
const SKILLS = ["qdmp-skill", "qdmp-product-rules", "qdmp-design-rules", "qdmp-entry-route"];
const hash = x => crypto.createHash("sha256").update(x).digest("hex");
function json(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } }
export function compare(a, b) {
  if (!STABLE.test(a ?? "") || !STABLE.test(b ?? "")) return null;
  for (let i = 0; i < 3; i++) { const d = BigInt(a.split(".")[i]) - BigInt(b.split(".")[i]); if (d) return d > 0n ? 1 : -1; }
  return 0;
}
function official(source) {
  return typeof source === "string" && /^(?:EchoTechFE\/qdmp-skill|https:\/\/github\.com\/EchoTechFE\/qdmp-skill(?:\.git)?\/?|git@github\.com:EchoTechFE\/qdmp-skill(?:\.git)?)$/.test(source);
}
const HOST_FILES = [".git", ".codex-marketplace-install.json", ".in_use"];
const packageDigest = root => directoryDigest(root, HOST_FILES);
function version(root) {
  const own = json(path.join(root, "references/skill-release.json"));
  if (own) return own.repository === REPO && STABLE.test(own.version) ? own.version : null;
  for (const manifest of [".codex-plugin", ".claude-plugin", ".qoder-plugin"]) {
    const p = json(path.resolve(root, "../..", manifest, "plugin.json"));
    if (p?.name === "qdmp" && STABLE.test(p.version)) return p.version;
  }
  return null;
}
function homeConfig(host, options) {
  const env = options.env ?? process.env, home = options.homeDir ?? os.homedir();
  const config = host === "codex" ? env.CODEX_HOME || path.join(home, HOSTS[host])
    : host === "claude-code" ? env.CLAUDE_CONFIG_DIR || path.join(home, HOSTS[host]) : path.join(home, HOSTS[host]);
  if (!path.isAbsolute(config)) throw new Error("Host configuration root must be an absolute directory");
  return config;
}
function candidate(root, channel) {
  if (!fs.existsSync(path.join(root, "SKILL.md"))) return null;
  return { root, channel, version: version(root), linked: fs.lstatSync(root).isSymbolicLink(),
    telemetry_version: json(path.join(root, "references/telemetry-distribution.json"))?.version ?? null };
}

export function flowCompatibility(state, release, dir) {
  const manifestMatches = state.manifest_digest === hash(JSON.stringify(release));
  const entry = path.join(dir, "onboarding.mjs");
  const entryPresent = fs.existsSync(entry);
  const entryMatches = entryPresent ? !fs.lstatSync(entry).isSymbolicLink() && hash(fs.readFileSync(entry)) === release.onboarding.sha256 : null;
  const entryRequired = !["awaiting_consent", "authorized", "declined"].includes(state.state);
  const current = manifestMatches && entryMatches !== false && (!entryRequired || entryPresent);
  const reason = !manifestMatches ? "pinned_manifest_changed" : entryRequired && !entryPresent ? "onboarding_missing" : entryMatches === false ? "onboarding_checksum_mismatch" : null;
  return { current, reason, entry_present: entryPresent, entry_matches_current: entryMatches,
    next_action: current ? "resume_allowed_actions" : state.state === "declined" ? "retain_decline_do_not_prompt"
      : ["executing", "failed", "activation_reported", "verification_pending", "collecting"].includes(state.state) ? "inspect_live_runtime_without_replaying_old_entry" : "new_notice_required",
    instruction: current ? null : "Preserve the old flow and consent evidence. Never execute or replace its pinned entry. Inspect live runtime first if a mutation may have occurred; new version/scope actions require a new bound notice." };
}

export function auditInstallation(args, options = {}) {
  if (!Object.hasOwn(HOSTS, args.host) || !path.isAbsolute(args.cwd || "") || !path.isAbsolute(args.skillDir || "")) throw new Error("explicit supported host, absolute cwd and actual loaded skill directory required");
  const cwd = fs.realpathSync(args.cwd), loaded = fs.realpathSync(args.skillDir), config = homeConfig(args.host, options);
  const copies = [], seen = new Set();
  const add = (root, channel) => { if (!seen.has(root)) { seen.add(root); const c = candidate(root, channel); if (c) copies.push(c); } };
  add(path.join(config, "skills/qdmp-skill"), "personal");
  const cache = path.join(config, "plugins/cache", MARKET, "qdmp");
  if (fs.existsSync(cache)) for (const v of fs.readdirSync(cache)) if (STABLE.test(v)) add(path.join(cache, v, "skills/qdmp-skill"), "plugin_cache");
  add(args.skillDir, "loaded_other");
  const release = options.distribution ?? json(path.join(loaded, "references/telemetry-distribution.json"));
  const base = path.join(options.homeDir ?? os.homedir(), ".qdmp-skill/monitor-flows");
  const flows = [];
  if (fs.existsSync(base) && release?.onboarding) for (const id of fs.readdirSync(base).filter(x => UUID.test(x))) {
    const dir = path.join(base, id);
    try {
      const s = json(path.join(dir, "state.json"));
      if (s?.directory === cwd && s.host === args.host) flows.push({ id, state: s.state, created_at: s.created_at, ...flowCompatibility(s, release, dir) });
    } catch (e) { flows.push({ id, diagnostic: e.message, current: false }); }
  }
  return { host: args.host, cwd, loaded_skill: loaded, loaded_version: version(loaded), config,
    copies, multiple_disk_copies: copies.length > 1, duplicate_installations: null, flows };
}

export async function latestRelease(options = {}) {
  if (options.latestRelease) return options.latestRelease();
  const network = releaseReader(options); let stage = "release_list";
  try {
    // /latest can be a telemetry release; only stable QDMP vX.Y.Z releases qualify.
    const releases = [];
    for (let page = 1; page <= 3; page++) {
      const batch = await network.read(`https://api.github.com/repos/${REPO}/releases?per_page=100&page=${page}`, stage, 5 * 1024 * 1024);
      if (!Array.isArray(batch)) throw new Error("Invalid release list");
      releases.push(...batch.filter(r => !r.draft && !r.prerelease && /^v\d+\.\d+\.\d+$/.test(r.tag_name)).map(r => ({ version: r.tag_name.slice(1), tag: r.tag_name })));
      if (batch.length < 100) break;
      if (page === 3) throw new Error("Release list incomplete; refusing an ambiguous latest version");
    }
    releases.sort((a, b) => compare(b.version, a.version) ?? 0);
    if (!releases[0]) throw new Error("No published stable QDMP release");
    const latest = releases[0];
    stage = "manifest_api";
    let distribution;
    try {
      distribution = await network.read(`https://api.github.com/repos/${REPO}/contents/skills/qdmp-skill/references/telemetry-distribution.json?ref=${latest.tag}`, stage, 256 * 1024, "application/vnd.github.raw+json");
    } catch (error) {
      // Same repository and exact tag only. Never mask missing/invalid data or rate limits.
      if (!error.retryable || error.status === 429 || error.retryAfter > 1000 || network.remaining() <= 0) throw error;
      stage = "manifest_raw";
      distribution = await network.read(`https://raw.githubusercontent.com/${REPO}/${latest.tag}/skills/qdmp-skill/references/telemetry-distribution.json`, stage, 256 * 1024);
    }
    if (!STABLE.test(distribution?.version ?? "") || !/^[a-f0-9]{64}$/.test(distribution?.onboarding?.sha256 ?? "")) throw new Error("Published telemetry pin invalid");
    return { ...latest, distribution, lookup: network.info() };
  } catch (error) { error.details ??= { stage, ...network.info() }; throw error; }
}
// Windows npm shims are not executables. Resolve their JS bin without cmd.exe.
export function hostInvocation(command, args, options = {}) {
  if ((options.platform ?? process.platform) !== "win32") return { command, args };
  if (/\.(mjs|cjs|js)$/i.test(command)) return { command: process.execPath, args: [command, ...args] };
  if (/\.exe$/i.test(command)) return { command, args };
  const env = options.env ?? process.env;
  const directories = /[/\\]/.test(command) ? [path.dirname(command)]
    : (Object.entries(env).find(([k]) => k.toLowerCase() === "path")?.[1] ?? "").split(";").filter(Boolean).map(p => p.replace(/^"|"$/g, ""));
  const name = path.basename(command).replace(/\.cmd$/i, "");
  for (const dir of directories) {
    if (fs.existsSync(path.join(dir, `${name}.exe`))) return { command: path.join(dir, `${name}.exe`), args };
    if (!fs.existsSync(path.join(dir, `${name}.cmd`))) continue;
    const modules = path.join(dir, "node_modules");
    if (!fs.existsSync(modules)) continue;
    for (const entry of fs.readdirSync(modules)) {
      const roots = entry.startsWith("@") ? fs.readdirSync(path.join(modules, entry)).map(n => path.join(modules, entry, n)) : [path.join(modules, entry)];
      for (const root of roots) {
        try {
          const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
          const bin = typeof pkg.bin === "string" ? (pkg.name?.split("/").at(-1) === name ? pkg.bin : null) : pkg.bin?.[name];
          if (!bin) continue;
          const target = path.resolve(root, bin), relative = path.relative(root, target);
          if (!relative.startsWith("..") && !path.isAbsolute(relative) && fs.statSync(target).isFile()) return { command: process.execPath, args: [target, ...args] };
        } catch { /* unrelated npm package */ }
      }
    }
  }
  throw new Error(`Cannot resolve Windows executable/npm entry: ${command}`);
}
function command(command, args, options, timeout = 15000) {
  if (options.commandResult) return options.commandResult(command, args, { timeout, cwd: options.cwd });
  const call = hostInvocation(command, args, options);
  const r = spawnSync(call.command, call.args, { cwd: options.cwd, env: options.env ?? process.env, encoding: "utf8", windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (r.status !== 0) throw new Error(`${path.basename(command)} ${args.join(" ")}: ${String(r.stderr || r.stdout || r.status).slice(0, 1500)}`);
  return String(r.stdout || "");
}
function cli(host, options) {
  if (options.hostCommand) return options.hostCommand;
  if (host === "claude-code") return "claude";
  if (host === "qoder") {
    for (const name of ["qoderclicn", "qodercli", "qoder"]) {
      try { if (/\bplugins?\b/.test(command(name, ["--help"], options, 5000))) return name; } catch { /* not installed or not the CLI surface */ }
    }
    throw new Error("No Qoder CLI with plugin commands; inspect the Desktop user registry instead");
  }
  const home = options.homeDir ?? os.homedir();
  return options.env?.CODEX_CLI_PATH || process.env.CODEX_CLI_PATH || [
    "/Applications/Codex.app/Contents/Resources/codex", "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
    "/Applications/ChatGPT.app/Contents/Resources/codex", path.join(home, "Applications/Codex.app/Contents/Resources/codex")
  ].find(p => fs.existsSync(p)) || "codex";
}
function inventory(host, executable, options) {
  const args = ["plugin", "list", ...(host === "codex" ? ["--marketplace", MARKET] : []), "--json"];
  const raw = command(executable, args, options), data = typeof raw === "string" ? JSON.parse(raw) : raw;
  const rows = Array.isArray(data) ? data : data.installed ?? data.plugins;
  if (!Array.isArray(rows)) throw new Error("Plugin inventory protocol invalid");
  const matches = rows.filter(p => p.installed !== false && [p.name, p.id, p.pluginId].some(v => v === "qdmp" || v === PLUGIN));
  const canonical = p => { const value = fs.realpathSync(p); return (options.platform ?? process.platform) === "win32" ? value.toLowerCase() : value; };
  const current = canonical(options.cwd);
  const relevant = matches.filter(p => {
    if (!["project", "local"].includes(p.scope)) return true;
    if (!p.projectPath) throw new Error("Scoped installation has no verifiable project path");
    const project = canonical(p.projectPath);
    return current === project || current.startsWith(project + path.sep);
  });
  if (relevant.length > 1) throw new Error("Multiple active qdmp scopes; choose the installation explicitly");
  return relevant[0] ?? null;
}
function pluginRoot(row, audit) {
  const supplied = row.installedPath || row.installPath || row.path;
  return supplied || path.join(audit.config, "plugins/cache", MARKET, "qdmp", row.version || "invalid");
}
function sourceFor(row, audit) {
  const source = row.marketplaceSource?.source || row.marketplaceSource?.repo;
  if (source) return { source, pinned: row.marketplaceSource.ref || row.marketplaceSource.branch };
  const record = json(path.join(audit.config, "plugins/known_marketplaces.json"))?.[MARKET];
  return { source: record?.source?.repo || record?.source?.url || record?.source?.path, pinned: record?.source?.ref };
}
function marketplaceSnapshot(audit, options) {
  let root;
  if (audit.host === "codex") {
    const raw = command(cli(audit.host, options), ["plugin", "marketplace", "list", "--json"], options);
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const rows = Array.isArray(data) ? data : data.marketplaces;
    if (!Array.isArray(rows)) throw new Error("Marketplace inventory protocol invalid");
    root = rows.find(r => r.name === MARKET)?.root;
  } else root = json(path.join(audit.config, "plugins/known_marketplaces.json"))?.[MARKET]?.installLocation;
  const manifest = audit.host === "codex" ? ".codex-plugin" : audit.host === "qoder" ? ".qoder-plugin" : ".claude-plugin";
  return { root: root ?? null, version: root ? json(path.join(root, manifest, "plugin.json"))?.version ?? null : null };
}
function backupRoot(options) {
  const root = path.join(options.homeDir ?? os.homedir(), ".qdmp-skill/backups", `${Date.now()}-${crypto.randomUUID()}`);
  fs.mkdirSync(root, { recursive: true, mode: 0o700 }); return root;
}
function frozenSnapshot(stage, latest, options) {
  const digest = packageDigest(stage.root);
  const root = path.join(options.homeDir ?? os.homedir(), ".qdmp-skill/releases", `${latest.tag}-${digest.slice(0, 16)}`);
  if (!fs.existsSync(root)) {
    const temp = `${root}.${crypto.randomUUID()}.tmp`;
    fs.mkdirSync(path.dirname(root), { recursive: true });
    fs.cpSync(stage.root, temp, { recursive: true, filter: file => path.relative(stage.root, file).split(path.sep)[0] !== ".git" });
    if (packageDigest(temp) !== digest) throw new Error("Frozen snapshot checksum mismatch");
    fs.renameSync(temp, root);
  }
  if (packageDigest(root) !== digest) throw new Error("Frozen release cache was modified; inspect manually");
  return root;
}
function updatePlugin(row, audit, latest, options) {
  if (!row) return { state: "not_installed" };
  const attemptsFile = path.join(options.homeDir ?? os.homedir(), ".qdmp-skill/update-attempts.json");
  const key = `${audit.host}:${audit.config}:${latest.tag}`, attempts = json(attemptsFile, {});
  if (attempts[key] && attempts[key].state !== "verified") return { state: "manual_required", reason: "previous_update_attempt_requires_readback", previous: attempts[key] };
  if (compare(row.version, latest.version) === null) return { state: "manual_required", reason: "unknown_installed_version" };
  if (compare(row.version, latest.version) > 0) return { state: "newer_preserved", version: row.version };
  if (row.enabled === false || row.disabled === true) return { state: "manual_required", reason: "disabled_plugin_not_auto_enabled" };
  if (row.marketplaceName && row.marketplaceName !== MARKET) return { state: "manual_required", reason: "different_marketplace" };
  const source = sourceFor(row, audit);
  if (!official(source.source) || source.pinned) return { state: "manual_required", reason: "local_custom_or_pinned_marketplace", source: source.source };
  if (row.scope && row.scope !== "user") return { state: "manual_required", reason: "non_user_scope_not_auto_changed" };
  const root = pluginRoot(row, audit);
  if (!fs.existsSync(root) || fs.lstatSync(root).isSymbolicLink()) return { state: "manual_required", reason: "plugin_backup_path_unverified" };
  const declared = json(path.join(root, audit.host === "codex" ? ".codex-plugin" : audit.host === "qoder" ? ".qoder-plugin" : ".claude-plugin", "plugin.json"));
  if (declared?.name !== "qdmp" || declared.version !== row.version) return { state: "manual_required", reason: "plugin_identity_mismatch" };
  const staged = checkout(latest, options);
  try {
    if (row.version === latest.version) return packageDigest(root) === packageDigest(staged.root)
      ? { state: "current", version: row.version, content_verified: true }
      : { state: "manual_required", reason: "same_version_content_mismatch", version: row.version };
    if (audit.host !== "codex") return { state: "manual_required", reason: "immutable_plugin_update_not_supported", target: latest.tag,
      instruction: "This host has no verified immutable install adapter. Do not update from a moving default branch. Independently installed Skills can still be updated safely." };
    const executable = cli(audit.host, options);
    const help = command(executable, ["plugin", "--help"], options);
    const marketHelp = command(executable, ["plugin", "marketplace", "--help"], options);
    if (!/\bupgrade\b/.test(marketHelp)) return { state: "manual_required", reason: "marketplace_refresh_not_supported" };
    const action = /\bupdate\b/.test(help) ? "update" : /\badd\b/.test(help) ? "add" : null;
    if (!action) return { state: "manual_required", reason: "plugin_update_not_supported" };
    if (attempts[key]) return { state: "manual_required", reason: "previous_update_attempt_requires_readback", previous: attempts[key] };
    const frozen = frozenSnapshot(staged, latest, options);
    const backup = backupRoot(options); fs.cpSync(root, path.join(backup, "qdmp-plugin"), { recursive: true });
    attempts[key] = { started_at: new Date().toISOString(), backup, state: "started" };
    atomicJson(attemptsFile, attempts);
    try {
      command(executable, ["plugin", "marketplace", "upgrade", MARKET], options, 60000);
      // Per-command override only; leave the user's official tracking source intact.
      command(executable, ["plugin", action, PLUGIN, "-c", `marketplaces.${MARKET}.source_type="local"`, "-c", `marketplaces.${MARKET}.source=${JSON.stringify(frozen)}`], options, 60000);
      const after = inventory(audit.host, executable, options);
      if (!after || compare(after.version, latest.version) !== 0) throw new Error("Plugin command returned without the exact published version; inspect live installation, do not retry blindly");
      const manifest = json(path.join(pluginRoot(after, audit), audit.host === "codex" ? ".codex-plugin" : audit.host === "qoder" ? ".qoder-plugin" : ".claude-plugin", "plugin.json"));
      if (manifest?.version !== latest.version || manifest.name !== "qdmp") throw new Error("Updated plugin disk manifest mismatch");
      if (after.enabled === false || after.disabled === true || after.scope && after.scope !== "user") throw new Error("Updated plugin is disabled or its scope changed");
      if (packageDigest(pluginRoot(after, audit)) !== packageDigest(staged.root)) throw new Error("Updated plugin package differs from the published tag");
      attempts[key].state = "verified"; return { state: "updated", version: after.version, backup, reload_required: true };
    } catch (e) { attempts[key].state = "uncertain"; attempts[key].diagnostic = e.message; return { state: "manual_required", reason: "update_failed_or_unverified", diagnostic: e.message, backup }; }
    finally { atomicJson(attemptsFile, attempts); }
  } finally { staged.cleanup?.(); }
}
function checkout(latest, options) {
  if (options.checkout) return options.checkout(latest);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "qdmp-update-"));
  const hooks = path.join(temp, "empty-hooks"); fs.mkdirSync(hooks);
  try { command("git", ["-c", `core.hooksPath=${hooks}`, "clone", "--depth", "1", "--branch", latest.tag, "--", `https://github.com/${REPO}.git`, path.join(temp, "release")], options, 60000); }
  catch (e) { fs.rmSync(temp, { recursive: true, force: true }); throw e; }
  return { root: path.join(temp, "release"), cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) };
}
function validateRelease(root, latest) {
  for (const native of HOST_FILES.slice(1)) if (fs.existsSync(path.join(root, native))) throw new Error("Release contains reserved host metadata");
  for (const host of [".codex-plugin", ".claude-plugin", ".qoder-plugin"]) {
    const m = json(path.join(root, host, "plugin.json"));
    if (m?.name !== "qdmp" || m.version !== latest.version) throw new Error("Published release manifest mismatch");
  }
  for (const name of SKILLS) {
    const dir = path.join(root, "skills", name);
    if (!fs.existsSync(path.join(dir, "SKILL.md"))) throw new Error(`Incomplete release Skill: ${name}`);
    const metadata = json(path.join(dir, "references/skill-release.json"));
    if (metadata?.schema_version !== 1 || metadata.repository !== REPO || metadata.version !== latest.version) throw new Error(`Published Skill version metadata mismatch: ${name}`);
  }
  packageDigest(root);
  if (latest.distribution && JSON.stringify(json(path.join(root, "skills/qdmp-skill/references/telemetry-distribution.json"))) !== JSON.stringify(latest.distribution)) throw new Error("Published manifest changed during checkout");
}
function updatePersonal(audit, latest, options) {
  const main = audit.copies.find(c => c.channel === "personal");
  if (!main) return { state: "not_installed" };
  if (main.linked || fs.realpathSync(main.root) !== path.resolve(main.root)) return { state: "manual_required", reason: "linked_personal_skill" };
  if (!main.version && !STABLE.test(main.telemetry_version ?? "")) return { state: "manual_required", reason: "unidentified_personal_skill" };
  const staged = checkout(latest, options);
  try {
    const source = path.join(staged.root, "skills");
    const telemetry = json(path.join(source, "qdmp-skill/references/telemetry-distribution.json"));
    if (!main.version && compare(main.telemetry_version, telemetry?.version) === 1) return { state: "manual_required", reason: "legacy_skill_has_newer_telemetry_pin" };
    const installs = [], preserved = [];
    for (const name of SKILLS) {
      const target = path.join(audit.config, "skills", name);
      if (!fs.existsSync(target)) continue; // no new Skills or discovery roots
      if (fs.lstatSync(target).isSymbolicLink() || fs.realpathSync(target) !== path.resolve(target)) throw new Error("Linked companion Skill; no personal files replaced");
      const text = fs.readFileSync(path.join(target, "SKILL.md"), "utf8");
      if (!new RegExp(`^name:\\s*["']?${name}["']?\\s*$`, "m").test(text)) throw new Error("Personal Skill identity mismatch");
      const installedVersion = version(target);
      if (installedVersion && compare(installedVersion, latest.version) > 0) { preserved.push({ name, version: installedVersion }); continue; }
      const same = directoryDigest(target) === directoryDigest(path.join(source, name));
      if (installedVersion === latest.version && !same) return { state: "manual_required", reason: "same_version_content_mismatch", skill: name };
      if (!same) installs.push({ name, target });
    }
    if (!installs.length) return { state: "current", version: main.version || latest.version, preserved, content_verified: preserved.length === 0 };
    const backup = backupRoot(options), id = crypto.randomUUID();
    const journalFile = path.join(options.homeDir ?? os.homedir(), ".qdmp-skill/personal-update.json");
    const recovery = path.join(options.homeDir ?? os.homedir(), ".qdmp-skill/maintenance/recover-update.mjs");
    fs.mkdirSync(path.dirname(recovery), { recursive: true });
    if (!fs.existsSync(recovery) || fs.readFileSync(recovery, "utf8") !== fs.readFileSync(new URL("./recover-update.mjs", import.meta.url), "utf8")) {
      atomicFile(recovery, fs.readFileSync(new URL("./recover-update.mjs", import.meta.url)));
    }
    const journal = { schema: 1, id, pid: process.pid, config: audit.config, phase: "prepared", entries: [] };
    try {
      for (const item of installs) {
        const next = path.join(backup, `new-${item.name}`); fs.cpSync(path.join(source, item.name), next, { recursive: true });
        if (directoryDigest(next) !== directoryDigest(path.join(source, item.name))) throw new Error("Staged Skill checksum mismatch");
        const old = path.join(backup, item.name); fs.cpSync(item.target, old, { recursive: true });
        journal.entries.push({ ...item, backup: old, old_digest: directoryDigest(old), old_files: fileMap(old), new_files: fileMap(next) });
      }
      atomicJson(journalFile, journal);
      for (const item of installs) {
        syncDirectory(path.join(backup, `new-${item.name}`), item.target, path.join(backup, `obsolete-${item.name}`), id);
      }
      journal.phase = "committed"; atomicJson(journalFile, journal);
      fs.renameSync(journalFile, path.join(backup, "completed.json"));
      return { state: "updated", version: latest.version, skills: installs.map(i => i.name), preserved, backup, reload_required: true };
    } catch (e) {
      if (fs.existsSync(journalFile)) { journal.phase = "rollback_required"; atomicJson(journalFile, journal); }
      for (const item of [...journal.entries].reverse()) {
        syncDirectory(item.backup, item.target, path.join(backup, `failed-${item.name}`), id);
      }
      if (fs.existsSync(journalFile)) fs.renameSync(journalFile, path.join(backup, "rolled-back.json"));
      throw new Error(`Personal update rolled back; backup=${backup}: ${e.message}`);
    }
  } finally { staged.cleanup?.(); }
}

export async function ensureCurrent(mode, args, options = {}) {
  if (!["diagnose", "ensure"].includes(mode)) throw new Error("mode must be diagnose or ensure");
  if (!Object.hasOwn(HOSTS, args.host) || !path.isAbsolute(args.cwd || "") || !path.isAbsolute(args.skillDir || "")) throw new Error("explicit supported host, absolute cwd and actual loaded skill directory required");
  if (mode === "ensure") {
    const recovery = recoverPending(options.homeDir ?? os.homedir());
    if (recovery.state === "busy") return { mode, state: "update_busy", recovery, proceed_monitoring: false, telemetry_changed: false };
  }
  const audit = auditInstallation(args, options), result = { ...audit, mode, changes: [], telemetry_changed: false };
  let latest;
  try { latest = await latestRelease(options); if (!STABLE.test(latest?.version) || latest.tag !== `v${latest.version}`) throw new Error("Invalid stable release"); }
  catch (e) { return { ...result, state: "release_check_failed", diagnostic: e.message, release_lookup: e.details, proceed_monitoring: false, instruction: "Do not install from an unknown release. Existing business tasks and authorized telemetry may continue unchanged." }; }
  result.latest = { version: latest.version, tag: latest.tag, telemetry_version: latest.distribution?.version,
    onboarding_sha256: latest.distribution?.onboarding?.sha256, lookup: latest.lookup };
  if (latest.distribution) result.flows = auditInstallation(args, { ...options, distribution: latest.distribution }).flows;
  const opts = { ...options, cwd: audit.cwd };
  let row;
  try { row = inventory(audit.host, cli(audit.host, opts), opts); result.plugin = row ? { version: row.version, enabled: row.enabled, scope: row.scope, source: sourceFor(row, audit).source } : { state: "not_installed" }; }
  catch (e) {
    result.plugin = { state: "inventory_unavailable", diagnostic: e.message };
    // Qoder Desktop can have personal Skills without a CLI plugin installation.
    // Only an explicit empty-of-qdmp user registry establishes that channel's absence.
    if (audit.host === "qoder") {
      const registry = json(path.join(audit.config, "plugins/installed_plugins.json"));
      if (registry?.plugins && typeof registry.plugins === "object") {
        const entries = Array.isArray(registry.plugins) ? registry.plugins : Object.entries(registry.plugins).flatMap(([id, records]) =>
          (Array.isArray(records) ? records : [records]).map(p => ({ ...p, pluginId: p?.pluginId || id })));
        if (!entries.some(p => [p?.name, p?.id, p?.pluginId].some(id => id === "qdmp" || typeof id === "string" && id.startsWith("qdmp@")))) {
          row = null; result.plugin = { state: "not_installed", evidence: "current_qoder_user_registry" };
        }
      }
    }
  }
  try { result.marketplace_snapshot = marketplaceSnapshot(audit, opts); }
  catch (e) { result.marketplace_snapshot = { diagnostic: e.message }; }
  result.duplicate_installations = row === undefined ? null : row !== null && audit.copies.some(c => c.channel === "personal");
  if (mode === "diagnose") return { ...result, state: "diagnosed", proceed_monitoring: false };
  const stateDir = path.join(options.homeDir ?? os.homedir(), ".qdmp-skill"); fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const lock = path.join(stateDir, "skill-update.lock"); let fd;
  try { fd = fs.openSync(lock, "wx", 0o600); fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, host: args.host, created_at: new Date().toISOString() })); fs.fsyncSync(fd); }
  catch (e) { if (e.code === "EEXIST") return { ...result, state: "update_busy", proceed_monitoring: false }; throw e; }
  let staged, stageError;
  const updateOptions = { ...opts, checkout: () => {
    if (stageError) throw stageError;
    try {
      if (!staged) { staged = checkout(latest, opts); validateRelease(staged.root, latest); }
      return { root: staged.root };
    }
    catch (error) { stageError = error; throw error; }
  } };
  try {
    // The lock may have been acquired after another invocation completed.
    const fresh = auditInstallation(args, options);
    try { row = inventory(audit.host, cli(audit.host, opts), opts); }
    catch { /* retain only prior absence proven from the same-host explicit registry */ if (row !== null) row = undefined; }
    try { result.personal_update = updatePersonal(fresh, latest, updateOptions); } catch (e) { result.personal_update = { state: "manual_required", diagnostic: e.message }; }
    try { result.plugin_update = row === undefined ? { state: "manual_required", reason: "inventory_unavailable" } : updatePlugin(row, audit, latest, updateOptions); }
    catch (e) { result.plugin_update = { state: "manual_required", diagnostic: e.message }; }
    for (const key of ["personal_update", "plugin_update"]) if (result[key].state === "updated") result.changes.push(key);
    const loadedCurrent = compare(audit.loaded_version, latest.version);
    const loadedStale = loadedCurrent === null || loadedCurrent < 0;
    let loadedMismatch = false;
    if (loadedCurrent === 0 && !result.changes.length) {
      try {
        const release = checkout(latest, updateOptions);
        result.loaded_content_verified = directoryDigest(audit.loaded_skill) === directoryDigest(path.join(release.root, "skills/qdmp-skill"));
        loadedMismatch = !result.loaded_content_verified;
        if (loadedMismatch) result.loaded_diagnostic = "The actually loaded Skill differs from the published version. Preserve the copy and repair its original installation; do not run its onboarding.";
      } catch (error) { loadedMismatch = true; result.loaded_diagnostic = error.message; }
    }
    const blocked = loadedMismatch || [result.personal_update, result.plugin_update].some(r => r.state === "manual_required") || loadedStale && !result.changes.length;
    if (loadedStale && !result.changes.length) result.loaded_diagnostic = "The loaded Skill is unversioned or stale and was not updated through a managed personal/plugin channel. Refresh its original installation; do not run its old onboarding.";
    return { ...result, state: blocked ? result.changes.length ? "partial_update" : "manual_required" : result.changes.length ? "reload_required" : "current",
      reload_required: result.changes.length > 0,
      proceed_monitoring: !blocked && !result.changes.length && loadedCurrent !== null && loadedCurrent >= 0,
      instruction: blocked ? "One or more channels remain blocked. Read personal_update/plugin_update diagnostics; a reload alone does not resolve them. Reload successfully updated channels, but do not execute stale onboarding. Business tasks may continue."
        : result.changes.length ? "Disk updates verified. Reload the actual host and read the updated Skill before continuing; old in-memory instructions and old pinned flows do not become current automatically. Telemetry authorization/trust are unchanged."
        : "Use current compatible flows only; retain old consent evidence without replay." };
  } finally { try { staged?.cleanup?.(); } finally { fs.closeSync(fd); fs.unlinkSync(lock); } }
}
export async function main(argv) {
  const [mode, ...tokens] = argv, args = {}, options = {};
  const allowed = { "--host": "host", "--cwd": "cwd", "--skill-dir": "skillDir", "--command": "hostCommand" };
  for (let i = 0; i < tokens.length; i += 2) {
    const key = allowed[tokens[i]], value = tokens[i + 1];
    if (!key || !value || value.startsWith("--") || Object.hasOwn(args, key) || Object.hasOwn(options, key)) throw new Error("unknown, duplicate or missing argument");
    (key === "hostCommand" ? options : args)[key] = value;
  }
  return ensureCurrent(mode, args, options);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
  .then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(JSON.stringify({ error: e.message })); process.exitCode = 1; });
