// 复制到目标小程序后导入；sdk 由项目现有方式取得（如 qd）。
// 仅上传一次，不登录、不申请凭据、不查询 result、不记录日志、不自动重试。
const isMap = value => value !== null && typeof value === "object" && !Array.isArray(value);
const has = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function validate(prepared, filePath, allowedHosts) {
  if (typeof filePath !== "string" || !filePath.trim()
    || /^(?:https?:|data:|blob:|\/\/)/i.test(filePath.trim())) {
    throw new Error("需要本次 prepare 对应的本地文件路径");
  }
  // 当前 PostObject 地址为桶根路径。不在此模板拼 key、改地址或放行任意主机。
  const host = typeof prepared?.uploadUrl === "string"
    && prepared.uploadUrl.match(/^https:\/\/([a-z0-9.-]+)\/$/i)?.[1];
  if (!host || !Array.isArray(allowedHosts)
    || !allowedHosts.some(item => typeof item === "string" && item.toLowerCase() === host.toLowerCase())) {
    throw new Error("上传目标不在已配置的 HTTPS OSS 主机中");
  }
  if (typeof prepared.assetId !== "string" || !prepared.assetId.trim()) {
    throw new Error("prepare 缺少 assetId");
  }
  const expires = Number(prepared.expireAt);
  if (!Number.isSafeInteger(expires) || expires * 1000 <= Date.now()) {
    throw new Error("上传凭据已过期或缺少有效的秒级 expireAt");
  }
  if (!isMap(prepared.uploadHeaders) || Object.keys(prepared.uploadHeaders).length) {
    throw new Error("当前 POST 契约要求 uploadHeaders 为空，请核对接口契约");
  }
  if (!isMap(prepared.uploadFormData) || !Object.keys(prepared.uploadFormData).length) {
    throw new Error("缺少 POST uploadFormData，不能使用旧 PUT 凭据");
  }
  for (const [key, value] of Object.entries(prepared.uploadFormData)) {
    const normalized = key.replace(/[-_]/g, "").toLowerCase();
    if (!key || /[\r\n]/.test(key) || typeof value !== "string"
      || ["file", "accesstoken", "authorization", "cookie", "appsecret", "clientsecret", "token", "secret"].includes(normalized)) {
      throw new Error("uploadFormData 包含无效字段或应用凭证");
    }
  }
}

export function startOssPostUpload(sdk, prepared, filePath, { allowedHosts } = {}) {
  if (typeof sdk?.uploadFile !== "function") throw new Error("宿主缺少 uploadFile");
  validate(prepared, filePath, allowedHosts);
  const assetId = prepared.assetId;
  const request = {
    url: prepared.uploadUrl,
    filePath,
    name: "file",
    header: { ...prepared.uploadHeaders },
    formData: { ...prepared.uploadFormData },
    timeout: 120000,
  };
  let settled = false, task, watchdog, resolveFinished;
  const finished = new Promise(resolve => { resolveFinished = resolve; });
  const finish = (callback, raw) => {
    if (settled) return;
    settled = true;
    clearTimeout(watchdog);
    const statusCode = raw?.statusCode == null ? null : Number(raw.statusCode);
    const httpSuccess = Number.isFinite(statusCode) && statusCode >= 200 && statusCode < 300;
    let parsedBody;
    if (typeof raw?.data === "string") {
      try { parsedBody = JSON.parse(raw.data); } catch { /* XML/文本原样保留。 */ }
    } else if (has(raw || {}, "data")) parsedBody = raw.data;
    resolveFinished({
      assetId, callback, raw, statusCode, httpSuccess, parsedBody,
      // 仅确认传输层；不能用它标记审核通过/已发布。
      transportConfirmed: ["success", "promise-resolve"].includes(callback) && httpSuccess && statusCode !== 203,
    });
  };
  const cancel = callback => {
    if (settled) return;
    // 先结算再 abort，保留本地原因，不被 abort 产生的 fail 覆盖。
    finish(callback, { errMsg: callback === "timeout" ? "等待上传回调超时" : "本地已取消上传等待" });
    try { task?.abort?.(); } catch { /* abort 不保证服务端未接收。 */ }
  };
  watchdog = setTimeout(() => cancel("timeout"), 125000);
  try {
    task = sdk.uploadFile({
      ...request,
      success: raw => finish("success", raw),
      fail: raw => finish("fail", raw),
    });
    if (typeof task?.then === "function") {
      task.then(
        raw => { if (raw != null) finish("promise-resolve", raw); },
        raw => finish("promise-reject", raw),
      );
    }
  } catch (error) { finish("throw", error); }
  return { finished, abort: () => cancel("cancelled") };
}

function validCdnUrl(value) {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f\\]/.test(value)) return false;
  // 不依赖部分小程序宿主未提供的全局 URL；校验 DNS 主机和可选端口。
  const match = value.match(/^https:\/\/([^/?#:\s]+)(?::([0-9]{1,5}))?(?:[/?#][^\s]*)?$/i);
  if (!match || match[1].length > 253) return false;
  if (!match[1].split(".").every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label))) return false;
  return match[2] === undefined || (Number(match[2]) >= 1 && Number(match[2]) <= 65535);
}

export function readOssPublication(envelope) {
  const data = envelope?.data;
  const status = typeof data?.status === "string" ? data.status : "";
  const querySuccess = envelope?.code != null && String(envelope.code) === "0";
  const known = ["RESERVED", "REVIEWING", "PUBLISHING", "COMMITTED", "REJECTED", "CANCELLED", "EXPIRED"].includes(status);
  const url = querySuccess && status === "COMMITTED" && validCdnUrl(data?.cdnUrl) ? data.cdnUrl : "";
  return {
    querySuccess, status, known,
    published: Boolean(url), url,
    terminal: querySuccess && ["COMMITTED", "REJECTED", "CANCELLED", "EXPIRED"].includes(status),
    // 未知/错误均不建议继续自动查询；仍允许用户手动刷新。
    pending: querySuccess && ["RESERVED", "REVIEWING", "PUBLISHING"].includes(status),
  };
}
