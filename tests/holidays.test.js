import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { spawnSync } from 'node:child_process';
import { holidaysOn, holidayNotice } from '../public/holidays.js';

const names = date => holidaysOn(date).map(holiday => holiday.name);

test('2026 十二个节日日期、重合节日与节日详情', () => {
  const expected = [
    ['2026-01-01', '元旦'], ['2026-02-16', '除夕'], ['2026-02-17', '春节'],
    ['2026-04-05', '清明'], ['2026-04-05', '复活节'], ['2026-05-01', '劳动节'],
    ['2026-06-19', '端午'], ['2026-09-25', '中秋'], ['2026-10-01', '中国国庆节'],
    ['2026-11-26', '感恩节'], ['2026-12-24', '平安夜'], ['2026-12-25', '圣诞节']
  ];
  for (const [date, name] of expected) assert.ok(names(date).includes(name), `${date} ${name}`);
  assert.deepEqual(names('2026-04-05'), ['复活节', '清明']);
  assert.deepEqual(names('2026-02-18'), []);
  assert.ok(holidaysOn('2026-11-26')[0].description.includes('美国'));
  assert.ok(holidayNotice(2026).includes('不含法定连休'));
});

test('农历大小月、跨年份、闰月和重合国庆中秋', () => {
  for (const [date, name] of [['2024-02-09', '除夕'], ['2024-02-10', '春节'], ['2025-01-28', '除夕'], ['2025-01-29', '春节'], ['2025-05-31', '端午'], ['2025-10-06', '中秋'], ['2027-02-05', '除夕'], ['2027-02-06', '春节'], ['2027-06-09', '端午'], ['2027-09-15', '中秋']]) assert.ok(names(date).includes(name), `${date} ${name}`);
  assert.deepEqual(new Set(names('2020-10-01')), new Set(['中国国庆节', '中秋']));
  for (const year of [1901, 1976, 2023, 2025, 2026, 2033, 2050, 2100]) {
    const counts = new Map();
    for (let milliseconds = Date.UTC(year, 0, 1, 12); milliseconds < Date.UTC(year + 1, 0, 1, 12); milliseconds += 86400000) {
      for (const holiday of holidaysOn(new Date(milliseconds).toISOString().slice(0, 10))) counts.set(holiday.name, (counts.get(holiday.name) || 0) + 1);
    }
    assert.equal(counts.size, 12, String(year));
    for (const [name, count] of counts) assert.equal(count, 1, `${year} ${name}`);
  }
});

test('清明跨日边界、复活节变化、感恩节不是最后一个星期四', () => {
  for (const date of ['1943-04-06', '1976-04-04', '2024-04-04', '2025-04-04', '2026-04-05', '2027-04-05', '2038-04-05', '2071-04-05']) assert.ok(names(date).includes('清明'), date);
  for (const date of ['2008-03-23', '2024-03-31', '2025-04-20', '2027-03-28', '2038-04-25']) assert.ok(names(date).includes('复活节'), date);
  assert.ok(names('2029-11-22').includes('感恩节'));
  assert.ok(!names('2029-11-29').includes('感恩节'));
});

test('超出支持年份明确降级，浏览器没有内置农历也正常运行', () => {
  assert.deepEqual(names('2200-01-01'), ['元旦']);
  assert.ok(holidayNotice(2200).includes('暂不推算'));
  for (const date of ['', 'invalid', '2026-02-30', '9999-01-01']) assert.deepEqual(names(date), []);
  const runtime = { Intl: { DateTimeFormat() { throw new Error('unsupported'); } } };
  const source = readFileSync(new URL('../public/holidays.js', import.meta.url), 'utf8').replace(/^export /gm, '');
  runInNewContext(source + '\nglobalThis.check = { holidaysOn, holidayNotice };', runtime);
  assert.equal(runtime.check.holidaysOn('2026-01-01')[0].name, '元旦');
  assert.equal(runtime.check.holidaysOn('2027-02-06')[0].name, '春节');
});

test('节日不随设备所在时区偏移', () => {
  for (const timezone of ['Pacific/Honolulu', 'Pacific/Kiritimati', 'Asia/Shanghai']) {
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', "import { holidaysOn } from './public/holidays.js'; console.log(JSON.stringify(['2026-02-17','2026-04-05','2026-11-26'].map(date=>holidaysOn(date).map(holiday=>holiday.name))));"], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), [['春节'], ['复活节', '清明'], ['感恩节']]);
  }
});
