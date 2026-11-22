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
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const DISTRIBUTION_PATH = "skills/qdmp-skill/references/telemetry-distribution.json";
const RELEASE_URL = `https://github.com/${REPO}/releases/tag`;
const RELEASE_HEADING = "## 用户可见更新";
const STABLE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const HOSTS = { codex: ".codex", "claude-code": ".claude", qoder: ".qoder" };
const SKILLS = ["qdmp-skill", "qdmp-product-rules", "qdmp-design-rules", "qdmp-entry-route"];
const hash = x => crypto.createHash("sha256").update(x).digest("hex");
function json(file, fallback = null) { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { if (e.code === "ENOENT") return fallback; throw e; } }
export function releaseHighlights(notes) {
  if (typeof notes !== "string") return [];
  const lines = notes.split(/\r?\n/);
  const heading = lines.indexOf(RELEASE_HEADING);
  if (heading === -1) return [];
  const highlights = [];
  for (const line of lines.slice(heading + 1)) {
    if (line.startsWith("#")) break;
    const text = line.match(/^- (.{1,160})$/u)?.[1]?.trim();
    if (text) highlights.push(text);
    if (highlights.length === 5) break;
  }
  return highlights;
}

function installedNotes(audit) {
  if (!audit.loaded_version) return undefined;
  try {
    const notes = fs.readFileSync(path.join(audit.loaded_skill, "references/release-notes.md"), "utf8");
    const tag = `v${audit.loaded_version}`;
    if (notes.split(/\r?\n/, 1)[0] !== `# QDMP Skill ${tag}`) return undefined;
    const highlights = releaseHighlights(notes);
    if (highlights.length) return { version: audit.loaded_version, highlights, url: `${RELEASE_URL}/${tag}` };
  } catch { /* Release notes are optional for older installations. */ }
}

function loadedChannel(audit, args) {
  return audit.copies.find(copy => copy.root === args.skillDir)?.channel ?? "loaded_other";
}

function noticeOnce(result, audit, args, options, kind, release) {
  if (args.loadedVersion === undefined || !release) return result;
  const channel = result.active_channel ?? loadedChannel(audit, args);
  const installation = channel === "plugin_cache" ? null : audit.loaded_skill;
  const dir = path.join(options.homeDir ?? os.homedir(), ".qdmp-skill", "release-notices");
  const marker = noticeKind => path.join(dir, hash(JSON.stringify([audit.host, audit.config, channel, installation, noticeKind, release.version])));
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (kind === "available" && ["reload_required", "switch_required"].some(previous => fs.existsSync(marker(previous)))) return result;
    fs.writeFileSync(marker(kind), "", { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code === "EEXIST") return result;
    return { ...result, notice_cache_error: error.code ?? "UNAVAILABLE" };
  }
  const highlights = kind === "loaded" ? release.highlights : kind === "available" ? release.highlights?.slice(0, 1) : [];
  return { ...result, update_notice: { kind, host: audit.host, channel, loaded_version: args.loadedVersion, ...release, highlights: highlights ?? [] } };
}

function pendingDiskReload(result) {
  return { ...result, state: "reload_required", reload_required: true, reload_for_current: true,
    reload_reason: "disk_version_changed", proceed_monitoring: false,
    instruction: "Reload the host to use the newer Skill on disk." };
}
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
  let directoryMatches = true;
  if (state.directory_identity) {
    try { const stat = fs.statSync(state.directory);
      directoryMatches = fs.realpathSync(state.directory) === state.directory && stat.dev === state.directory_identity.dev && stat.ino === state.directory_identity.ino;
    } catch { directoryMatches = false; }
  }
  const entry = path.join(dir, "onboarding.mjs");
  const entryPresent = fs.existsSync(entry);
  const entryMatches = entryPresent ? !fs.lstatSync(entry).isSymbolicLink() && hash(fs.readFileSync(entry)) === release.onboarding.sha256 : null;
  const entryRequired = !["awaiting_consent", "authorized", "declined"].includes(state.state);
  const current = manifestMatches && directoryMatches && entryMatches !== false && (!entryRequired || entryPresent);
  const reason = !manifestMatches ? "pinned_manifest_changed" : !directoryMatches ? "directory_identity_changed" : entryRequired && !entryPresent ? "onboarding_missing" : entryMatches === false ? "onboarding_checksum_mismatch" : null;
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

