// Kept outside the replaceable Skill as a standalone recovery entry before updates.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
const hash = data => crypto.createHash("sha256").update(data).digest("hex");
const NAMES = ["qdmp-skill", "qdmp-product-rules", "qdmp-design-rules", "qdmp-entry-route"];
export function atomicFile(file, data, id = crypto.randomUUID(), mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = path.join(path.dirname(file), `.${path.basename(file)}.qdmp-${id}-${crypto.randomUUID()}.tmp`);
  const fd = fs.openSync(temp, "wx", mode);
  try { fs.writeFileSync(fd, data); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temp, file);
}
export function atomicJson(file, value) { atomicFile(file, JSON.stringify(value, null, 2)); }
export function fileMap(root, ignored = []) {
  const files = {};
  function walk(dir, prefix = "") {
    for (const name of fs.readdirSync(dir).sort()) {
      if (!prefix && ignored.includes(name)) continue;
      const rel = `${prefix}${name}`, file = path.join(dir, name), stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || !stat.isDirectory() && !stat.isFile()) throw new Error(`Linked/special update file: ${rel}`);
      if (stat.isDirectory()) walk(file, `${rel}/`); else files[rel] = hash(fs.readFileSync(file));
    }
  }
  walk(root); return files;
}
export function directoryDigest(root, ignored = []) { return hash(JSON.stringify(fileMap(root, ignored))); }
function safeRelative(rel) { return rel && !path.isAbsolute(rel) && !rel.split(/[\\/]/).some(part => part === ".." || !part); }
// Never remove the directory or its discovery entry. SKILL.md is replaced last.
export function syncDirectory(source, target, quarantine, id = crypto.randomUUID()) {
  const wanted = fileMap(source), current = fileMap(target);
  const priority = rel => rel === "SKILL.md" ? 2 : Object.hasOwn(current, rel) ? 1 : 0;
  const files = Object.keys(wanted).sort((a, b) => priority(a) - priority(b) || a.localeCompare(b));
  for (const rel of files) {
    if (!safeRelative(rel)) throw new Error("Unsafe update path");
    if (current[rel] === wanted[rel]) continue;
    atomicFile(path.join(target, rel), fs.readFileSync(path.join(source, rel)), id, fs.statSync(path.join(source, rel)).mode & 0o777);
  }
  for (const rel of Object.keys(current).filter(rel => !Object.hasOwn(wanted, rel))) {
    const dest = path.join(quarantine, rel); fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(path.join(target, rel), dest);
  }
}
function live(pid) { try { process.kill(pid, 0); return true; } catch (e) { return e.code !== "ESRCH"; } }
export function recoverPending(home = os.homedir()) {
  const state = path.join(home, ".qdmp-skill");
  if (!fs.existsSync(path.join(state, "personal-update.json")) && !fs.existsSync(path.join(state, "skill-update.lock"))) return { state: "none" };
  const file = path.join(state, "recovery.lock");
  if (fs.existsSync(file)) {
    let owner; try { owner = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return { state: "busy", reason: "unknown_recovery_owner" }; }
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || live(owner.pid)) return { state: "busy", reason: "active_recovery" };
    fs.unlinkSync(file);
  }
  let fd;
  try { fd = fs.openSync(file, "wx", 0o600); } catch (e) { if (e.code === "EEXIST") return { state: "busy", reason: "concurrent_recovery" }; throw e; }
  try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid })); fs.fsyncSync(fd); return recoverLocked(home); }
  finally { fs.closeSync(fd); fs.unlinkSync(file); }
}
function recoverLocked(home) {
  const state = path.join(home, ".qdmp-skill"), journalFile = path.join(state, "personal-update.json"), lock = path.join(state, "skill-update.lock");
  if (!fs.existsSync(journalFile)) {
    if (!fs.existsSync(lock)) return { state: "none" };
    let owner; try { owner = JSON.parse(fs.readFileSync(lock, "utf8")); } catch { return { state: "busy", reason: "unknown_lock_owner" }; }
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || live(owner.pid)) return { state: "busy", reason: "active_or_unknown_lock" };
    fs.unlinkSync(lock); return { state: "dead_lock_released" };
  }
  const journal = JSON.parse(fs.readFileSync(journalFile, "utf8"));
  if (journal.schema !== 1 || !/^[a-f0-9-]{36}$/.test(journal.id) || !Array.isArray(journal.entries) || !journal.entries.length
    || !["prepared", "committed", "rollback_required"].includes(journal.phase) || !Number.isSafeInteger(journal.pid) || journal.pid <= 0) throw new Error("Invalid update recovery journal; inspect manually");
  if (live(journal.pid)) return { state: "busy", pid: journal.pid };
  if (fs.existsSync(lock)) {
    let owner; try { owner = JSON.parse(fs.readFileSync(lock, "utf8")); } catch { throw new Error("Unknown lock owner; inspect manually"); }
    if (owner.pid !== journal.pid) throw new Error("Lock owner changed; inspect manually");
  }
  for (const entry of journal.entries) {
    const expected = path.resolve(journal.config, "skills", entry.name);
    const backup = path.resolve(entry.backup), base = path.resolve(state, "backups") + path.sep;
    if (!NAMES.includes(entry.name) || entry.target !== expected || !backup.startsWith(base) || !fs.existsSync(backup)
      || fs.lstatSync(entry.target).isSymbolicLink() || directoryDigest(backup) !== entry.old_digest) throw new Error("Unverified recovery paths or backup; inspect manually");
    if (journal.phase !== "committed") {
      const current = fileMap(entry.target);
      for (const [rel, digest] of Object.entries(current)) {
        if (rel.includes(`.qdmp-${journal.id}-`) && rel.endsWith(".tmp")) continue;
        if (digest !== entry.old_files[rel] && digest !== entry.new_files[rel]) throw new Error("Concurrent local edits found; preserve them and recover manually");
      }
    }
  }
  if (journal.phase !== "committed") for (const entry of [...journal.entries].reverse()) {
    syncDirectory(entry.backup, entry.target, path.join(path.dirname(entry.backup), `interrupted-${entry.name}`), journal.id);
    if (directoryDigest(entry.target) !== entry.old_digest) throw new Error("Recovery content verification failed");
  }
  // Remove only this dead transaction's lock; an unrelated lock is never cleared.
  if (fs.existsSync(lock)) {
    let owner; try { owner = JSON.parse(fs.readFileSync(lock, "utf8")); } catch { throw new Error("Unknown lock owner; inspect manually"); }
    if (owner.pid !== journal.pid) throw new Error("Lock owner changed; inspect manually");
    fs.unlinkSync(lock);
  }
  fs.renameSync(journalFile, path.join(path.dirname(journal.entries[0].backup), `recovery-${journal.id}.json`));
  return { state: journal.phase === "committed" ? "committed" : "restored", backup: path.dirname(journal.entries[0].backup) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if (process.argv.length !== 2) throw new Error("Usage: node recover-update.mjs"); console.log(JSON.stringify(recoverPending())); }
  catch (error) { console.error(JSON.stringify({ error: error.message })); process.exitCode = 1; }
}
