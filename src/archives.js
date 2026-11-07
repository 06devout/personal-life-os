import { calculate } from '../public/metrics.js';

export function buildYearSnapshot(records, year, today) {
  const cutoff = `${year}-12-31` < today ? `${year}-12-31` : today;
  const yearStart = `${year}-01-01`;
  const filtered = Object.fromEntries(Object.entries(records).map(([model, rows]) => [model, rows.filter(row => model === 'flights' && !row.date ? row.flight_year < Number(cutoff.slice(0, 4)) || row.flight_year === year && cutoff === `${year}-12-31` : !(row.date || row.start_date) || (row.date || row.start_date) <= cutoff).map(row => model === 'trips' && row.end_date > cutoff ? { ...row, end_date: cutoff } : row)]));
  const calculated = calculate(filtered, year, cutoff);
  const { journalDays, flightCount, flightMiles, travelDays, studyHours, sportsHours, categories } = calculated;
  return {
    summary: { journalDays, flightCount, flightMiles, travelDays, studyHours, sportsHours, categories },
    challenges: filtered.challenges.filter(row => !row.end_date || row.end_date >= yearStart || row.type === '终身挑战').map(row => ({ definition: row, progress: calculated.challenges[row.id] })),
    accounts: filtered.loyalty_accounts.map(row => {
      const { number, ...definition } = row;
      return { definition, progress: calculated.accounts[row.id] };
    }),
    basis: '按存档时现有的账户初始值、等级、保级周期与挑战定义计算，仅纳入截止日及以前的流水。补做往年存档不能还原当时未保存的等级或初始值；不清空或重置任何原始数据。'
  };
}