export async function latestRelease(options = {}, { allowUnavailableTelemetryPin = false } = {}) {
  if (options.latestRelease) return options.latestRelease();
  const network = releaseReader(options); let stage = "release_list";
  const api = `https://api.github.com/repos/${REPO}`;
  try {
    let latest;
    for (let page = 1; ; page++) {
      const batch = await network.read(`${api}/releases?per_page=100&page=${page}`, stage, 5 * 1024 * 1024);
      if (!Array.isArray(batch) || batch.some(release => typeof release?.tag_name !== "string")) throw new Error("Invalid repository release list");
      for (const { tag_name: tag, draft, prerelease, published_at: publishedAt, body } of batch) {
        const version = tag.slice(1);
        if (draft === false && prerelease === false && typeof publishedAt === "string" && Number.isFinite(Date.parse(publishedAt))
          && tag.startsWith("v") && STABLE.test(version) && (!latest || compare(version, latest.version) > 0)) {
          latest = { version, tag, url: `${RELEASE_URL}/${tag}`, highlights: releaseHighlights(body) };
        }
      }
      if (batch.length < 100) break;
    }
    if (!latest) throw new Error("No published stable QDMP release");
    stage = "release_commit";
    const tagRef = await network.read(`${api}/git/ref/tags/${latest.tag}`, stage, 256 * 1024);
    if (tagRef?.ref !== `refs/tags/${latest.tag}`) throw new Error("Published QDMP release tag reference is invalid");
    let object = tagRef.object;
    for (let depth = 0; object?.type === "tag" && COMMIT_SHA.test(object.sha ?? "") && depth < 4; depth++) {
      const tag = await network.read(`${api}/git/tags/${object.sha}`, stage, 256 * 1024);
      if (tag?.sha !== object.sha) throw new Error("Published QDMP release tag object is invalid");
      object = tag.object;
    }
    if (object?.type !== "commit" || !COMMIT_SHA.test(object.sha ?? "")) throw new Error("Invalid commit SHA for published QDMP release");
    latest.commit = object.sha;
    stage = "manifest_api";
    try {
      let distribution;
      try {
        // Give the same-commit raw endpoint time within the shared deadline.
        distribution = await network.read(`https://api.github.com/repos/${REPO}/contents/${DISTRIBUTION_PATH}?ref=${latest.commit}`, stage, 256 * 1024, "application/vnd.github.raw+json", 1);
      } catch (error) {
        // Same repository and exact commit only. Never mask missing/invalid data or rate limits.
        if (!error.retryable || error.status === 429 || error.retryAfter > 0 || network.remaining() <= 0) throw error;
        stage = "manifest_raw";
        distribution = await network.read(`https://raw.githubusercontent.com/${REPO}/${latest.commit}/${DISTRIBUTION_PATH}`, stage, 256 * 1024);
      }
      if (!STABLE.test(distribution?.version ?? "") || !/^[a-f0-9]{64}$/.test(distribution?.onboarding?.sha256 ?? "")) throw new Error("Published telemetry pin invalid");
      return { ...latest, distribution, lookup: network.info() };
    } catch (error) {
      if (!allowUnavailableTelemetryPin) throw error;
      return { ...latest, distribution: null, lookup: network.info(),
        distribution_error: { stage, message: error.message } };
    }
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
function updatePlugin(row, audit, latest, options, checkOnly = false) {
  if (!row) return { state: "not_installed" };
  const attemptsFile = path.join(options.homeDir ?? os.homedir(), ".qdmp-skill/update-attempts.json");
  const key = `${audit.host}:${audit.config}:${latest.tag}`, attempts = json(attemptsFile, {});
  if (attempts[key] && attempts[key].state !== "verified") return { state: "manual_required", reason: "previous_update_attempt_requires_readback", previous: attempts[key] };
  if (!STABLE.test(row.version ?? "")) return { state: "manual_required", reason: "unknown_installed_version" };
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
    const pluginVersion = staged.pluginVersion;
    const installedSkillVersion = version(path.join(root, "skills/qdmp-skill"));
    if (compare(row.version, pluginVersion) > 0 || compare(installedSkillVersion, latest.version) > 0) {
      return { state: "newer_preserved", version: row.version, skill_version: installedSkillVersion };
    }
    if (row.version === pluginVersion) return packageDigest(root) === packageDigest(staged.root)
      ? { state: "current", version: row.version, content_verified: true, root }
      : { state: "manual_required", reason: "same_version_content_mismatch", version: row.version };
    if (checkOnly) return { state: "update_required" };
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
      if (!after || compare(after.version, pluginVersion) !== 0) throw new Error("Plugin command returned without the exact published version; inspect live installation, do not retry blindly");
      const manifest = json(path.join(pluginRoot(after, audit), audit.host === "codex" ? ".codex-plugin" : audit.host === "qoder" ? ".qoder-plugin" : ".claude-plugin", "plugin.json"));
      if (manifest?.version !== pluginVersion || manifest.name !== "qdmp") throw new Error("Updated plugin disk manifest mismatch");
      if (after.enabled === false || after.disabled === true || after.scope && after.scope !== "user") throw new Error("Updated plugin is disabled or its scope changed");
      if (packageDigest(pluginRoot(after, audit)) !== packageDigest(staged.root)) throw new Error("Updated plugin package differs from the published tag");
      attempts[key].state = "verified"; return { state: "updated", version: after.version, backup, root: pluginRoot(after, audit), reload_required: true };
    } catch (e) { attempts[key].state = "uncertain"; attempts[key].diagnostic = e.message; return { state: "manual_required", reason: "update_failed_or_unverified", diagnostic: e.message, backup }; }
    finally { atomicJson(attemptsFile, attempts); }
  } finally { staged.cleanup?.(); }
}
// Keep actual installations, rollback backups and the copy used by this call.
function pruneOlderQdmpCaches(audit, latest, plugin, options) {
  const frozen = path.join(options.homeDir ?? os.homedir(), ".qdmp-skill", "releases");
  const hostCache = path.join(audit.config, "plugins", "cache", MARKET, "qdmp");
  const removed = [];
  const prune = (root, pattern, targetVersion) => {
    if (!fs.existsSync(root) || fs.lstatSync(root).isSymbolicLink()) return;
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const old = entry.name.match(pattern)?.[1];
      if (!entry.isDirectory() || compare(old, targetVersion) !== -1) continue;
      const candidate = path.join(root, entry.name);
      const resolved = fs.realpathSync(candidate);
      if (path.dirname(resolved) !== fs.realpathSync(root) || resolved === plugin.root
        || audit.loaded_skill === resolved || audit.loaded_skill.startsWith(resolved + path.sep)) continue;
      if (fs.existsSync(path.join(resolved, ".in_use"))) continue;
      const manifest = json(path.join(resolved, ".codex-plugin", "plugin.json"));
      if (manifest?.name !== "qdmp" || manifest.version !== old) continue;
      try { fs.rmSync(candidate, { recursive: true }); removed.push(candidate); }
      catch { /* Windows can retain an open handle on the old cache. */ }
    }
  };
  if (plugin.state === "current" || plugin.state === "updated" || plugin.state === "not_installed") {
    prune(frozen, /^v(\d+\.\d+\.\d+)-[a-f0-9]{16}$/, latest.version);
  }
  // A host cache may still serve the old Skill while a reload is pending.
  if (audit.host === "codex" && plugin.state === "current" && audit.loaded_version === latest.version && options.loadedVerified) {
    prune(hostCache, /^(\d+\.\d+\.\d+)$/, plugin.version);
  }
  return removed;
}

