import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.js';
import { buildFlightHistory, findUnknownFlightReferences } from '../public/flight-history.js';
import { airportKnown, airportCode } from '../public/airports.js';

function fixture(context) {
  const directory = mkdtempSync(join(tmpdir(), 'life-os-directory-'));
  const store = openStore(directory);
  context.after(() => { store.database.close(); rmSync(directory, { recursive: true, force: true }); });
  return { store, directory };
}
const airport = { kind: 'airport', code: 'xyz', name: '测试城国际机场', aliases: ['测试城机场'] };
const airline = { kind: 'airline', code: 'z9', name: '示例航空', aliases: ['示例航司'] };

test('未知项只补一次，历史归并与后续复用，重启不再提示', context => {
  const { store, directory } = fixture(context);
  const historical = store.save('flights', { date: '2025-01-01', airline: '示例航司', origin: '测试城机场', destination: 'PEK' });
  assert.equal(findUnknownFlightReferences(store.list('flights')).length, 2);
  store.saveReference(airport); store.saveReference(airline);
  const entries = store.listDirectory();
  assert.equal(findUnknownFlightReferences(store.list('flights'), entries).length, 0);
  const history = buildFlightHistory(store.list('flights'), { directory: entries, asOf: '2026-01-01' });
  assert.equal(history.airports[0].label, 'XYZ');
  assert.equal(history.airports[0].fullName, '测试城国际机场');
  assert.equal(history.airlines[0].label, 'Z9');
  assert.equal(history.airlines[0].fullName, '示例航空');
  assert.equal(store.get('flights', historical.id).origin, '测试城机场');
  const next = store.save('flights', { date: '2025-01-02', airline: '示例航司', origin: '测试城机场T2', destination: 'PEK' });
  assert.equal(next.origin, 'XYZ');
  assert.ok(airportKnown('测试城机场T2', entries));
  assert.equal(airportCode('测试城机场T2', entries), 'XYZ');
  assert.equal(findUnknownFlightReferences([next], entries).length, 0);
  const reopened = openStore(directory);
  assert.equal(findUnknownFlightReferences(reopened.list('flights'), reopened.listDirectory()).length, 0);
  reopened.database.close();
});

test('类型与代码校验、别名唯一、不覆盖其他内置映射', context => {
  const { store } = fixture(context);
  assert.throws(() => store.saveReference({ ...airport, code: 'XX' }), /三个/);
  assert.throws(() => store.saveReference({ ...airline, code: 'ZZZ' }), /两个/);
  assert.throws(() => store.saveReference({ ...airport, aliases: ['PEK'] }), /内置代码/);
  assert.throws(() => store.saveReference({ ...airline, aliases: ['国航'] }), /内置代码/);
  store.saveReference(airport);
  assert.throws(() => store.saveReference({ ...airport, code: 'ZZZ' }), /已对应/);
  store.saveReference({ ...airport, aliases: ['Another airport'] });
  assert.ok(store.listDirectory()[0].aliases.includes('测试城机场'));
  assert.throws(() => store.saveReference({ ...airport, code: 'ZZZ', name: '另一机场', aliases: ['another AIRPORT'] }), /已对应/);
  store.saveReference({ ...airport, aliases: ['新别名'] }, true);
  assert.deepEqual(store.listDirectory()[0].aliases, ['新别名']);
  store.removeReference('airport', 'XYZ');
  assert.equal(store.listDirectory().length, 0);
});

test('资料库完整备份恢复，坏导入原子回滚，兼容旧备份', context => {
  const { store } = fixture(context);
  store.saveReference(airport); store.saveReference(airline);
  const backup = store.exportData();
  store.removeReference('airport', 'XYZ');
  store.importData(backup);
  assert.equal(store.listDirectory().length, 2);
  assert.ok(airportKnown('测试城机场', store.listDirectory()));
  const invalid = structuredClone(backup);
  invalid.directory.push({ ...airport, code: 'ZZZ' });
  assert.throws(() => store.importData(invalid), /已对应/);
  assert.equal(store.listDirectory().length, 2);
  const duplicate = structuredClone(backup); duplicate.directory.push(duplicate.directory[0]);
  assert.throws(() => store.importData(duplicate), /重复代码/);
  assert.equal(store.listDirectory().length, 2);
  delete backup.directory;
  store.importData(backup);
  assert.equal(store.listDirectory().length, 0);
});
