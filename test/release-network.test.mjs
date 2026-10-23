import assert from "node:assert/strict";
import test from "node:test";
import { releaseReader } from "../skills/qdmp-skill/scripts/release-network.mjs";
import { latestRelease } from "../skills/qdmp-skill/scripts/ensure-current.mjs";
const pin = { version: "0.2.17", onboarding: { sha256: "a".repeat(64) } };
const list = [{ tag_name: "v1.1.13" }];
const reply = data => new Response(JSON.stringify(data));
const quick = { totalMs: 300, attemptMs: 30, retryMs: 0 };

test("a transient timeout is retried with a new signal; API manifest is fixed to the selected tag", async () => {
  const calls = [];
  const result = await latestRelease({ networkPolicy: quick, fetch: async (url, opts) => {
    calls.push({ url, ...opts });
    if (calls.length === 1) return new Promise(() => {});
    return reply(url.includes("/contents/") ? pin : list);
  } });
  assert.equal(result.version, "1.1.13"); assert.equal(calls.length, 3);
  assert.equal(calls[0].signal.aborted, true); assert.notEqual(calls[0].signal, calls[1].signal);
  assert.match(calls[2].url, /api\.github\.com.*ref=v1\.1\.13$/);
  assert.equal(calls[2].headers.Accept, "application/vnd.github.raw+json");
  assert.equal(result.lookup.requests[0].code, "REQUEST_TIMEOUT");
});
test("transient manifest failures fall back only to the same official repository and tag", async () => {
  const calls = [];
  const result = await latestRelease({ networkPolicy: quick, fetch: async url => {
    calls.push(url);
    if (url.includes("/contents/")) return new Response("unavailable", { status: 503 });
    return reply(url.includes("raw.githubusercontent") ? pin : list);
  } });
  assert.equal(result.distribution.version, "0.2.17"); assert.equal(calls.length, 4);
  assert.equal(calls[3], "https://raw.githubusercontent.com/EchoTechFE/qdmp-skill/v1.1.13/skills/qdmp-skill/references/telemetry-distribution.json");
  assert.equal(result.lookup.requests.at(-1).stage, "manifest_raw");
});
for (const status of [401, 403, 404, 429]) test(`HTTP ${status} cannot silently select another manifest source`, async () => {
  const calls = [];
  await assert.rejects(latestRelease({ networkPolicy: quick, fetch: async url => {
    calls.push(url); return url.includes("/contents/") ? new Response("denied", { status }) : reply(list);
  } }), e => e.details.stage === "manifest_api" && e.details.status === status);
  assert.equal(calls.some(u => u.includes("raw.githubusercontent")), false);
  assert.equal(calls.length, status === 429 ? 3 : 2);
});
for (const bad of ["<html>proxy error</html>", JSON.stringify({ version: "bad" }), "null"]) test(`invalid manifest fails closed: ${bad.slice(0, 12)}`, async () => {
  let calls = 0;
  await assert.rejects(latestRelease({ networkPolicy: quick, fetch: async url => {
    calls++; return url.includes("/contents/") ? new Response(bad) : reply(list);
  } }), /Invalid release JSON|Published telemetry pin invalid/);
  assert.equal(calls, 2);
});
test("HTTP retry-after is respected without sleeping beyond the bounded retry policy", async () => {
  let calls = 0;
  await assert.rejects(latestRelease({ networkPolicy: quick, fetch: async url => {
    calls++; return url.includes("/contents/") ? new Response("later", { status: 503, headers: { "retry-after": "120" } }) : reply(list);
  } }), /HTTP 503/);
  assert.equal(calls, 2);
});
test("the shared total deadline bounds all attempts and stalled body reads", async () => {
  const began = performance.now(); let aborted = false;
  const network = releaseReader({ networkPolicy: { totalMs: 65, attemptMs: 40, retryMs: 0 }, fetch: async (_url, opts) => {
    opts.signal.addEventListener("abort", () => { aborted = true; });
    return { ok: true, text: () => new Promise(() => {}) };
  } });
  await assert.rejects(network.read("https://api.github.com/test", "release_list", 1024), e => e.details.requests.length === 2 && e.details.code === "REQUEST_TIMEOUT");
  assert.ok(performance.now() - began < 500); assert.equal(aborted, true);
});
test("streamed response size is capped before JSON parsing; invalid JSON is not retried", async () => {
  let calls = 0;
  const network = releaseReader({ networkPolicy: quick, fetch: async () => { calls++; return new Response("x".repeat(100)); } });
  await assert.rejects(network.read("https://api.github.com/test", "release_list", 20), /too large/);
  assert.equal(calls, 1);
});
for (const code of ["CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE"]) test(`TLS failure ${code} is not retried or bypassed`, async () => {
  let calls = 0;
  const network = releaseReader({ networkPolicy: quick, fetch: async () => { calls++; throw new TypeError("fetch failed", { cause: { code } }); } });
  await assert.rejects(network.read("https://api.github.com/test", "release_list", 1024), e => e.details.code === code);
  assert.equal(calls, 1);
});
