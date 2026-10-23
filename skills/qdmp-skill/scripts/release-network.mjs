// Public release metadata only: bounded retries, no credentials or disk cache.
const TRANSIENT = new Set([408, 429, 500, 502, 503, 504]);
const CERTIFICATE = /CERT|TLS|SSL|UNABLE_TO_VERIFY/;
const NETWORK = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND", "ENETUNREACH", "EHOSTUNREACH", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"]);
function failure(message, fields = {}) { return Object.assign(new Error(message), fields); }
async function bodyText(response, limit) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text) > limit) throw failure("Release response too large", { code: "RESPONSE_TOO_LARGE" });
    return text;
  }
  const reader = response.body.getReader(), chunks = []; let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw failure("Release response too large", { code: "RESPONSE_TOO_LARGE" }); }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally { reader.releaseLock(); }
}
export function releaseReader(options = {}) {
  const { totalMs = 15000, attemptMs = 4000, retryMs = 250 } = options.networkPolicy ?? {};
  if (![totalMs, attemptMs, retryMs].every(Number.isFinite) || totalMs <= 0 || totalMs > 15000 || attemptMs <= 0 || attemptMs > 4000 || retryMs < 0 || retryMs > 1000) throw new Error("Invalid release network policy");
  const start = performance.now(), trace = [];
  const remaining = () => Math.max(0, totalMs - (performance.now() - start));
  const info = () => ({ duration_ms: Math.round(performance.now() - start), budget_ms: totalMs, requests: [...trace] });
  async function read(url, stage, maxBytes, accept = "application/vnd.github+json") {
    let last;
    for (let attempt = 1; attempt <= 2 && remaining() > 0; attempt++) {
      const controller = new AbortController(), began = performance.now(); let timer;
      try {
        const deadline = new Promise((_, reject) => { timer = setTimeout(() => {
          const error = failure("Request deadline exceeded", { code: "REQUEST_TIMEOUT", retryable: true });
          reject(error); controller.abort(error);
        }, Math.max(1, Math.min(attemptMs, remaining()))); });
        const operation = (async () => {
          const response = await (options.fetch ?? fetch)(url, { signal: controller.signal, redirect: "error", headers: { Accept: accept, "User-Agent": "qdmp-skill-release-check", "X-GitHub-Api-Version": "2022-11-28" } });
          if (!response.ok) {
            const retry = response.headers?.get("retry-after"), seconds = Number(retry);
            const retryAfter = retry ? Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(retry) - Date.now()) : 0;
            // Never log response bodies (HTML, proxy diagnostics, or credentials).
            void response.body?.cancel?.().catch(() => {});
            throw failure(`HTTP ${response.status}`, { status: response.status, code: `HTTP_${response.status}`, retryable: TRANSIENT.has(response.status), retryAfter });
          }
          const text = await bodyText(response, maxBytes);
          try { return JSON.parse(text); } catch { throw failure("Invalid release JSON", { code: "INVALID_JSON" }); }
        })();
        const value = await Promise.race([operation, deadline]);
        trace.push({ stage, host: new URL(url).host, attempt, outcome: "ok", duration_ms: Math.round(performance.now() - began) });
        return value;
      } catch (error) {
        const code = error.code || error.cause?.code || error.name;
        const retryable = error.retryable ?? (!CERTIFICATE.test(code) && (NETWORK.has(code) || ["TypeError", "TimeoutError", "AbortError"].includes(error.name)));
        trace.push({ stage, host: new URL(url).host, attempt, outcome: "failed", code, status: error.status, duration_ms: Math.round(performance.now() - began) });
        last = failure(`${stage} (${new URL(url).host}) attempt ${attempt}: ${error.message} [${code}]`, { code, status: error.status, retryable, retryAfter: error.retryAfter });
        const delay = Math.max(retryMs, error.retryAfter || 0);
        if (!retryable || attempt === 2 || delay > 1000 || remaining() <= delay) break;
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
      } finally { clearTimeout(timer); controller.abort(); }
    }
    last ??= failure(`${stage}: release lookup total deadline exceeded`, { code: "LOOKUP_TIMEOUT", retryable: true });
    last.details = { stage, code: last.code, status: last.status, ...info() }; throw last;
  }
  return { read, info, remaining };
}