function checkout(latest, options) {
  if (options.checkout) return options.checkout(latest);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "qdmp-update-"));
  const hooks = path.join(temp, "empty-hooks"); fs.mkdirSync(hooks);
  const root = path.join(temp, "release");
  try {
    command("git", ["-c", `core.hooksPath=${hooks}`, "clone", "--depth", "1", "--branch", latest.tag, "--", `https://github.com/${REPO}.git`, root], options, 60000);
    if (latest.commit && command("git", ["rev-parse", "HEAD"], { ...options, cwd: root }).trim() !== latest.commit) {
      throw new Error("QDMP tag points to a different commit than the version lookup");
    }
  } catch (e) { fs.rmSync(temp, { recursive: true, force: true }); throw e; }
  return { root, cleanup: () => fs.rmSync(temp, { recursive: true, force: true }) };
}
function validateRelease(root, latest) {
  const declaration = json(path.join(root, "skills/qdmp-skill/references/skill-release.json"));
  const pluginVersion = declaration && Object.hasOwn(declaration, "plugin_version") ? declaration.plugin_version : latest.version;
  if (!STABLE.test(pluginVersion ?? "")) throw new Error("Invalid published plugin version");
  for (const native of HOST_FILES.slice(1)) if (fs.existsSync(path.join(root, native))) throw new Error("Release contains reserved host metadata");
  for (const host of [".codex-plugin", ".claude-plugin", ".qoder-plugin"]) {
    const m = json(path.join(root, host, "plugin.json"));
    if (m?.name !== "qdmp" || m.version !== pluginVersion) throw new Error("Published release manifest mismatch");
  }
  for (const name of SKILLS) {
    const dir = path.join(root, "skills", name);
    if (!fs.existsSync(path.join(dir, "SKILL.md"))) throw new Error(`Incomplete release Skill: ${name}`);
    const metadata = json(path.join(dir, "references/skill-release.json"));
    if (metadata?.schema_version !== 1 || metadata.repository !== REPO || metadata.version !== latest.version) throw new Error(`Published Skill version metadata mismatch: ${name}`);
  }
  packageDigest(root);
  if (latest.distribution && JSON.stringify(json(path.join(root, "skills/qdmp-skill/references/telemetry-distribution.json"))) !== JSON.stringify(latest.distribution)) throw new Error("Published manifest changed during checkout");
  return pluginVersion;
}

