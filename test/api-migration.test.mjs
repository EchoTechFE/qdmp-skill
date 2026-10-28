import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAudioControls } from '../skills/qdmp-skill/assets/inner-audio.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');

test('historical sources and all pre-existing tests remain byte-for-byte recoverable', () => {
  const base = JSON.parse(readFileSync(new URL('./fixtures/api-migration/baseline.json', import.meta.url)));
  for (const [name, digest] of Object.entries(base.archived)) {
    assert.equal(sha(readFileSync(path.join(root, 'test/fixtures/api-migration', name.replace('skills/qdmp-skill/', '')))), digest, name);
    assert.equal(base.scan.find(file => file.path === name)?.sha256, digest, name);
  }
  for (const file of base.scan.filter(file => file.path.startsWith('test/'))) {
    assert.equal(sha(readFileSync(path.join(root, file.path))), file.sha256, file.path);
  }
});

test('distributed skill contains no frozen business HTTP routes or native invocation templates', () => {
  function walk(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const target = path.join(folder, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (/\.(md|mjs)$/.test(entry.name)) {
        const text = readFileSync(target, 'utf8');
        assert.doesNotMatch(text, /https:\/\/openapi\.qiandao\.com\/(?!(?:gitlab|aliyun)\/)[^\s`)]|\/(?:auth|spu|tag|island|wishspu|folder|mark|post|comment|oss|ocr|user)\/v\d+\//, target);
        assert.doesNotMatch(text, /qd\.[a-zA-Z]+\s*\(/, target);
      }
    }
  }
  walk(path.join(root, 'skills/qdmp-skill'));
});

function audioFixture(overrides = {}, record = () => {}) {
  const events = [];
  const owner = { customPlay() { assert.equal(this, owner); events.push('play'); } };
  const bindings = {
    create: { id: 'dynamic-factory', invoke: () => { events.push('create'); return owner; } },
    play: { id: 'dynamic-play', invoke: audio => audio.customPlay(), configureSource: (audio, source) => { assert.equal(audio, owner); events.push(['source', source]); } },
    pause: { id: 'dynamic-pause', invoke: audio => { assert.equal(audio, owner); events.push('pause'); } },
    stop: { id: 'dynamic-stop', invoke: () => events.push('stop') },
    destroy: { id: 'dynamic-dispose', invoke: () => events.push('destroy') },
    ...overrides,
  };
  return { controls: createAudioControls(bindings, record), owner, events, bindings };
}

test('dynamic bindings retain explicit creation, source reuse, pause/resume and disposal', async () => {
  const { controls, events, owner } = audioFixture();
  await assert.rejects(controls.play('sound'), /请先创建/);
  assert.deepEqual(events, []);
  assert.equal(await controls.create(), owner);
  await assert.rejects(controls.create(), /已有音频实例/);
  await controls.play('sound');
  await controls.pause();
  await controls.play();
  await controls.stop();
  await controls.destroy();
  await assert.rejects(controls.play(), /请先创建/);
  assert.deepEqual(events, ['create', ['source', 'sound'], 'play', 'pause', 'play', 'stop', 'destroy']);
});

test('original errors, sync undefined and Promise results survive logging failures', async () => {
  const records = [];
  const failure = new Error('native failure');
  const fixture = audioFixture({
    pause: { id: 'dynamic-async', invoke: async () => { throw failure; } },
    stop: { id: 'dynamic-sync', invoke: () => { throw failure; } },
  }, record => { records.push(record); throw new Error('log failure'); });
  await fixture.controls.create();
  assert.equal(await fixture.controls.play('source'), undefined);
  await assert.rejects(fixture.controls.pause(), error => error === failure);
  await assert.rejects(fixture.controls.stop(), error => error === failure);
  assert.ok(records.some(record => record.phase === 'returned' && record.value === undefined));
  assert.ok(records.some(record => record.phase === 'rejected' && record.error === failure));
  assert.ok(records.some(record => record.phase === 'threw' && record.error === failure));
});

test('failed destroy retains the instance; concurrent control is blocked', async () => {
  let finish;
  const failure = new Error('dispose failure');
  const fixture = audioFixture({
    pause: { id: 'slow', invoke: () => new Promise(resolve => { finish = resolve; }) },
    destroy: { id: 'failed', invoke: () => { throw failure; } },
  });
  await fixture.controls.create();
  const pending = fixture.controls.pause();
  await assert.rejects(fixture.controls.stop(), /请等待/);
  finish(); await pending;
  await assert.rejects(fixture.controls.destroy(), error => error === failure);
  await fixture.controls.play('retained');
});

test('missing facts and source configuration never fall back to embedded native calls', async () => {
  await assert.rejects(createAudioControls({}, () => {}).create(), /缺少已核实/);
  const fixture = audioFixture({ play: { id: 'play', invoke: () => assert.fail('must not invoke') } });
  await fixture.controls.create();
  await assert.rejects(fixture.controls.play('source'), /缺少已核实的音源/);
});
