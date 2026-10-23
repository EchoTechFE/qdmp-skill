// Workflow gates only; the pinned telemetry entry owns installation/activation.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import https from "node:https";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkDistribution, coldStartNotice } from "./monitor-preflight.mjs";
import { flowCompatibility } from "./ensure-current.mjs";

const digest = value => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const transitions = {
  awaiting_consent: ["authorize"], authorized: ["fetch"], entry_verified: ["inspect"],
  choice_ready: ["inspect", "execute"], check_failed: ["inspect"], action_confirmation_required: ["inspect", "confirm-action"], activation_reported: ["verify"],
  verification_pending: ["verify"], collecting: ["verify"],
  declined: [], needs_reconfirmation: ["inspect"], failed: ["verify"], executing: ["verify"]
};
const immutable = s => ({ schema: s.schema, id: s.id, directory: s.directory, host: s.host,
  manifest_digest: s.manifest_digest, disclosure_digest: s.disclosure_digest, directory_identity: s.directory_identity });
function write(file, value) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  fs.renameSync(temp, file);
}
function bindingCheck(s) {
  const release = checkDistribution();
  if (digest(release) !== s.manifest_digest) throw new Error("release or disclosure changed; new notice and authorization required");
  if (fs.realpathSync(s.directory) !== s.directory) throw new Error("directory identity changed; new authorization required");
  const stat = fs.statSync(s.directory);
  if (stat.dev !== s.directory_identity.dev || stat.ino !== s.directory_identity.ino) throw new Error("directory identity changed; new authorization required");
  return release;
}
function entryCheck(dir, release) {
  const entry = path.join(dir, "onboarding.mjs");
  if (fs.lstatSync(entry).isSymbolicLink() || digest(fs.readFileSync(entry)) !== release.onboarding.sha256) throw new Error("onboarding checksum mismatch");
  return entry;
}
function run(entry, argv, s, options) {
  if (options.run) return options.run(entry, argv, s);
  const result = spawnSync(process.execPath, [entry, ...argv], { cwd: s.directory, encoding: "utf8", windowsHide: true, timeout: ["enable", "update"].includes(argv[0]) ? 600000 : 180000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || `exit ${result.status}`).slice(0, 3000));
  return JSON.parse(result.stdout);
}
export function downloadPinned(url, redirects = 0) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || redirects > 5) throw new Error("unsafe download URL");
  return new Promise((resolve, reject) => {
    const request = https.get(parsed, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume();
        if (!response.headers.location) return reject(new Error("redirect has no location"));
        try { resolve(downloadPinned(new URL(response.headers.location, parsed).href, redirects + 1)); } catch (e) { reject(e); }
        return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`download HTTP ${response.statusCode}`)); return; }
      const chunks = []; let bytes = 0;
      response.on("data", chunk => {
        bytes += chunk.length;
        if (bytes > 20 * 1024 * 1024) response.destroy(new Error("onboarding exceeds size limit"));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.setTimeout(30000, () => request.destroy(new Error("download timeout")));
    request.on("error", reject);
  });
}
const queryArgs = s => ["--cwd", s.directory, "--host", s.host, "--exact-workspace"];
const fingerprint = notice => digest({ root: notice.project_root, host: notice.host,
  exact: notice.exact_workspace, endpoint: notice.upload_endpoint,
  installation: { state: notice.status?.plugin_state, root: notice.status?.installation?.root,
    version: notice.status?.installed_version, recommended: notice.status?.recommended_version,
    compatible: notice.status?.compatible, granted: notice.status?.project?.granted }, choices: notice.choices });

