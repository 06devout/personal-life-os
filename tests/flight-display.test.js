import { test } from 'node:test';
import assert from 'node:assert/strict';
import { airportCode, normalizeFlightAirports } from '../public/airports.js';
import { milesToKilometers, kilometersToMiles } from '../public/units.js';

test('飞行距离界面公里与内部英里往返转换，未知距离不显示为零', () => {
  assert.equal(milesToKilometers(1000), 1609.344);
  assert.equal(kilometersToMiles(1609.344), 1000);
  for (const value of [null, undefined, '']) {
    assert.equal(milesToKilometers(value), null);
    assert.equal(kilometersToMiles(value), null);
  }
  assert.equal(milesToKilometers(0), 0);
  for (const kilometers of [96, 2095, 6166, 100212]) assert.equal(milesToKilometers(kilometersToMiles(kilometers)), kilometers);
});

test('机场三字码区分同城机场，移除航站楼但不丢失原文', () => {
  for (const [original, code] of [
    ['北京首都T3', 'PEK'], ['北京大兴', 'PKX'], ['上海浦东T1', 'PVG'], ['上海虹桥T2', 'SHA'],
    ['成都天府T2', 'TFU'], ['成都双流T1', 'CTU'], ['福冈国际线', 'FUK'], ['布里斯班D', 'BNE'],
    ['中卫沙坡头', 'ZHY'], ['漠河古莲', 'OHE'], ['芜湖宣州', 'WHA'], ['西双版纳嘎洒', 'JHG'],
    ['多哈哈马德', 'DOH'], ['丰沙尔克里斯蒂亚诺·罗纳尔多', 'FNC'], ['维尔纽斯国际', 'VNO'],
    [' pek ', 'PEK'], ['甲机场', '甲机场']
  ]) assert.equal(airportCode(original), code);
  const input = { origin: '北京首都T3', destination: '东京羽田T3', via: '大连周水子, 上海浦东T1', notes: '已有备注' };
  const normalized = normalizeFlightAirports(input);
  assert.equal(normalized.origin, 'PEK');
  assert.equal(normalized.destination, 'HND');
  assert.equal(normalized.via, 'DLC / PVG');
  assert.ok(normalized.notes.includes('已有备注'));
  assert.ok(normalized.notes.includes('原始出发机场：北京首都T3'));
  assert.equal(input.origin, '北京首都T3');
  assert.deepEqual(normalizeFlightAirports(normalized), normalized);
});
