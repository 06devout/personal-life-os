import { createHash } from 'node:crypto';

export function normalizeAircraft(value) {
  const original = String(value || '').trim();
  if (!original) return '';
  const model = original.toUpperCase().replace(/\s+/g, '');
  const unknown = /^(?:A|B)?(\d{3})-X+$/.exec(model);
  if (unknown) return `${unknown[1]}（子型号未知）`;
  if (/^(?:B)?737MAX8$/.test(model)) return '737 MAX 8';
  if (/^(?:ERJ|E)?190E2$/.test(model)) return 'ERJ190-E2';
  if (/^(?:ERJ|E)?190\(LR\)$/.test(model)) return 'ERJ190-LR';
  if (/^ATR72-500$/.test(model)) return 'ATR72-500';
  if (/^CRJ-?900LR$/.test(model)) return 'CRJ-900LR';
  const airbus = /^A?(3\d{2})-(\d{3})(?:\(([^)]+)\))?$/.exec(model);
  if (airbus) {
    const family = airbus[1];
    const variant = Math.floor(Number(airbus[2]) / 100) * 100;
    const neo = ['320', '321'].includes(family) && (/^(?:N|NX)$/.test(airbus[3] || '') || /^2[57]\d$/.test(airbus[2]));
    return `${family}-${variant}${neo ? 'NEO' : ''}`;
  }
  const boeing = /^B?(7\d{2})-(\d)(?:[0-9A-Z]{2})?(?:\((ER|LR|WL)\))?$/.exec(model);
  if (boeing) {
    const family = boeing[1];
    const variant = ['787'].includes(family) ? boeing[2] : `${boeing[2]}00`;
    const suffix = ['ER', 'LR'].includes(boeing[3]) ? boeing[3] : '';
    return `${family}-${variant}${suffix}`;
  }
  throw new Error(`尚未定义该机型的标准化方式：${original}`);
}

function parseTime(value) {
  const raw = String(value || '').trim();
  if (!raw || /^x+$/i.test(raw)) return { time: '', offset: null };
  const matched = /^(\d{2})(\d{2})(?:\(\+(\d+)\))?$/.exec(raw);
  if (!matched || Number(matched[1]) > 23 || Number(matched[2]) > 59) throw new Error(`无法识别时间：${raw}`);
  return { time: `${matched[1]}:${matched[2]}`, offset: matched[3] ? Number(matched[3]) : 0 };
}

export function prepareFlightImport(payload) {
  if (!payload || payload.distance_unit !== 'km' || !Array.isArray(payload.rows) || typeof payload.batch !== 'string' || !payload.batch) throw new Error('导入文件必须指定批次、公里单位和记录数组');
  const seen = new Set();
  return payload.rows.map(row => {
    if (!Array.isArray(row) || row.length !== 11 || !Number.isInteger(row[0]) || seen.has(row[0])) throw new Error('记录列数或序号无效 / 重复');
    seen.add(row[0]);
    const [sequence, number, rawDate, origin, departure, destination, arrival, rawAircraft, kilometers, fare, via] = row;
    if (typeof rawDate !== 'string' || !/^(?:\d{8}|\d{4}xxxx)$/.test(rawDate)) throw new Error(`第 ${sequence} 条日期无效`);
    if (!/^[A-Z0-9]{2}/.test(number || '') || !origin || !destination) throw new Error(`第 ${sequence} 条航班信息不完整`);
    for (const value of [kilometers, fare]) if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) throw new Error(`第 ${sequence} 条数值无效`);
    const depart = parseTime(departure);
    const arrive = parseTime(arrival);
    const yearOnly = rawDate.endsWith('xxxx');
    const date = yearOnly ? '' : `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    const id = 'flightlog-' + createHash('sha256').update(`${payload.batch}:${sequence}`).digest('hex').slice(0, 32);
    return {
      id,
      data: {
        date, flight_year: Number(rawDate.slice(0, 4)), number, airline: number.slice(0, 2), origin, destination,
        departure_time: depart.time, arrival_time: arrive.time, arrival_day_offset: arrive.offset,
        via: via || '', aircraft: normalizeAircraft(rawAircraft),
        distance: kilometers === null ? null : kilometers / 1.609344,
        price: fare, account_id: '', accrual_mode: '直接入账',
        notes: `历史飞行记录导入；原表序号：${sequence}\n原始日期：${rawDate}${yearOnly ? '（仅年份，具体月日待补）' : ''}\n原始机型：${rawAircraft || '未记录'}\n原始距离：${kilometers === null ? '未记录' : kilometers + ' 公里（已换算为系统英里）'}\n原始票价：${fare === null ? '未记录' : fare}（按原表金额保存，未另行提供币种）\n原始起降当地时间：${departure || '未记录'} / ${arrival || '未记录'}\n经停：${via || '未记录'}\n未提供会员计划及奖励里程，不自动累计。`
      }
    };
  });
}

export function importPreparedFlights(store, records) {
  let inserted = 0;
  let skipped = 0;
  store.database.exec('BEGIN IMMEDIATE');
  try {
    for (const record of records) {
      if (store.database.prepare('SELECT id FROM flights WHERE id = ?').get(record.id)) { skipped++; continue; }
      store.save('flights', record.data, record.id);
      inserted++;
    }
    store.database.exec('COMMIT');
  } catch (error) { store.database.exec('ROLLBACK'); throw error; }
  return { inserted, skipped };
}
