export const PHONE_EXCHANGE_PATH = '/user/v1/phone/exchange';
export const PHONE_EXCHANGE_TIMEOUT = 35000;

const validCode = code => typeof code === 'string' && code.length > 0 && code.length <= 8192 && !/\s/.test(code);
const localError = code => Object.assign(new Error(code), { code });

export function readPhoneAuthorizationCode(event) {
  const value = event?.detail;
  const envelope = value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'data');
  const code = envelope ? value?.data?.code : value?.code;
  const errMsg = value?.errMsg || value?.data?.errMsg;
  const failed = (errMsg && !/^getPhoneNumber:ok(?:\s|$)/i.test(String(errMsg)))
    || (value?.errno !== undefined && Number(value.errno) !== 0)
    || (envelope && String(value.code) !== '0')
    || /cancel|deny|denied|reject|fail|取消|拒绝/i.test(String(value?.message || ''));
  return !failed && validCode(code) ? code : null;
}

// 每次调用最多发一个请求；调用者负责并发控制、跨调用防重和会话隔离。
export function exchangePhoneCode(request, baseUrl, code) {
  if (!validCode(code)) return Promise.reject(localError('INVALID_PHONE_CODE'));
  return new Promise((resolve, reject) => {
    let settled = false, task;
    const finish = (fn, value) => { if (!settled) { settled = true; clearTimeout(timer); fn(value); } };
    const timer = setTimeout(() => {
      finish(reject, localError('PHONE_EXCHANGE_TIMEOUT'));
      try { task?.abort?.(); } catch { /* 不重试。 */ }
    }, PHONE_EXCHANGE_TIMEOUT);
    try {
      task = request({
        url: `${baseUrl.replace(/\/$/, '')}${PHONE_EXCHANGE_PATH}`,
        method: 'POST', data: { code },
        header: { 'Content-Type': 'application/json' },
        timeout: PHONE_EXCHANGE_TIMEOUT,
        success: value => finish(resolve, value),
        fail: () => finish(reject, localError('PHONE_EXCHANGE_NETWORK_ERROR')),
      });
      if (typeof task?.then === 'function') {
        task.then(value => { if (value !== undefined) finish(resolve, value); },
          () => finish(reject, localError('PHONE_EXCHANGE_NETWORK_ERROR')));
      }
    } catch { finish(reject, localError('PHONE_EXCHANGE_START_FAILED')); }
  });
}

// version 必须来自宿主文档明确的千岛 App 版本字段。
export function isPhoneAuthorizationSupported(version) {
  const match = typeof version === 'string' && version.trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return false;
  const parts = match.slice(1).map(Number);
  if (!parts.every(Number.isSafeInteger)) return false;
  const minimum = [6, 68, 0];
  for (let i = 0; i < minimum.length; i += 1) {
    if (parts[i] !== minimum[i]) return parts[i] > minimum[i];
  }
  return true;
}
