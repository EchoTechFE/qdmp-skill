// bindings are generated from MCP facts by the caller; no native API signatures live here.
export function createAudioControls(bindings, onRecord = record => console.log('[audio]', record)) {
  let audio = null;
  let source = '';
  let busy = false;

  function report(record) {
    try {
      const pending = onRecord(record);
      if (pending != null && typeof pending.then === 'function') Promise.resolve(pending).catch(() => {});
    } catch (_) { /* Observability must not change the native result. */ }
  }
  function context() {
    if (!audio) throw new Error('请先创建音频实例。');
    return audio;
  }
  async function run(operation, prepare, accept = () => {}) {
    const binding = bindings?.[operation];
    const api = binding?.id || operation;
    if (busy) {
      const error = new Error('请等待当前音频操作完成。');
      report({ api, phase: 'blocked', error });
      throw error;
    }
    busy = true;
    let phase = 'blocked';
    try {
      if (!binding?.id || typeof binding.invoke !== 'function') throw new Error(`缺少已核实的 ${operation} 调用适配层。`);
      const owner = prepare();
      report({ api, phase: 'request' });
      phase = 'threw';
      const returned = binding.invoke(owner);
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
    } finally { busy = false; }
  }
  return {
    create() {
      return run('create', () => {
        if (audio) throw new Error('已有音频实例，请先销毁后再创建。');
      }, value => {
        if (value === null || !['object', 'function'].includes(typeof value)) throw new Error('创建调用未返回可用的音频实例。');
        audio = value;
        source = '';
      });
    },
    play(selectedSource) {
      return run('play', () => {
        const owner = context();
        const nextSource = selectedSource === undefined ? source : selectedSource;
        if (typeof nextSource !== 'string' || !nextSource.trim()) throw new Error('请先提供音频 URL 或有效本地路径。');
        if (source !== nextSource) {
          if (typeof bindings.play.configureSource !== 'function') throw new Error('缺少已核实的音源适配层。');
          bindings.play.configureSource(owner, nextSource);
          source = nextSource;
        }
        return owner;
      });
    },
    pause() { return run('pause', context); },
    stop() { return run('stop', context); },
    destroy() {
      return run('destroy', context, () => { audio = null; source = ''; });
    },
  };
}