function verifyNotice(notice, s, release) {
  if (notice.project_root !== s.directory || notice.host !== s.host || notice.exact_workspace !== true) throw new Error("directory/host scope mismatch");
  if (notice.upload_endpoint !== release.pre_download_notice.upload_endpoint || notice.legal !== release.pre_download_notice.legal) throw new Error("endpoint or legal disclosure mismatch");
  if (notice.distribution?.version !== release.version || notice.distribution?.artifact_sha256 !== release.artifact_sha256
    || notice.status?.recommended_version !== release.version) throw new Error("pinned version or artifact mismatch");
}
function safeChoice(notice, s, release, selected = null) {
  const choice = selected ? notice.choices?.find(c => c.action === selected) : notice.choices?.find(c => c.action === "install") || notice.choices?.find(c => c.action === "reuse");
  if (!choice) throw new Error("no authorized install/reuse choice; update or unknown state requires new disclosure");
  const installed = notice.status?.installed_version;
  if (choice.action === "install" && notice.status?.plugin_state !== "missing") throw new Error("installation state changed");
  if (choice.action === "reuse" && (notice.status?.plugin_state !== "installed" || !notice.status?.compatible)) throw new Error("reuse requires a compatible installed version");
  if (choice.action.startsWith("update") && (notice.status?.plugin_state !== "installed" || notice.status?.version_status !== "update_available" || choice.expected_version !== installed)) throw new Error("update requires a verified older installation");
  if (choice.target_version !== release.version || (choice.action === "reuse" && choice.expected_version !== installed)) throw new Error("choice version mismatch");
  const expectedPermissions = choice.action === "update" ? ["update"] : [...(choice.action === "install" ? ["install"] : choice.action === "update_and_enable" ? ["update"] : []), "monitor_current_workspace", "production_upload"];
  if (JSON.stringify(choice.permissions) !== JSON.stringify(expectedPermissions)) throw new Error("choice permissions mismatch");
  const argv = choice.argv;
  if (!Array.isArray(argv) || argv[0] !== (choice.action === "update" ? "update" : "enable") || argv.some(x => typeof x !== "string")) throw new Error("invalid central argv");
  const flags = {}; const boolean = new Set(["--accept-monitoring", "--accept-update", "--exact-workspace"]);
  const values = new Set(["--cwd", "--host", "--authorization-version", "--expected-version", "--target-version", "--artifact-url"]);
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i];
    if (Object.hasOwn(flags, key)) throw new Error("duplicate central option");
    if (boolean.has(key)) flags[key] = true;
    else if (values.has(key) && argv[i + 1] && !argv[i + 1].startsWith("--")) flags[key] = argv[++i];
    else throw new Error("unexpected central option");
  }
  const protocol = choice.action === "update" ? null : choice.action === "update_and_enable" ? "update-monitor-production-v1" : choice.action === "install" ? "install-monitor-production-v1" : "monitor-production-v1";
  if (flags["--cwd"] !== s.directory || flags["--host"] !== s.host || !flags["--exact-workspace"] || !flags[choice.action === "update" ? "--accept-update" : "--accept-monitoring"]
    || Boolean(flags[choice.action === "update" ? "--accept-monitoring" : "--accept-update"])
    || (flags["--authorization-version"] || null) !== protocol || choice.authorization_version !== protocol
    || (flags["--expected-version"] || null) !== (installed || null)
    || (choice.action.startsWith("update") ? flags["--target-version"] !== release.version : flags["--target-version"] && flags["--target-version"] !== release.version)
    || (flags["--artifact-url"] && flags["--artifact-url"] !== release.artifact_url)) throw new Error("central argv scope/version mismatch");
  return choice;
}

function hookInstruction(host, result) {
  const project = result.project || result.status || {};
  if (result.native_hooks_verified === true || project.state === "collecting") return "Native Hooks verified; production warehouse readback remains separate. No restart required.";
  const action = result.next_action || project.next_action;
  if (host === "codex" && action === "review_host_hooks") return "Review and trust agent-runtime-telemetry in Codex Settings > Hooks. A plugin cannot grant trust to itself. Only after trust, fully restart Codex Desktop if requested by the host, resume this conversation and verify normal prompt/tool events in this same surface.";
  if (result.restart_required === true || action === "reload_host") return `Fully restart ${host}, resume this conversation and verify native prompt/tool events. Do not repeat business consent.`;
  return `Observe a normal prompt and tool event in ${host}, then verify again. Do not infer capture from registration or restart without host evidence.`;
}

