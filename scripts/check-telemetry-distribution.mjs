// Read-only release validation; never copies, downloads or executes telemetry.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkDistribution } from "../skills/qdmp-skill/scripts/monitor-preflight.mjs";
export { distributionFile, checkDistribution } from "../skills/qdmp-skill/scripts/monitor-preflight.mjs";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length > 2) throw new Error("Usage: node scripts/check-telemetry-distribution.mjs");
    checkDistribution();
    console.log("Skill telemetry distribution manifest is valid (read-only check).");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
