import { calculate } from '../public/metrics.js';

export function archiveCutoff(year, today, coverage = 'to_date') {
  return coverage === 'full_year' || `${year}-12-31` < today ? `${year}-12-31` : today;
}
export function buildYearSnapshot(records, year, today, coverage = 'to_date') {
  const cutoff = archiveCutoff(year, today, coverage);
  const yearStart = `${year}-01-01`;
  const filtered = Object.fromEntries(Object.entries(records).map(([model, rows]) => [model, rows.filter(row => model === 'flights' && !row.date ? row.flight_year < Number(cutoff.slice(0, 4)) || row.flight_year === year && cutoff === `${year}-12-31` : !(row.date || row.start_date) || (row.date || row.start_date) <= cutoff).map(row => model === 'trips' && row.end_date > cutoff ? { ...row, end_date: cutoff } : row)]));
  const calculated = calculate(filtered, year, cutoff);
  const { journalDays, flightCount, flightMiles, travelDays, studyHours, sportsHours, categories } = calculated;
  return {
    coverage, captured_on: today, includes_future: cutoff > today,
    summary: { journalDays, flightCount, flightMiles, travelDays, studyHours, sportsHours, categories },
    plan: {
      flights: filtered.flights.filter(row => (row.date || String(row.flight_year || '')).startsWith(String(year))),
      hotel_stays: filtered.hotel_stays.filter(row => (row.checkout || row.date) >= yearStart),
      activities: filtered.activities.filter(row => row.date >= yearStart),
      trips: records.trips.filter(row => row.start_date <= cutoff && row.end_date >= yearStart)
    },
    challenges: filtered.challenges.filter(row => !row.end_date || row.end_date >= yearStart || row.type === '终身挑战').map(row => ({ definition: row, progress: calculated.challenges[row.id] })),
    accounts: filtered.loyalty_accounts.map(row => {
      const { number, ...definition } = row;
      return { definition, progress: calculated.accounts[row.id] };
    }),
    basis: (coverage === 'full_year' ? '全年口径：覆盖所选年度至 12 月 31 日，包含已经录入的未来航班、住宿、活动、旅行与进度流水。含未来计划时，汇总是计划结果，不表示实际已完成。' : '截至存档时点口径：今年截止今天，往年截止当年 12 月 31 日，不计入截止日之后的计划。') + '按存档时现有的账户初始值、等级、保级周期与挑战定义计算。补做往年存档不能还原当时未保存的等级或初始值；不清空或重置任何原始数据。'
  };
}