export async function monitorFlow(command, args = {}, options = {}) {
  const home = options.homeDir ?? os.homedir();
  const base = path.join(home, ".qdmp-skill", "monitor-flows");
  if (command === "list") {
    if (!path.isAbsolute(args.cwd || "") || !["codex", "claude-code", "qoder"].includes(args.host)) throw new Error("absolute directory and supported host required");
    const directory = fs.realpathSync(args.cwd);
    if (!fs.existsSync(base)) return { flows: [] };
    const release = checkDistribution();
    const flows = fs.readdirSync(base).filter(id => /^[a-f0-9-]{36}$/.test(id)).map(id => JSON.parse(fs.readFileSync(path.join(base, id, "state.json"), "utf8")))
      .filter(s => s.directory === directory && s.host === args.host)
      .map(s => { const compatibility = flowCompatibility(s, release, path.join(base, s.id));
        return { id: s.id, state: s.state, directory: s.directory, host: s.host, created_at: s.created_at,
          compatibility, allowed_actions: compatibility.current ? transitions[s.state] || [] : [] }; });
    return { flows };
  }
  if (command === "begin") {
    const disclosure = coldStartNotice({ cwd: args.cwd, host: args.host });
    const directory = fs.realpathSync(args.cwd);
    if (directory !== args.cwd) throw new Error("use the canonical absolute directory before disclosing scope");
    const release = checkDistribution(); const id = crypto.randomUUID(); const stat = fs.statSync(directory);
    const s = { schema: 1, id, state: "awaiting_consent", directory, host: args.host,
      manifest_digest: digest(release), disclosure_digest: digest(disclosure), directory_identity: { dev: stat.dev, ino: stat.ino }, created_at: new Date().toISOString(), history: [] };
    const dir = path.join(base, id); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    s.binding_digest = digest(immutable(s)); write(path.join(dir, "state.json"), s);
    return { ...s, allowed_actions: transitions[s.state], disclosure, instruction: "Show only disclosure.display as the user-facing authorization copy, including its full-notice link. Do not print disclosure.consent or other fields separately. Ask for one explicit decision, then record it with authorize and this disclosure_digest; do not ask again when the inspected action remains within the authorized scope." };
  }
  if (!/^[a-f0-9-]{36}$/.test(args.flow || "")) throw new Error("valid flow ID required");
  const dir = path.join(base, args.flow); const file = path.join(dir, "state.json");
  const lock = path.join(dir, ".lock");
  let fd;
  try { fd = fs.openSync(lock, "wx", 0o600); } catch (e) { if (e.code === "EEXIST") throw new Error("flow busy; do not retry concurrently"); throw e; }
  try {
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    if (s.id !== args.flow || s.schema !== 1 || s.binding_digest !== digest(immutable(s))) throw new Error("flow binding corrupted");
    if (command === "status") {
      const compatibility = flowCompatibility(s, checkDistribution(), dir);
      return { ...s, compatibility, allowed_actions: compatibility.current ? transitions[s.state] || [] : [] };
    }
    if (!transitions[s.state]?.includes(command)) throw new Error(`invalid transition: ${s.state} -> ${command}`);
    const release = bindingCheck(s);
    if (!["authorize", "verify"].includes(command) && (s.decision !== "approve" || !s.authorized_at)) throw new Error("no recorded explicit authorization");
    const next = (state, detail = {}) => {
      s.history.push({ from: s.state, action: command, to: state, at: new Date().toISOString() });
      Object.assign(s, detail, { state }); write(file, s);
      return { ...s, allowed_actions: transitions[state] || [] };
    };
    if (command === "authorize") {
      if (args.digest !== s.disclosure_digest || !["approve", "decline"].includes(args.decision)) throw new Error("explicit decision and matching disclosure digest required");
      return next(args.decision === "approve" ? "authorized" : "declined", { decision: args.decision, authorized_at: args.decision === "approve" ? new Date().toISOString() : null });
    }
    if (command === "fetch") {
      const stored = path.join(dir, "onboarding.mjs");
      if (fs.existsSync(stored)) {
        entryCheck(dir, release);
        return next("entry_verified", { instruction: "Recovered the already downloaded, checksum-verified entry; original authorization is unchanged." });
      }
      const content = await (options.download ?? downloadPinned)(release.onboarding.url);
      if (!content.length || content.length > 20 * 1024 * 1024 || digest(content) !== release.onboarding.sha256) throw new Error("onboarding checksum/size mismatch; execution blocked");
      const temporary = path.join(dir, `onboarding.${crypto.randomUUID()}.tmp`);
      const entryFd = fs.openSync(temporary, "wx", 0o600);
      try { fs.writeFileSync(entryFd, content); fs.fsyncSync(entryFd); } finally { fs.closeSync(entryFd); }
      fs.renameSync(temporary, stored);
      return next("entry_verified");
    }
    const entry = entryCheck(dir, release);
    const inspect = () => {
      const help = run(entry, ["help"], s, options);
      if (!help.usage?.includes("--exact-workspace")) throw new Error("entry lacks exact directory support");
      const notice = run(entry, ["notice", ...queryArgs(s)], s, options);
      verifyNotice(notice, s, release);
      return notice;
    };
    if (command === "inspect") {
      let notice;
      try { notice = inspect(); }
      catch (error) {
        if (/mismatch|checksum|scope|exact directory support/.test(error.message)) throw error;
        return next("check_failed", { reason: error.message, instruction: "Read-only inspection failed. Retry inspect after resolving the error; retain existing consent and never install from unknown state." });
      }
      if (notice.status?.plugin_state === "unknown") return next("check_failed", { notice, diagnostic: notice.status.diagnostic, error_code: notice.status.error_code, phase: notice.status.phase, instruction: "Installation check failed, not missing or refused. Retry inspect; do not request monitoring consent again." });
      if (notice.status?.project?.granted === true && notice.status?.plugin_state === "installed" && notice.status?.compatible) {
        return next("verification_pending", { notice, choice: null, verification: notice.status, warehouse: "not_verified", instruction: "Existing authorization detected; verify without repeating activation." });
      }
      try {
        const choice = safeChoice(notice, s, release);
        if (choice.action === "reuse" && choice.expected_version !== release.version) return next("action_confirmation_required", { notice, action_digest: digest({ inventory: fingerprint(notice), choice }), proposed_action: "reuse", instruction: "Display the compatible installed version, directory and monitoring permissions, then obtain explicit approval for reusing this different version. No update or downgrade is permitted." });
        return next("choice_ready", { choice, notice, inventory_digest: fingerprint(notice), instruction: "The authorization is saved for this exact directory. Missing qdmp.json or appId does not invalidate it. If QDMP login is unfinished, leave this flow at choice_ready, continue project creation, then resume from status and execute after login; no second monitoring consent is needed." });
      }
      catch (error) {
        const update = notice.choices?.find(c => c.action === "update_and_enable") || notice.choices?.find(c => c.action === "update");
        if (update) {
          try { safeChoice(notice, s, release, update.action); }
          catch (invalid) { return next("needs_reconfirmation", { reason: invalid.message, notice }); }
          return next("action_confirmation_required", { notice, action_digest: digest({ inventory: fingerprint(notice), choice: update }), proposed_action: update.action,
            instruction: "Display notice.consent, legal and the proposed action with current/target versions and permissions. Obtain explicit update approval, then confirm-action using the returned action_digest. Prior monitoring consent does not authorize an update." });
        }
        return next("needs_reconfirmation", { reason: error.message, diagnostic: notice.status?.diagnostic, notice });
      }
    }
    if (command === "confirm-action") {
      if (args.decision !== "approve" || args.digest !== s.action_digest) throw new Error("explicit update approval and matching action digest required");
      const notice = inspect(); const choice = safeChoice(notice, s, release, s.proposed_action);
      if (digest({ inventory: fingerprint(notice), choice }) !== s.action_digest) return next("needs_reconfirmation", { reason: "update action changed; inspect and disclose again" });
      return next("choice_ready", { notice, choice, inventory_digest: fingerprint(notice), action_approved_at: new Date().toISOString() });
    }
    if (command === "execute") {
      let notice;
      try { notice = inspect(); } catch (error) { return next("check_failed", { reason: error.message }); }
      if (notice.status?.plugin_state === "unknown") return next("check_failed", { diagnostic: notice.status.diagnostic, notice });
      if (fingerprint(notice) !== s.inventory_digest) return next("needs_reconfirmation", { reason: "live installation/authorization/options changed" });
      const choice = safeChoice(notice, s, release, s.choice?.action);
      if ((choice.action.startsWith("update") || choice.action === "reuse" && choice.expected_version !== release.version) && (!s.action_approved_at || digest({ inventory: fingerprint(notice), choice }) !== s.action_digest)) throw new Error("action authorization missing or changed");
      // Persist before mutation: a crash or failed command must never auto-replay.
      next("executing");
      try {
        const argv = [...choice.argv];
        if (!argv.includes("--artifact-url")) argv.push("--artifact-url", release.artifact_url);
        const result = run(entry, argv, s, options);
        return next("activation_reported", { execution_result: result, instruction: hookInstruction(s.host, result) });
      } catch (error) { return next("failed", { reason: error.message, instruction: "Inspect live state before a new flow; never auto-replay an ambiguous mutation." }); }
    }
    if (command === "verify") {
      const result = run(entry, ["status", ...queryArgs(s)], s, options);
      const expected = s.choice?.action === "reuse" ? s.choice.expected_version : s.notice?.status?.installed_version && !s.choice ? s.notice.status.installed_version : release.version;
      if (result.project_root !== s.directory || result.host !== s.host || result.installed_version !== expected || !result.compatible) throw new Error("live runtime scope/version mismatch");
      const collecting = result.project?.granted === true && result.project?.state === "collecting";
      return next(collecting ? "collecting" : "verification_pending", { verification: result, warehouse: "not_verified", instruction: hookInstruction(s.host, result) });
    }
    throw new Error("unsupported flow command");
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}

export async function runFlow(argv, options = {}) {
  const [command, ...tokens] = argv;
  const accepted = ["begin", "list"].includes(command) ? new Set(["--cwd", "--host"])
    : ["authorize", "confirm-action"].includes(command) ? new Set(["--flow", "--decision", "--digest"]) : new Set(["--flow"]);
  const args = {};
  for (let i = 0; i < tokens.length; i++) {
    const flag = tokens[i]; const value = tokens[++i];
    if (!accepted.has(flag) || !value || value.startsWith("--") || Object.hasOwn(args, flag.slice(2))) throw new Error("unknown, duplicate or missing flow option");
    args[flag.slice(2)] = value;
  }
  return monitorFlow(command, args, options);
}
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  runFlow(process.argv.slice(2)).then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
}
