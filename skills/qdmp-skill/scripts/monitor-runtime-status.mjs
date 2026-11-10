// Query only the service-managed runtime, never a historical flow or a project script.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

export function hookFollowup(project) {
  if (project?.state !== "hooks_pending" || project.granted !== true) return undefined;
  const reported = project.hook_diagnostics?.trust_status;
  const trust_status = ["untrusted", "modified", "trusted", "managed"].includes(reported) ? reported : "unknown";
  const missing_events = ["prompt", "tool"].filter(event => project.hooks?.[`${event}_seen`] !== true);
  const action = ["untrusted", "modified"].includes(trust_status) ? "review"
    : trust_status === "unknown" ? "diagnose" : "observe";
  return { action, trust_status, missing_events };
}

export function runtimeStatus(directory, host, home, pinnedVersion, run = spawnSync) {
  const data = process.env.ART_DATA_DIR || path.join(home, ".agent-runtime-telemetry");
  const runtime = path.join(home, ".agent-runtime-telemetry", "runtime");
  const receiptFile = path.join(runtime, "installed.json");
  const scope = { directory, host };
  try {
    const receipt = readJson(receiptFile);
    if (!receipt) {
      // Presence alone is not proof of consent. It prevents a duplicate prompt
      // when the official status reader is unavailable.
      const key = crypto.createHash("sha256").update(directory).digest("hex").slice(0, 32);
      const record = readJson(path.join(data, "consent", `${key}.json`));
      if (record?.project_root === directory && record.status === "granted" && record.accepted === true
          && record.agreement_version === "1.0" && typeof record.accepted_at === "string") {
        return { ...scope, live: false, state: "runtime_unavailable", stored_consent: "granted" };
      }
      return { ...scope, live: false, state: record ? "unknown" : "runtime_unavailable" };
    }
    const version = receipt.version;
    if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:\+[\w.-]+)?$/.test(version)) throw new Error("invalid runtime version");
    const root = path.join(fs.realpathSync(runtime), version);
    const entry = path.join(root, "bin", "art.mjs");
    const pkg = readJson(path.join(root, "package.json"));
    if (pkg?.name !== "agent-runtime-telemetry" || pkg.version !== version
        || fs.realpathSync(entry) !== entry || !fs.statSync(entry).isFile()) throw new Error("unverified managed runtime");
    const result = run(process.execPath, [entry, "project-status", "--cwd", directory, "--host", host, "--exact-workspace"],
      { cwd: root, encoding: "utf8", windowsHide: true, timeout: 4000, maxBuffer: 64 * 1024 });
    if (result.error || result.status !== 0) throw new Error("runtime query failed");
    const status = JSON.parse(result.stdout);
    if (status.project_root !== directory || status.host !== host || typeof status.granted !== "boolean"
        || typeof status.state !== "string" || !/^[a-z_]+$/.test(status.state)) throw new Error("runtime scope or state mismatch");
    const installed = version.split("+")[0].split(".").map(Number);
    const pinned = pinnedVersion.split(".").map(Number);
    const difference = installed.map((n, i) => n - pinned[i]).find(n => n !== 0);
    // The runtime also uses collector_repair_required when this process cannot
    // reach loopback (for example in an IDE sandbox). Consent is still known.
    const unreachable = status.state === "collector_repair_required" && typeof status.error === "string";
    const state = unreachable ? "collector_unreachable" : status.state;
    const repair = status.granted && !["collecting", "disabled", "revoked", "revocation_pending"].includes(state);
    const repairGuidance = unreachable
      ? "当前目录已有收集授权，本次会话暂时无法连接本机收集服务。"
      : "当前目录已有收集授权，收集和上报状态待核验。";
    return { ...scope, live: true, state, granted: status.granted, installed_version: version,
      bundled_version: pinnedVersion, ...(difference < 0 && { bundled_version_newer: true }),
      hook_followup: hookFollowup(status),
      ...(repair && { repair_guidance: repairGuidance }) };
  } catch {
    return { ...scope, live: false, state: "unknown" };
  }
}
