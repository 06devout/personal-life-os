import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { normalizeAircraft, prepareFlightImport, importPreparedFlights } from '../src/flight-import.js';
import { openStore, calculate } from '../src/store.js';
import { buildYearSnapshot } from '../src/archives.js';

function fixture(context) {
  const directory = mkdtempSync(join(tmpdir(), 'life-os-flight-import-'));
  const store = openStore(directory);
  context.after(() => { store.database.close(); rmSync(directory, { recursive: true, force: true }); });
  return store;
}
const payload = () => ({ batch: 'synthetic-test', distance_unit: 'km', rows: [
  [1, 'ZZxxxx', '2013xxxx', '甲机场', 'xxxx', '乙机场', 'xxxx', 'A330-xxx', null, null, '中间机场'],
  [2, 'ZZ123', '20250102', '甲机场', '2330', '乙机场', '0005(+1)', 'A321-251(NX)', 1609.344, 123.45, '']
] });

test('机型标准化保留子型、NEO、ER，移除客户代码与翼梢标记', () => {
  for (const [original, expected] of [
    ['A321-213', '321-200'], ['A321-251(NX)', '321-200NEO'], ['A321-231(SL)', '321-200'],
    ['A320-271(N)', '320-200NEO'], ['A320-232', '320-200'],
    ['A330-243', '330-200'], ['A330-343(X)', '330-300'], ['A330-941', '330-900'],
    ['B777-36N(ER)', '777-300ER'], ['B777-3DZ(ER)', '777-300ER'], ['B747-4J6', '747-400'],
    ['B737-81B(WL)', '737-800'], ['B737-89L', '737-800'], ['B737 MAX 8', '737 MAX 8'],
    ['B787-9', '787-9'], ['A350-941', '350-900'], ['A380-861', '380-800'],
    ['ERJ190 E2', 'ERJ190-E2'], ['ERJ190(LR)', 'ERJ190-LR'], ['ATR72-500', 'ATR72-500'],
    ['CRJ-900LR', 'CRJ-900LR'], ['A330-xxx', '330（子型号未知）'], ['', '']
  ]) assert.equal(normalizeAircraft(original), expected, original);
  assert.throws(() => normalizeAircraft('unrecognized'), /尚未定义/);
});

test('历史导入保留年份、经停、次日到达；公里转换；重复运行不覆盖编辑', context => {
  const store = fixture(context);
  const prepared = prepareFlightImport(payload());
  assert.deepEqual(importPreparedFlights(store, prepared), { inserted: 2, skipped: 0 });
  const partial = store.get('flights', prepared[0].id);
  const exact = store.get('flights', prepared[1].id);
  assert.equal(partial.date, '');
  assert.equal(partial.flight_year, 2013);
  assert.equal(partial.via, '中间机场');
  assert.equal(exact.distance, 1000);
  assert.equal(exact.arrival_time, '00:05');
  assert.equal(exact.arrival_day_offset, 1);
  assert.equal(exact.price, 123.45);
  assert.equal(exact.miles, null);
  assert.equal(exact.account_id, '');
  assert.equal(calculate(store.all(), 2013).flightCount, 1);
  assert.equal(calculate(store.all(), 2025).flightMiles, 1000);
  store.save('flights', { ...exact, aircraft: '自定义修改' }, exact.id);
  assert.deepEqual(importPreparedFlights(store, prepared), { inserted: 0, skipped: 2 });
  assert.equal(store.get('flights', exact.id).aircraft, '自定义修改');
  const backup = store.exportData();
  store.importData(backup);
  assert.equal(store.get('flights', partial.id).flight_year, 2013);
  assert.equal(store.get('flights', partial.id).date, '');
  assert.equal(buildYearSnapshot(store.all(), 2013, '2026-01-01').summary.flightCount, 1);
  assert.equal(buildYearSnapshot(store.all(), 2013, '2013-06-01').summary.flightCount, 0);
});

test('不完整日期禁止虚假会员入账，错误批次整体回滚', context => {
  const store = fixture(context);
  assert.throws(() => store.save('flights', { airline: 'ZZ', origin: '甲', destination: '乙' }), /年份/);
  assert.throws(() => store.save('flights', { airline: 'ZZ', origin: '甲', destination: '乙', flight_year: 2013.5 }), /年份/);
  const account = store.save('loyalty_accounts', { name: '测试', type: '航空', cycle_start: '2013-01-01' });
  assert.throws(() => store.save('flights', { airline: 'ZZ', origin: '甲', destination: '乙', flight_year: 2013, account_id: account.id }), /补全日期/);
  const invalid = payload(); invalid.rows[1][2] = '20250230';
  assert.throws(() => importPreparedFlights(store, prepareFlightImport(invalid)), /日期无效/);
  assert.equal(store.list('flights').length, 0);
  assert.throws(() => prepareFlightImport({ ...payload(), distance_unit: 'miles' }), /公里/);
});
