// 可复制的调用模板；并发控制与日志字段属于示例封装。
export function createAudioControls(sdk, onRecord = record => console.log('[audio]', record)) {
  let audio = null;
  let source = '';
  let busy = false;

  function report(record) {
    // 日志展示失败不能把原生调用结果改成失败。
    try {
      const pending = onRecord(record);
      if (pending != null && typeof pending.then === 'function') Promise.resolve(pending).catch(() => {});
    } catch (_) { /* 记录函数由调用方管理。 */ }
  }

  function context() {
    if (!audio) throw new Error('请先创建音频实例。');
    return audio;
  }

  async function run(api, prepare, accept = () => {}) {
    if (busy) {
      const error = new Error('请等待当前音频操作完成。');
      report({ api, phase: 'blocked', error });
      throw error;
    }
    busy = true;
    let phase = 'blocked';
    try {
      const { owner, method, properties } = prepare();
      const fn = owner?.[method];
      if (typeof fn !== 'function') throw new Error(`当前环境未提供 ${api}。`);
      report({ api, phase: 'request', arguments: [], ...(properties ? { properties } : {}) });
      phase = 'threw';
      const returned = fn.call(owner);
      const isPromise = returned != null && typeof returned.then === 'function';
      phase = 'rejected';
      const value = isPromise ? await returned : returned;
      report({ api, phase: isPromise ? 'resolved' : 'returned', value });
      phase = 'blocked';
      accept(value);
      return value;
    } catch (error) {
      report({ api, phase, error });
      throw error;
    } finally {
      busy = false;
    }
  }

  return {
    create() {
      return run('qd.createInnerAudioContext', () => {
        if (audio) throw new Error('已有音频实例，请先销毁后再创建。');
        return { owner: sdk, method: 'createInnerAudioContext' };
      }, value => {
        if (value === null || !['object', 'function'].includes(typeof value)) {
          throw new Error('创建调用未返回可用的音频实例。');
        }
        audio = value;
        source = '';
      });
    },
    play(selectedSource) {
      return run('InnerAudioContext.play', () => {
        const owner = context();
        const nextSource = selectedSource === undefined ? source : selectedSource;
        if (typeof nextSource !== 'string' || !nextSource.trim()) {
          throw new Error('请先提供音频 URL 或有效本地路径。');
        }
        owner.autoplay = false;
        owner.loop = false;
        if (source !== nextSource) {
          owner.src = nextSource;
          source = nextSource;
        }
        return { owner, method: 'play', properties: { src: source, autoplay: false, loop: false } };
      });
    },
    pause() {
      return run('InnerAudioContext.pause', () => ({ owner: context(), method: 'pause' }));
    },
    stop() {
      return run('InnerAudioContext.stop', () => ({ owner: context(), method: 'stop' }));
    },
    destroy() {
      return run('InnerAudioContext.destroy', () => ({ owner: context(), method: 'destroy' }), () => {
        audio = null;
        source = '';
      });
    },
  };
}
