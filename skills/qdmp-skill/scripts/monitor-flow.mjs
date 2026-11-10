// Workflow gates only; the pinned telemetry entry owns installation/activation.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import https from "node:https";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkDistribution, coldStartNotice } from "./monitor-preflight.mjs";
import { flowCompatibility, latestRelease } from "./ensure-current.mjs";
import { hookFollowup, runtimeStatus } from "./monitor-runtime-status.mjs";

const digest = value => crypto.createHash("sha256").update(typeof value === "string" || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest("hex");
const transitions = {
  awaiting_consent: ["authorize"], authorized: ["fetch", "fetch-install", "fetch-reuse"], entry_verified: ["inspect"],
  choice_ready: ["inspect", "execute"], check_failed: ["inspect"], action_confirmation_required: ["inspect", "confirm-action"], activation_reported: ["verify"],
  verification_pending: ["verify", "resume"], collecting: ["verify"],
  declined: [], needs_reconfirmation: ["inspect"], failed: ["verify", "resume"], executing: ["verify"]
};
const legacyLoginFailure = value => /QDMP_LOGIN_REQUIRED|开启数据采集前需要登录千岛/.test(value || "");
const allowedActions = s => (transitions[s.state] || []).filter(action => action !== "resume"
  || s.choice?.action === "reuse" && !s.execution_result && legacyLoginFailure(s.reason));
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
function run(entry, argv, s, options, timeout = ["enable", "update"].includes(argv[0]) ? 600000 : 180000) {
  if (options.run) return options.run(entry, argv, s);
  const result = spawnSync(process.execPath, [entry, ...argv], { cwd: s.directory, encoding: "utf8", windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 });
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
const reuseNeedsApproval = (choice, release) => choice.action === "reuse" && choice.expected_version !== release.version
  && release.pre_download_notice.permitted_action !== "install_if_missing_or_reuse_compatible_version";

function verifyNotice(notice, s, release) {
  if (notice.project_root !== s.directory || notice.host !== s.host || notice.exact_workspace !== true) throw new Error("directory/host scope mismatch");
  if (notice.upload_endpoint !== release.pre_download_notice.upload_endpoint || notice.legal !== release.pre_download_notice.legal) throw new Error("endpoint or legal disclosure mismatch");
  if (notice.distribution?.version !== release.version || notice.distribution?.artifact_sha256 !== release.artifact_sha256
    || notice.status?.recommended_version !== release.version) throw new Error("pinned version or artifact mismatch");
}
function safeChoice(notice, s, release, selected = null) {
  const choice = selected ? notice.choices?.find(c => c.action === selected) : notice.choices?.find(c => c.action === "install") || notice.choices?.find(c => c.action === "reuse");
  if (!choice) throw new Error("no authorized install/reuse choice; update or unknown state requires new disclosure");
  if (s.install_only && choice.action !== "install") throw new Error("install-only flow requires a missing plugin verified by the host");
  if (s.reuse_only && (choice.action !== "reuse" || !notice.status?.installation?.root)) {
    throw new Error("reuse-only flow requires a compatible runtime verified by the host");
  }
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
  const values = new Set(["--cwd", "--host", "--authorization-version", "--identity-notice-version", "--expected-version", "--target-version", "--artifact-url"]);
  for (let i = 1; i < argv.length; i++) {
    const key = argv[i];
    if (Object.hasOwn(flags, key)) throw new Error("duplicate central option");
    if (boolean.has(key)) flags[key] = true;
    else if (values.has(key) && argv[i + 1] && !argv[i + 1].startsWith("--")) flags[key] = argv[++i];
    else throw new Error("unexpected central option");
  }
  const protocol = choice.action === "update" ? null : choice.action === "update_and_enable" ? "update-monitor-production-v1" : choice.action === "install" ? "install-monitor-production-v1" : "monitor-production-v1";
  const identityNotice = choice.identity_notice_version || null;
  if (identityNotice && (!protocol || identityNotice !== release.pre_download_notice.identity_notice_version)) throw new Error("identity notice was not disclosed by the pinned release");
  if (flags["--cwd"] !== s.directory || flags["--host"] !== s.host || !flags["--exact-workspace"] || !flags[choice.action === "update" ? "--accept-update" : "--accept-monitoring"]
    || Boolean(flags[choice.action === "update" ? "--accept-monitoring" : "--accept-update"])
    || (flags["--authorization-version"] || null) !== protocol || choice.authorization_version !== protocol
    || (flags["--identity-notice-version"] || null) !== identityNotice
    || (flags["--expected-version"] || null) !== (installed || null)
    || (choice.action.startsWith("update") ? flags["--target-version"] !== release.version : flags["--target-version"] && flags["--target-version"] !== release.version)
    || (flags["--artifact-url"] && flags["--artifact-url"] !== release.artifact_url)) throw new Error("central argv scope/version mismatch");
  return choice;
}

function hookInstruction(host, result, directory) {
  const project = result.project || result.status || {};
  if (result.native_hooks_verified === true || project.state === "collecting") return "Native Hooks verified; production warehouse readback remains separate. No restart required.";
  const hooks = project.hooks || result.hooks;
  const workspace = `First confirm the chat's bound workspace is ${directory}; a shell command's cwd does not rebind the chat. `;
  if (hookFollowup(project)?.action === "review") {
    return workspace + "The host reports a Hook needs review. Follow references/hook-review.md for the installed IDE version and resume verification in the same chat after the user confirms.";
  }
  if (hooks?.prompt_seen || hooks?.tool_seen) return workspace + `Native ${hooks.prompt_seen ? "prompt" : "tool"} evidence exists. Observe the missing ${hooks.prompt_seen ? "tool completion" : "prompt"} in that workspace, then verify. Missing one event does not prove a trust or restart problem. Production warehouse readback remains separate.`;
  const action = result.next_action || project.next_action;
  if (result.restart_required === true || action === "reload_host") return workspace + `The host reports a reload requirement. Restart ${host}, resume the flow and verify native prompt/tool events. Do not repeat business consent.`;
  return workspace + `Observe a normal prompt and tool completion in ${host}. If still missing, inspect the actual host's Hook controls and diagnostics; a plugin cannot grant trust to itself. Trust status is unknown unless the host reports it. Restart only if requested by the host; do not invent a Settings path, transfer CLI trust to Desktop, or repeat restart requests from missing events alone. Continue business work while verification is pending.`;
}

export async function monitorFlow(command, args = {}, options = {}) {
  const home = options.homeDir ?? os.homedir();
  const base = path.join(home, ".qdmp-skill", "monitor-flows");
  if (command === "local-status" || command === "preview") {
    const { host, cwd: directory } = args;
    if (!path.isAbsolute(directory || "") || !["codex", "claude-code", "qoder"].includes(host)) throw new Error("absolute directory and supported host required");
    const stat = fs.statSync(directory);
    if (fs.realpathSync(directory) !== directory || !stat.isDirectory()) throw new Error("use the canonical absolute directory");
    if (command === "local-status") return runtimeStatus(directory, host, home, checkDistribution().version, options.runRuntime);
    const disclosure = coldStartNotice(args);
    const preview_digest = digest({ disclosure, dev: stat.dev, ino: stat.ino });
    return { directory, host, disclosure: { display: disclosure.display }, disclosure_digest: digest(disclosure), preview_digest };
  }
  if (command === "list") {
    if (!path.isAbsolute(args.cwd || "") || !["codex", "claude-code", "qoder"].includes(args.host)) throw new Error("absolute directory and supported host required");
    const directory = fs.realpathSync(args.cwd);
    if (!fs.existsSync(base)) return { flows: [] };
    const release = checkDistribution();
    const flows = fs.readdirSync(base).filter(id => /^[a-f0-9-]{36}$/.test(id)).map(id => JSON.parse(fs.readFileSync(path.join(base, id, "state.json"), "utf8")))
      .filter(s => s.directory === directory && s.host === args.host)
      .map(s => { const compatibility = flowCompatibility(s, release, path.join(base, s.id));
        return { id: s.id, state: s.state, directory: s.directory, host: s.host, created_at: s.created_at,
          compatibility, allowed_actions: compatibility.current ? allowedActions(s) : [] }; });
    return { flows };
  }
  if (command === "begin") {
    const disclosure = coldStartNotice({ cwd: args.cwd, host: args.host });
    const directory = fs.realpathSync(args.cwd);
    if (directory !== args.cwd) throw new Error("use the canonical absolute directory before disclosing scope");
    const release = checkDistribution(); const id = crypto.randomUUID(); const stat = fs.statSync(directory);
    if (args.preview && args.preview !== digest({ disclosure, dev: stat.dev, ino: stat.ino })) {
      throw new Error("notice or directory changed; present the current notice before accepting a decision");
    }
    const s = { schema: 1, id, state: "awaiting_consent", directory, host: args.host,
      manifest_digest: digest(release), disclosure_digest: digest(disclosure), directory_identity: { dev: stat.dev, ino: stat.ino }, created_at: new Date().toISOString(), history: [] };
    const dir = path.join(base, id); fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    s.binding_digest = digest(immutable(s)); write(path.join(dir, "state.json"), s);
    return { ...s, allowed_actions: allowedActions(s), disclosure, instruction: "Show only disclosure.display as the user-facing authorization copy, including its full-notice link. Do not print disclosure.consent or other fields separately. Ask for one explicit decision, then record it with authorize and this disclosure_digest; do not ask again when the inspected action remains within the authorized scope." };
  }
  if (!/^[a-f0-9-]{36}$/.test(args.flow || "")) throw new Error("valid flow ID required");
  const dir = path.join(base, args.flow); const file = path.join(dir, "state.json");
  if (command === "status" || command === "probe") {
    // State commits are atomic renames. A snapshot needs no writable lock.
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    if (s.id !== args.flow || s.schema !== 1 || s.binding_digest !== digest(immutable(s))) throw new Error("flow binding corrupted");
    if (command === "probe") {
      if (s.state !== "collecting" || s.decision !== "approve" || !s.authorized_at) {
        throw new Error("live probe requires a previously verified, explicitly authorized flow");
      }
      const release = bindingCheck(s);
      const entry = entryCheck(dir, release);
      const result = run(entry, ["status", ...queryArgs(s)], s, options, 5000);
      if (result.project_root !== s.directory || result.host !== s.host || result.compatible !== true ||
          typeof result.project?.granted !== "boolean" || typeof result.project.state !== "string") {
        throw new Error("live monitoring status could not be verified for this directory and host");
      }
      return { live: true, id: s.id, directory: s.directory, host: s.host,
        state: result.project.state, granted: result.project.granted,
        next_action: result.project.next_action ?? result.next_action };
    }
    const compatibility = flowCompatibility(s, checkDistribution(), dir);
    return { ...s, compatibility, allowed_actions: compatibility.current ? allowedActions(s) : [] };
  }
  const lock = path.join(dir, ".lock");
  let fd;
  try { fd = fs.openSync(lock, "wx", 0o600); } catch (e) { if (e.code === "EEXIST") throw new Error("flow busy; do not retry concurrently"); throw e; }
  try {
    const s = JSON.parse(fs.readFileSync(file, "utf8"));
    if (s.id !== args.flow || s.schema !== 1 || s.binding_digest !== digest(immutable(s))) throw new Error("flow binding corrupted");
    if (!transitions[s.state]?.includes(command)) throw new Error(`invalid transition: ${s.state} -> ${command}`);
    const release = bindingCheck(s);
    if (!["authorize", "verify"].includes(command) && (s.decision !== "approve" || !s.authorized_at)) throw new Error("no recorded explicit authorization");
    const next = (state, detail = {}) => {
      s.history.push({ from: s.state, action: command, to: state, at: new Date().toISOString() });
      if (["choice_ready", "activation_reported", "collecting"].includes(state)) {
        for (const key of ["reason", "diagnostic", "error_code", "phase"]) delete s[key];
      }
      Object.assign(s, detail, { state }); write(file, s);
      return { ...s, allowed_actions: allowedActions(s) };
    };
    if (command === "authorize") {
      if (args.digest !== s.disclosure_digest || !["approve", "decline"].includes(args.decision)) throw new Error("explicit decision and matching disclosure digest required");
      return next(args.decision === "approve" ? "authorized" : "declined", { decision: args.decision, authorized_at: args.decision === "approve" ? new Date().toISOString() : null });
    }
    if (["fetch", "fetch-install", "fetch-reuse"].includes(command)) {
      const reuseOnly = command === "fetch-reuse";
      const installOnly = command === "fetch-install";
      if (reuseOnly || installOnly) {
        if (reuseOnly && release.pre_download_notice.permitted_action !== "install_if_missing_or_reuse_compatible_version") {
          throw new Error("original disclosure does not permit independent compatible reuse");
        }
        const published = await latestRelease(options);
        if (digest(published.distribution) !== s.manifest_digest) {
          throw new Error("published collection release no longer matches this flow");
        }
      }
      const restrictions = { reuse_only: reuseOnly, install_only: installOnly };
      const stored = path.join(dir, "onboarding.mjs");
      if (fs.existsSync(stored)) {
        entryCheck(dir, release);
        return next("entry_verified", { ...restrictions, instruction: "Recovered the already downloaded, checksum-verified entry; original authorization is unchanged." });
      }
      const content = await (options.download ?? downloadPinned)(release.onboarding.url);
      if (!content.length || content.length > 20 * 1024 * 1024 || digest(content) !== release.onboarding.sha256) throw new Error("onboarding checksum/size mismatch; execution blocked");
      const temporary = path.join(dir, `onboarding.${crypto.randomUUID()}.tmp`);
      const entryFd = fs.openSync(temporary, "wx", 0o600);
      try { fs.writeFileSync(entryFd, content); fs.fsyncSync(entryFd); } finally { fs.closeSync(entryFd); }
      fs.renameSync(temporary, stored);
      return next("entry_verified", restrictions);
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
        const choice = safeChoice(notice, s, release, s.reuse_only ? "reuse" : s.install_only ? "install" : null);
        if (reuseNeedsApproval(choice, release)) return next("action_confirmation_required", { notice, action_digest: digest({ inventory: fingerprint(notice), choice }), proposed_action: "reuse", instruction: "Display the compatible installed version, directory and monitoring permissions, then obtain explicit approval for reusing this different version. No update or downgrade is permitted." });
        return next("choice_ready", { choice, notice, inventory_digest: fingerprint(notice), instruction: "The authorization is saved for this exact directory. Missing qdmp.json, appId or login does not invalidate it. Current runtimes allow anonymous activation. Only follow login requirements explicitly reported by a legacy runtime; retain this flow and continue business work without a second monitoring consent." });
      }
      catch (error) {
        if (s.reuse_only || s.install_only) return next("needs_reconfirmation", { reason: error.message, notice });
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
    if (command === "resume") {
      // Legacy runtimes gated consent on login. Only that known pre-consent
      // failure may resume, and only as reuse of the already approved runtime.
      // Unknown failures/crashes remain verification-only: never replay install.
      if (s.execution_result || s.choice?.action !== "reuse" || !legacyLoginFailure(s.reason)) throw new Error("resume requires a known pre-consent login failure on reuse; verify ambiguous mutations only");
      const notice = inspect(); const receipt = notice.status?.receipt;
      const version = s.choice.action === "reuse" ? s.choice.expected_version : release.version;
      if (notice.status?.project?.granted !== false || receipt?.status !== "activation_pending"
        || receipt.project_root !== s.directory || receipt.host !== s.host || receipt.exact_workspace !== true
        || receipt.accepted !== true || receipt.agreement !== s.choice.authorization_version
        || !receipt.authorization_id || receipt.version !== version || !legacyLoginFailure(receipt.error)) {
        throw new Error("pending activation does not prove the same pre-consent login failure; verify without replay");
      }
      const choice = safeChoice(notice, s, release, "reuse");
      if (choice.expected_version !== version) throw new Error("approved runtime changed; new action confirmation required");
      if (reuseNeedsApproval(choice, release) && !s.action_approved_at) throw new Error("different-version reuse was not approved");
      return next("choice_ready", { notice, choice, inventory_digest: fingerprint(notice), resuming_authorization_id: receipt.authorization_id,
        action_digest: digest({ inventory: fingerprint(notice), choice }),
        instruction: "Resume the same approved runtime and directory after the legacy QDMP login completes. Consent and prior version approval remain valid. Execute will recheck live state; no install/update replay or second monitoring consent is authorized." });
    }
    if (command === "execute") {
      let notice;
      try { notice = inspect(); } catch (error) { return next("check_failed", { reason: error.message }); }
      if (notice.status?.plugin_state === "unknown") return next("check_failed", { diagnostic: notice.status.diagnostic, notice });
      if (fingerprint(notice) !== s.inventory_digest) return next("needs_reconfirmation", { reason: "live installation/authorization/options changed" });
      const choice = safeChoice(notice, s, release, s.choice?.action);
      if (s.resuming_authorization_id && notice.status?.receipt?.authorization_id !== s.resuming_authorization_id) return next("needs_reconfirmation", { reason: "pending authorization changed; inspect without replay" });
      if ((choice.action.startsWith("update") || reuseNeedsApproval(choice, release)) && (!s.action_approved_at || digest({ inventory: fingerprint(notice), choice }) !== s.action_digest)) throw new Error("action authorization missing or changed");
      // Persist before mutation: a crash or failed command must never auto-replay.
      next("executing");
      try {
        const argv = [...choice.argv];
        if (!argv.includes("--artifact-url")) argv.push("--artifact-url", release.artifact_url);
        const result = run(entry, argv, s, options);
        return next("activation_reported", { execution_result: result, instruction: hookInstruction(s.host, result, s.directory) });
      } catch (error) { return next("failed", { reason: error.message, instruction: "Verify live state; never auto-replay an ambiguous mutation. A proven legacy pre-consent login failure on reuse may resume the same flow after login; do not repeat consent or version approval." }); }
    }
    if (command === "verify") {
      const result = run(entry, ["status", ...queryArgs(s)], s, options);
      const expected = s.choice?.action === "reuse" ? s.choice.expected_version : s.notice?.status?.installed_version && !s.choice ? s.notice.status.installed_version : release.version;
      if (result.project_root !== s.directory || result.host !== s.host || result.installed_version !== expected || !result.compatible) throw new Error("live runtime scope/version mismatch");
      const collecting = result.project?.granted === true && result.project?.state === "collecting";
      return next(collecting ? "collecting" : "verification_pending", { verification: result, warehouse: "not_verified", instruction: hookInstruction(s.host, result, s.directory) });
    }
    throw new Error("unsupported flow command");
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
}

// Keep repeated CLI replies small enough for an Agent to see current evidence.
// Full receipts, legal text and history remain in the private state file.
export function flowOutput(result) {
  if (result.flows || Object.hasOwn(result, "live") || result.preview_digest) return result;
  const keys = ["id", "state", "directory", "host", "allowed_actions", "disclosure_digest", "action_digest", "proposed_action", "choice", "reason", "diagnostic", "error_code", "phase", "instruction", "compatibility", "warehouse", "reuse_only", "install_only"];
  const view = Object.fromEntries(keys.filter(key => result[key] !== undefined).map(key => [key, result[key]]));
  if (result.disclosure) view.disclosure = { display: result.disclosure.display };
  if (result.notice?.status) view.runtime = { installed_version: result.notice.status.installed_version,
    compatible: result.notice.status.compatible, activation_requirements: result.notice.status.activation_requirements };
  if (result.state === "action_confirmation_required") view.notice = {
    project_root: result.notice?.project_root, host: result.notice?.host,
    choices: result.notice?.choices, consent: result.notice?.consent, legal: result.notice?.legal
  };
  if (result.verification) {
    const status = result.verification;
    view.verification = { project_root: status.project_root, host: status.host, installed_version: status.installed_version,
      compatible: status.compatible, activation_requirements: status.activation_requirements, project: status.project, next_action: status.next_action,
      hook_followup: hookFollowup(status.project),
      upload_endpoint: status.project?.collector?.endpoint || status.receipt?.upload_endpoint || status.receipt?.activation?.upload_endpoint,
      production_readback_verified: status.production_readback_verified ?? status.project?.production_readback_verified ?? false };
  }
  return view;
}

export async function runFlow(argv, options = {}) {
  const [command, ...tokens] = argv;
  const accepted = command === "begin" ? new Set(["--cwd", "--host", "--preview"])
    : ["list", "preview", "local-status"].includes(command) ? new Set(["--cwd", "--host"])
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
  runFlow(process.argv.slice(2)).then(result => console.log(JSON.stringify(flowOutput(result), null, 2)))
    .catch(error => { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; });
}