function duplicateBackup(audit, options, channel) {
  const id = hash(JSON.stringify([audit.host, audit.config, channel]));
  return path.join(options.homeDir ?? os.homedir(), ".qdmp-skill", "channel-cleanup", id);
}

function retirePersonal(audit, latest, options, verifyKeeper) {
  const root = path.join(audit.config, "skills");
  const backup = duplicateBackup(audit, options, "personal");
  if (!SKILLS.some(name => fs.existsSync(path.join(root, name))) && !fs.existsSync(backup)) return null;
  if (!verifyKeeper()) throw new Error("Active plugin could not be verified");
  fs.mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
  if (fs.realpathSync(root) !== root || (fs.existsSync(backup) && fs.realpathSync(backup) !== backup)) {
    throw new Error("Linked standalone discovery or backup directory");
  }
  if (fs.realpathSync(path.dirname(backup)) !== path.dirname(backup)) throw new Error("Linked cleanup directory");
  if (fs.existsSync(backup) && fs.readdirSync(backup).some(name => !SKILLS.includes(name))) throw new Error("Unexpected standalone backup entries");
  const snapshots = new Map();
  const moved = [];
  try {
    const entries = SKILLS.map(name => {
      const installed = path.join(root, name);
      const saved = path.join(backup, name);
      if (fs.existsSync(installed) && fs.existsSync(saved)) throw new Error(`Conflicting cleanup copies: ${name}`);
      const source = fs.existsSync(installed) ? installed : saved;
      if (!fs.existsSync(source)) return null;
      if (fs.realpathSync(source) !== source) throw new Error(`Linked standalone Skill: ${name}`);
      const versionOnDisk = version(source);
      const compared = compare(versionOnDisk, latest.version);
      if (compared === null || compared > 0) throw new Error(`Standalone version requires review: ${name}`);
      const release = compared === 0 ? options.checkout() : snapshots.get(versionOnDisk)
        ?? checkout({ version: versionOnDisk, tag: `v${versionOnDisk}` }, options.originalOptions);
      if (compared < 0) snapshots.set(versionOnDisk, release);
      const digest = directoryDigest(source);
      if (digest !== directoryDigest(path.join(release.root, "skills", name))) throw new Error(`Standalone Skill has local changes: ${name}`);
      return { installed, saved, source, digest };
    }).filter(Boolean);
    fs.mkdirSync(backup, { recursive: true, mode: 0o700 });
    for (const { installed, saved, source, digest } of entries) {
      if (source !== installed) continue;
      if (directoryDigest(installed) !== digest || fs.existsSync(saved)) throw new Error("Standalone Skill changed during cleanup");
      fs.renameSync(installed, saved);
      moved.push({ installed, saved });
    }
    if (entries.some(entry => fs.existsSync(entry.installed)) || !verifyKeeper()) throw new Error("Single-channel verification failed");
  } catch (error) {
    for (const { installed, saved } of moved.reverse()) if (!fs.existsSync(installed)) fs.renameSync(saved, installed);
    throw error;
  } finally {
    for (const release of snapshots.values()) release.cleanup?.();
  }
  fs.rmSync(backup, { recursive: true });
  return { state: "retired", channel: "personal" };
}

