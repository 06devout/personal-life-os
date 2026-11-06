export const localDate = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
export function calculate(data, year = Number(localDate().slice(0, 4))) {
  const events = [];
  const accounts = Object.fromEntries(data.loyalty_accounts.map(account => [account.id, { balance: account.balance || 0, annual: account.annual || 0, lifetime: account.lifetime || 0, spend: account.spend || 0 }]));
  for (const source of ['flights', 'hotel_stays', 'loyalty_transactions']) for (const row of data[source]) {
    if (['flights', 'hotel_stays'].includes(source) && row.accrual_mode === '直接入账') {
      const current = accounts[row.account_id];
      const account = data.loyalty_accounts.find(item => item.id === row.account_id);
      if (current && account) {
        current.balance += Number((source === 'flights' ? row.miles : row.points) || 0);
        current.lifetime += Number((source === 'flights' ? row.lifetime_credit : row.lifetime_nights ?? row.nights) || 0);
        if ((!account.cycle_start || row.date >= account.cycle_start) && (!account.expiry || row.date <= account.expiry)) {
          current.annual += Number((source === 'flights' ? row.qualifying : row.nights) || 0);
          current.spend += Number(row.spend || 0);
        }
      }
      continue;
    }
    for (const rule of row._rules || []) {
      const amount = Number(row[rule.metric] || 0) * Number(rule.multiplier || 0);
      const account = data.loyalty_accounts.find(item => item.id === rule.account_id);
      if (accounts[rule.account_id] && (!['annual', 'spend'].includes(rule.destination) || (row.date >= account.cycle_start && (!account.expiry || row.date <= account.expiry)))) accounts[rule.account_id][rule.destination] += amount;
      if (rule.challenge_id) events.push({ challenge_id: rule.challenge_id, date: row.date, amount, source, id: row.id });
    }
  }
  events.push(...data.challenge_progress);
  const challenges = Object.fromEntries(data.challenges.map(challenge => {
    const history = events.filter(event => event.challenge_id === challenge.id && event.date >= challenge.start_date && (!challenge.end_date || event.date <= challenge.end_date)).sort((first, second) => first.date.localeCompare(second.date) || first.id.localeCompare(second.id));
    let current = Number(challenge.initial || 0);
    const points = history.map(event => ({ ...event, value: current += event.amount }));
    const elapsed = Math.max(1, Math.floor((Date.parse(`${localDate()}T00:00:00Z`) - Date.parse(`${challenge.start_date}T00:00:00Z`)) / 86400000));
    const rate = (current - Number(challenge.initial || 0)) / elapsed;
    const remaining = Math.max(0, challenge.target - current);
    const days = rate > 0 ? Math.ceil(remaining / rate) : null;
    const projected = days !== null && days < 365000 ? new Date(Date.parse(`${localDate()}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10) : null;
    const status = current >= challenge.target ? '已完成' : ['已暂停', '失败 / 过期'].includes(challenge.status) ? challenge.status : challenge.end_date && challenge.end_date < localDate() ? '失败 / 过期' : challenge.status === '已完成' ? '进行中' : challenge.status;
    return [challenge.id, { current, percent: Math.max(0, Math.min(100, current / challenge.target * 100)), remaining, projected, history: points, status }];
  }));
  const selected = row => (row.date || row.start_date || '').startsWith(String(year));
  const activities = data.activities.filter(selected);
  const hours = row => (Number(row.end?.slice(0, 2)) * 60 + Number(row.end?.slice(3)) - Number(row.start?.slice(0, 2)) * 60 - Number(row.start?.slice(3))) / 60;
  const categories = data.categories.map(category => ({ ...category, hours: activities.filter(row => row.category_id === category.id).reduce((total, row) => total + hours(row), 0) }));
  const travelDays = new Set();
  for (const trip of data.trips) {
    let current = Math.max(Date.parse(`${trip.start_date}T00:00:00Z`), Date.parse(`${year}-01-01T00:00:00Z`));
    const end = Math.min(Date.parse(`${trip.end_date}T00:00:00Z`), Date.parse(`${year}-12-31T00:00:00Z`));
    for (; current <= end; current += 86400000) travelDays.add(new Date(current).toISOString().slice(0, 10));
  }
  return { accounts, challenges, categories, travelDays: travelDays.size, journalDays: data.daily_entries.filter(selected).length, flightCount: data.flights.filter(selected).length, flightMiles: data.flights.filter(selected).reduce((total, row) => total + row.distance, 0), studyHours: categories.filter(row => row.kind === '学习').reduce((total, row) => total + row.hours, 0), sportsHours: categories.filter(row => row.kind === '运动').reduce((total, row) => total + row.hours, 0), hours };
}
