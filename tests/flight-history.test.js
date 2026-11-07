import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFlightHistory } from '../public/flight-history.js';

const flight = (id, date, destination, airline, other = {}) => ({ id, date, destination, airline, origin: 'PEK', number: 'ZZ123', ...other });
const keys = rows => rows.map(row => row.key);

test('机场与航司按首次顺序去重，机场别名与常用航司名称自动归一', () => {
  const rows = [
    flight('later', '2025-03-01', 'PEK', '国航', { departure_time: '08:00' }),
    flight('first', '2025-01-01', '东京羽田T3', 'ca', { departure_time: '08:00' }),
    flight('second', '2025-01-02', 'HND', 'CZ', { departure_time: '09:00' })
  ];
  const before = structuredClone(rows);
  const result = buildFlightHistory(rows, { asOf: '2025-12-31' });
  assert.deepEqual(keys(result.airports), ['PEK', 'HND']);
  assert.deepEqual(keys(result.airlines), ['CA', 'CZ']);
  assert.equal(result.airports[0].count, 4);
  assert.equal(result.airlines[0].count, 2);
  assert.equal(result.airports[0].flightId, 'first');
  assert.deepEqual(rows, before);
  const all = buildFlightHistory(rows, { asOf: '2025-12-31', mode: 'all' });
  assert.deepEqual(keys(all.airports), ['PEK', 'HND', 'PEK', 'HND', 'PEK', 'PEK']);
  assert.deepEqual(keys(all.airlines), ['CA', 'CZ', 'CA']);
});

test('同日时间、仅年份导入序号与日期精度分组稳定，不伪造月日', () => {
  const rows = [
    flight('b', '', 'BBB', 'ZZ', { flight_year: 2013, notes: '原表序号：2' }),
    flight('a', '', 'AAA', 'ZZ', { flight_year: 2013, notes: '历史记录；原表序号：1' }),
    flight('timeless', '2025-01-01', 'CCC', 'ZZ'),
    flight('late', '2025-01-01', 'DDD', 'ZZ', { departure_time: '12:00' }),
    flight('early', '2025-01-01', 'EEE', 'ZZ', { departure_time: '08:00' }),
    flight('year-only', '', 'FFF', 'ZZ', { flight_year: 2025 })
  ];
  const result = buildFlightHistory(rows, { asOf: '2026-01-01' });
  assert.deepEqual(keys(result.airports), ['PEK', 'AAA', 'BBB', 'FFF', 'EEE', 'DDD', 'CCC']);
  assert.equal(result.airports[0].date, '2013');
  assert.equal(result.airports[0].approximate, true);
  assert.equal(result.approximateFlights, 3);
});

test('未来计划默认排除，跨日到达与经停选项，不从航班号猜测承运航司', () => {
  const rows = [
    flight('next-day', '2025-01-01', 'HND', '实际承运航司', { number: 'CA123', arrival_day_offset: 1, via: '大连周水子 / PVG' }),
    flight('future', '2026-01-01', 'KIX', '未来航司'),
    flight('future-year', '', 'HKG', '未来航司', { flight_year: 2027 })
  ];
  const firstDay = buildFlightHistory(rows, { asOf: '2025-01-01' });
  assert.deepEqual(keys(firstDay.airports), ['PEK']);
  assert.equal(firstDay.airlines[0].fullName, '实际承运航司');
  assert.equal(firstDay.airlines[0].label, '待补二字码');
  assert.equal(firstDay.excludedFuture, 2);
  const arrived = buildFlightHistory(rows, { asOf: '2025-01-02', includeStopovers: true });
  assert.deepEqual(keys(arrived.airports), ['PEK', 'DLC', 'PVG', 'HND']);
  assert.equal(arrived.airports[3].date, '2025-01-02');
  const planned = buildFlightHistory(rows, { asOf: '2025-01-01', includePlanned: true });
  assert.deepEqual(keys(planned.airports), ['PEK', 'HND', 'KIX', 'HKG']);
  assert.ok(planned.airports.filter(row => row.key !== 'PEK').every(row => row.planned));
});

test('新增、补录更早记录、修改或删除后列表同步重算，空态安全', () => {
  const rows = [flight('one', '2025-02-01', 'HND', 'CA')];
  assert.deepEqual(keys(buildFlightHistory(rows, { asOf: '2026-01-01' }).airports), ['PEK', 'HND']);
  rows.push(flight('earlier', '2025-01-01', 'KIX', 'CZ'));
  assert.deepEqual(keys(buildFlightHistory(rows, { asOf: '2026-01-01' }).airports), ['PEK', 'KIX', 'HND']);
  rows[1].destination = 'HND'; rows[1].airline = '国航';
  assert.equal(buildFlightHistory(rows, { asOf: '2026-01-01' }).airportCount, 2);
  assert.equal(buildFlightHistory(rows, { asOf: '2026-01-01' }).airlineCount, 1);
  rows.shift();
  assert.equal(buildFlightHistory(rows, { asOf: '2026-01-01' }).airports[0].flightId, 'earlier');
  assert.deepEqual(buildFlightHistory([], { asOf: '2026-01-01' }).airports, []);
});

test('首段出发机场先于到达机场，并展示机场全名，经停保持中间位置', () => {
  const rows = [flight('first', '', 'HAK', '3U', { flight_year: 2013, origin: '北京首都T3', via: '中卫沙坡头', notes: '原表序号：1' })];
  const result = buildFlightHistory(rows, { asOf: '2026-01-01' });
  assert.deepEqual(keys(result.airports), ['PEK', 'HAK']);
  assert.equal(result.airports[0].role, '出发');
  assert.equal(result.airports[0].fullName, '北京首都国际机场');
  assert.equal(result.airports[1].role, '到达');
  assert.equal(result.airports[1].fullName, '海口美兰国际机场');
  const stopovers = buildFlightHistory(rows, { asOf: '2026-01-01', includeStopovers: true });
  assert.deepEqual(keys(stopovers.airports), ['PEK', 'ZHY', 'HAK']);
  assert.equal(stopovers.airports[1].fullName, '中卫沙坡头机场');
});

test('航司显示大写 IATA 二字码和独立名称，IATA / ICAO / 中文别名合并', () => {
  const rows = [
    flight('one', '2025-01-01', 'HAK', 'ca'), flight('two', '2025-01-02', 'HND', 'CCA'),
    flight('three', '2025-01-03', 'KIX', '国航'), flight('four', '2025-01-04', 'MFM', 'NX'),
    flight('five', '2025-01-05', 'OSL', 'D8')
  ];
  const result = buildFlightHistory(rows, { asOf: '2026-01-01' });
  assert.equal(result.airlineCount, 3);
  assert.deepEqual(result.airlines.map(row => [row.label, row.fullName]), [['CA', '中国国际航空'], ['NX', '澳门航空'], ['D8', '挪威航空瑞典']]);
  assert.equal(result.airlines[0].count, 3);
  assert.equal(rows[0].airline, 'ca');
});