function retirePlugin(row, audit, latest, options, verifyKeeper) {
  const backup = duplicateBackup(audit, options, "plugin");
  if (row === undefined) return { state: "manual_required", channel: "plugin_cache", reason: "inventory_unavailable" };
  if (!row || row.enabled === false || row.disabled === true) {
    if (!fs.existsSync(backup)) return null;
    if (fs.realpathSync(backup) !== backup || !verifyKeeper()) throw new Error("Plugin cleanup backup cannot be verified");
    fs.rmSync(backup, { recursive: true });
    return { state: "retired", channel: "plugin_cache" };
  }
  const source = sourceFor(row, audit);
  const pluginVersion = options.checkout().pluginVersion;
  if (row.enabled !== true || row.scope && row.scope !== "user" || row.marketplaceName && row.marketplaceName !== MARKET
    || !official(source.source) || source.pinned || compare(row.version, pluginVersion) === null || compare(row.version, pluginVersion) > 0) {
    return { state: "manual_required", channel: "plugin_cache", reason: "unverified_or_scoped_plugin" };
  }
  if (!verifyKeeper()) throw new Error("Active standalone Skill could not be verified");
  const executable = cli(audit.host, options), codex = audit.host === "codex";
  if (codex) {
    fs.mkdirSync(path.dirname(backup), { recursive: true, mode: 0o700 });
    if (fs.realpathSync(path.dirname(backup)) !== path.dirname(backup)) throw new Error("Linked cleanup directory");
    const root = pluginRoot(row, audit);
    if (fs.realpathSync(root) !== root) throw new Error("Linked plugin installation");
    const installedSkillVersion = version(path.join(root, "skills/qdmp-skill"));
    const compared = compare(installedSkillVersion, latest.version);
    if (compared === null || compared > 0) throw new Error("Installed plugin Skill version requires review");
    const installedRelease = compared === 0 ? options.checkout()
      : checkout({ version: installedSkillVersion, tag: `v${installedSkillVersion}` }, options.originalOptions);
    try {
      const digest = packageDigest(installedRelease.root);
      if (packageDigest(root) !== digest) throw new Error("Plugin package has local changes");
      if (!fs.existsSync(backup)) fs.cpSync(root, backup, { recursive: true });
      if (fs.realpathSync(backup) !== backup || packageDigest(backup) !== digest) throw new Error("Plugin cleanup backup mismatch");
    } finally {
      if (compared < 0) installedRelease.cleanup?.();
    }
  }
  const verb = codex ? "remove" : "disable";
  const args = ["plugin", verb, PLUGIN, ...(audit.host === "claude-code" ? ["--scope", "user"] : [])];
  command(executable, args, options);
  const remaining = inventory(audit.host, executable, options);
  if (!verifyKeeper() || (remaining && remaining.enabled !== false && remaining.disabled !== true)) throw new Error("Single-channel verification failed");
  if (codex) fs.rmSync(backup, { recursive: true });
  return { state: "retired", channel: "plugin_cache" };
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
  if (args.loadedVersion !== undefined && !STABLE.test(args.loadedVersion)) throw new Error("loaded version must be stable X.Y.Z");
  if (mode === "ensure") {
    const recovery = recoverPending(options.homeDir ?? os.homedir());
    if (recovery.state === "busy") return { mode, state: "update_busy", recovery, proceed_monitoring: false, telemetry_changed: false };
  }
  const audit = auditInstallation(args, options), result = { ...audit, mode, changes: [], telemetry_changed: false,
    session_version: args.loadedVersion };
  const localRelease = installedNotes(audit);
  if (localRelease) result.disk_release = localRelease;
  // A file replacement does not change the Skill instructions already loaded into a session.
  const diskAhead = compare(audit.loaded_version, args.loadedVersion) === 1;
  if (diskAhead && mode === "ensure") return noticeOnce(pendingDiskReload(result), audit, args, options,
    "reload_required", localRelease ?? { version: audit.loaded_version });
  const activeRelease = args.loadedVersion === audit.loaded_version ? localRelease : undefined;
  let latest;
  try { latest = await latestRelease(options, { allowUnavailableTelemetryPin: true }); if (!STABLE.test(latest?.version) || latest.tag !== `v${latest.version}`) throw new Error("Invalid stable release"); }
  catch (e) {
    const failed = { ...(diskAhead ? pendingDiskReload(result) : result), state: "release_check_failed",
      diagnostic: e.message, release_lookup: e.details, proceed_monitoring: false,
      instruction: "Do not install from an unknown release. Existing business tasks and authorized telemetry may continue unchanged." };
    return mode === "ensure" ? noticeOnce(failed, audit, args, options, "loaded", activeRelease) : failed;
  }
  result.latest = { version: latest.version, tag: latest.tag, telemetry_version: latest.distribution?.version,
    onboarding_sha256: latest.distribution?.onboarding?.sha256, lookup: latest.lookup,
    url: `${RELEASE_URL}/${latest.tag}`, highlights: latest.highlights ?? [] };
  if (latest.distribution_error) result.telemetry_pin_error = latest.distribution_error;
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
  result.duplicate_installations = row === undefined ? null
    : row !== null && row.enabled !== false && row.disabled !== true && audit.copies.some(c => c.channel === "personal");
  if (mode === "diagnose") return { ...(diskAhead ? pendingDiskReload(result) : result), state: "diagnosed", proceed_monitoring: false };
  const stateDir = path.join(options.homeDir ?? os.homedir(), ".qdmp-skill"); fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const lock = path.join(stateDir, "skill-update.lock"); let fd;
  try { fd = fs.openSync(lock, "wx", 0o600); fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, host: args.host, created_at: new Date().toISOString() })); fs.fsyncSync(fd); }
  catch (e) { if (e.code === "EEXIST") return { ...result, state: "update_busy", proceed_monitoring: false }; throw e; }
  let staged, stageError, pluginVersion;
  const updateOptions = { ...opts, originalOptions: opts, checkout: () => {
    if (stageError) throw stageError;
    try {
      if (!staged) { staged = checkout(latest, opts); pluginVersion = validateRelease(staged.root, latest); }
      return { root: staged.root, pluginVersion };
    }
    catch (error) { stageError = error; throw error; }
  } };
  try {
    // The lock may have been acquired after another invocation completed.
    const fresh = auditInstallation(args, options);
    if (compare(fresh.loaded_version, args.loadedVersion) === 1) {
      const diskRelease = installedNotes(fresh);
      const pending = pendingDiskReload({ ...result, ...fresh, disk_release: diskRelease });
      return noticeOnce(pending, fresh, args, options, "reload_required", diskRelease ?? { version: fresh.loaded_version });
    }
    try { row = inventory(audit.host, cli(audit.host, opts), opts); }
    catch { /* retain only prior absence proven from the same-host explicit registry */ if (row !== null) row = undefined; }
    const channel = loadedChannel(fresh, args);
    result.active_channel = channel;
    const loadedCurrent = compare(fresh.loaded_version, latest.version);
    const loadedStale = loadedCurrent === null || loadedCurrent < 0;
    const target = { version: result.latest.version, url: result.latest.url, highlights: result.latest.highlights };
    const verifyPersonal = () => {
      const personal = fresh.copies.find(copy => copy.channel === "personal");
      if (!personal || personal.linked || personal.version !== latest.version || fs.realpathSync(personal.root) !== personal.root) return null;
      const release = updateOptions.checkout();
      return directoryDigest(personal.root) === directoryDigest(path.join(release.root, "skills/qdmp-skill")) ? personal.root : null;
    };
    const runPlugin = (checkOnly = false) => {
      try { return row === undefined ? { state: "manual_required", reason: "inventory_unavailable" } : updatePlugin(row, fresh, latest, updateOptions, checkOnly); }
      catch (error) { return { state: "manual_required", diagnostic: error.message }; }
    };

    let pluginAtTarget;
    if (loadedStale && row) pluginAtTarget = runPlugin(true);
    let ready;
    if (loadedStale && channel !== "personal" && !(channel === "plugin_cache" && pluginAtTarget?.state === "current")) {
      try {
        const skillDir = verifyPersonal();
        if (skillDir) ready = { channel: "personal", skill_dir: skillDir };
      } catch { /* A copy that cannot be verified cannot be offered as ready. */ }
    }
    if (channel !== "plugin_cache" && pluginAtTarget?.state === "current" && !ready) {
      ready = { channel: "plugin_cache", skill_dir: path.join(pluginAtTarget.root, "skills/qdmp-skill") };
    }
    if (ready) {
      const outcome = { ...result, state: "switch_required", switch_to: { ...ready, version: latest.version },
        reload_required: false, reload_for_current: false, proceed_monitoring: false,
        instruction: "Load the verified installed Skill from the indicated channel before using new capabilities." };
      return noticeOnce(outcome, fresh, args, options, "switch_required", target);
    }

    result.personal_update = { state: "skipped" };
    result.plugin_update = row === null ? { state: "not_installed" } : { state: "skipped" };
    if (channel === "personal") {
      try { result.personal_update = updatePersonal(fresh, latest, updateOptions); }
      catch (error) { result.personal_update = { state: "manual_required", diagnostic: error.message }; }
    } else if (channel === "plugin_cache") {
      result.plugin_update = !pluginAtTarget || pluginAtTarget.state === "update_required" ? runPlugin() : pluginAtTarget;
    }
    for (const key of ["personal_update", "plugin_update"]) if (result[key].state === "updated") result.changes.push(key);

    let loadedMismatch = false;
    if (loadedCurrent === 0) {
      try {
        const release = updateOptions.checkout();
        result.loaded_content_verified = directoryDigest(fresh.loaded_skill) === directoryDigest(path.join(release.root, "skills/qdmp-skill"));
        loadedMismatch = !result.loaded_content_verified;
        if (loadedMismatch) result.loaded_diagnostic = "The actually loaded Skill differs from the published version. Preserve the copy and repair its original installation; do not run its onboarding.";
      } catch (error) { loadedMismatch = true; result.loaded_diagnostic = error.message; }
    }
    if (channel === "plugin_cache" || row === null) {
      try {
        result.removed_cache = pruneOlderQdmpCaches(fresh, latest, result.plugin_update,
          { ...options, loadedVerified: result.loaded_content_verified === true });
      } catch (error) { result.cache_cleanup_error = error.message; }
    }
    const pluginAlreadyUpdated = loadedStale && channel === "plugin_cache" && result.plugin_update.content_verified === true;
    const reloadRequired = result.changes.length > 0 || pluginAlreadyUpdated;
    const loadedNeedsRepair = loadedStale && !reloadRequired;
    const blocked = loadedMismatch || loadedNeedsRepair || [result.personal_update, result.plugin_update].some(r => r.state === "manual_required");
    if (loadedNeedsRepair) result.loaded_diagnostic = "The loaded Skill is stale. Refresh its original installation; do not run its old onboarding.";
    let keeperUnverified = false;
    const recheckKeeper = check => {
      let verified = false;
      try { verified = check(); return verified; }
      finally { if (!verified) keeperUnverified = true; }
    };
    if (args.loadedVersion === latest.version && result.loaded_content_verified && !blocked && !reloadRequired && channel !== "loaded_other") {
      const verifyMain = () => directoryDigest(fresh.loaded_skill) === directoryDigest(
        path.join(updateOptions.checkout().root, "skills/qdmp-skill"));
      try {
        const cleanup = channel === "personal"
          ? retirePlugin(row, fresh, latest, updateOptions, () => recheckKeeper(verifyMain))
          : result.plugin_update.content_verified && path.join(result.plugin_update.root, "skills/qdmp-skill") === fresh.loaded_skill
            ? retirePersonal(fresh, latest, updateOptions, () => recheckKeeper(() => {
              const active = inventory(fresh.host, cli(fresh.host, opts), opts);
              return active?.enabled === true && active.disabled !== true && active.version === result.plugin_update.version
                && pluginRoot(active, fresh) === result.plugin_update.root && verifyMain()
                && packageDigest(result.plugin_update.root) === packageDigest(updateOptions.checkout().root);
            })) : null;
        if (cleanup) result.channel_cleanup = cleanup;
        if (cleanup?.state === "retired") result.duplicate_installations = false;
      } catch (error) {
        result.channel_cleanup = { state: "manual_required", channel: channel === "personal" ? "plugin_cache" : "personal",
          diagnostic: error.message };
      }
    }
    const outcome = { ...result, state: blocked ? "manual_required" : reloadRequired ? "reload_required" : "current",
      reload_required: reloadRequired, reload_for_current: reloadRequired,
      proceed_monitoring: !latest.distribution_error && !blocked && !reloadRequired && !keeperUnverified,
      instruction: blocked || keeperUnverified ? "Inspect the channel that provides the loaded Skill before running onboarding. Business tasks may continue."
        : reloadRequired ? "The selected installation is updated. Reload the host before using the new Skill."
        : latest.distribution_error ? "The Skill release is verified, but the Telemetry pin is unavailable. Continue business work and existing authorized collection; skip new Telemetry onboarding."
        : "Use current compatible flows only; retain old consent evidence without replay." };
    if (reloadRequired) return noticeOnce(outcome, fresh, args, options, "reload_required", target);
    if (loadedCurrent === -1) return noticeOnce(outcome, fresh, args, options, "available", target);
    const cleanupNotice = result.channel_cleanup
      ? noticeOnce(outcome, fresh, args, options, result.channel_cleanup.state === "retired" ? "channel_retired" : "cleanup_required", target)
      : outcome;
    const activated = noticeOnce(outcome, fresh, args, options, "loaded", loadedMismatch ? undefined : activeRelease);
    return activated.update_notice ? activated : cleanupNotice;
  } finally { try { staged?.cleanup?.(); } finally { fs.closeSync(fd); fs.unlinkSync(lock); } }
}
export async function main(argv) {
  const [mode, ...tokens] = argv, args = {}, options = {};
  const allowed = { "--host": "host", "--cwd": "cwd", "--skill-dir": "skillDir", "--loaded-version": "loadedVersion", "--command": "hostCommand" };
  for (let i = 0; i < tokens.length; i += 2) {
    const key = allowed[tokens[i]], value = tokens[i + 1];
    if (!key || !value || value.startsWith("--") || Object.hasOwn(args, key) || Object.hasOwn(options, key)) throw new Error("unknown, duplicate or missing argument");
    (key === "hostCommand" ? options : args)[key] = value;
  }
  return ensureCurrent(mode, args, options);
}
if (process.argv[1] && fs.existsSync(process.argv[1]) && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2))
  .then(r => console.log(JSON.stringify(r, null, 2))).catch(e => { console.error(JSON.stringify({ error: e.message })); process.exitCode = 1; });
