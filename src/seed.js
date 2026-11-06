import { localDate } from './store.js';

export function seed(store) {
  if (store.list('categories').length) return;
  const categories = [
    ['学习与阅读', '#a6bfa3', '学习'], ['研究 / 工作', '#9daed0', '工作'], ['旅行', '#d6b389', '其他'],
    ['交通出行', '#abb8c0', '其他'], ['运动健身', '#b1c4a0', '运动'], ['休闲娱乐', '#d2a6b1', '娱乐'],
    ['社交', '#c2b0d3', '其他'], ['日常生活', '#c6baa1', '其他'], ['其他', '#b4b4b4', '其他']
  ];
  for (const [name, color, kind] of categories) store.save('categories', { name, color, kind });
}

export function demo(store) {
  if (store.database.prepare("SELECT value FROM settings WHERE key = 'demo_loaded'").get()) throw new Error('演示数据已添加过，避免重复导入');
  const today = localDate();
  const year = today.slice(0, 4);
  const relative = days => { const value = new Date(); value.setDate(value.getDate() + days); return localDate(value); };
  store.database.exec('BEGIN');
  try {
    const category = store.list('categories');
    const study = category.find(item => item.kind === '学习');
    const sports = category.find(item => item.kind === '运动');
    const work = category.find(item => item.kind === '工作');
    const challenge = store.save('challenges', { name: '把阅读变成日常', type: '年度挑战', category: '个人成长', start_date: `${year}-01-01`, end_date: `${year}-12-31`, initial: 12, target: 30, unit: '本', status: '进行中', milestones: '10,20,30', notes: '演示记录，可编辑或删除。' });
    store.save('challenge_progress', { challenge_id: challenge.id, date: relative(-5), amount: 3, source: '手动记录', notes: '读完三本期待已久的书' });
    store.save('challenges', { name: '认真运动，保持能量', type: '年度挑战', start_date: `${year}-01-01`, end_date: `${year}-12-31`, initial: 68, target: 150, unit: '天', status: '进行中' });
    const account = store.save('loyalty_accounts', { name: '旅途常客 · 演示计划', type: '酒店', brand: '示例酒店集团', number: 'DEMO-12345678', tier: '探索会员', balance: 12500, lifetime: 120, annual: 26, annual_target: 50, retain_target: 30, lifetime_target: 600, cycle_start: `${year}-01-01`, expiry: `${year}-12-31`, notes: '虚构计划与规则，不代表任何真实计划标准。' });
    store.save('loyalty_rules', { name: '示例：合资格房晚计入年度', account_id: account.id, source: 'hotel_stays', metric: 'nights', multiplier: 1, destination: 'annual', effective: `${year}-01-01` });
    store.save('loyalty_rules', { name: '示例：合资格房晚计入终身', account_id: account.id, source: 'hotel_stays', metric: 'nights', multiplier: 1, destination: 'lifetime', effective: `${year}-01-01` });
    const trip = store.save('trips', { name: '京都 · 慢下来的一周', start_date: relative(-12), end_date: relative(-7), country: '日本', city: '京都,大阪', purpose: '休息与城市漫步', transport: '飞机 / 铁路', notes: '演示旅行：给自己一点无所事事的时间。' });
    store.save('flights', { date: relative(-12), airline: '示例航空', number: 'DEMO101', origin: 'PVG', destination: 'KIX', aircraft: 'A320', cabin: '经济舱', distance: 831, miles: 500, qualifying: 100, price: 1200, trip_id: trip.id });
    store.save('hotel_stays', { accrual_mode: '按高级规则', name: '京都花园酒店（演示）', date: relative(-12), checkout: relative(-7), nights: 5, points: 2000, spend: 3600, city: '京都', trip_id: trip.id, account_id: account.id });
    for (let offset = 20; offset >= 0; offset--) {
      if (offset % 4 === 1) continue;
      const date = relative(-offset);
      if (!store.list('daily_entries').some(row => row.date === date)) store.save('daily_entries', { date, city: '上海', country: '中国', summary: offset === 0 ? '给生活留一点被看见的痕迹。' : ['有进展，也有值得记住的小事。', '认真工作，也记得好好生活。', '散步、阅读，平常的一天也很好。'][offset % 3], content: '## 今天的小确幸\n\n完成了一点计划中的事，也给自己留了一些空白。\n\n- 阅读与思考\n- 好好吃饭\n- 感谢今天的自己', mood: offset % 3 + 3, sleep: 7 + offset % 3 / 2, steps: 4500 + offset * 231, tags: '日常,成长' });
    }
    for (const [name, start, end, selected] of [['晨间阅读', '07:30', '08:15', study], ['专注工作', '09:00', '11:30', work], ['傍晚慢跑', '18:00', '18:45', sports]]) if (selected) store.save('activities', { name, date: today, start, end, category_id: selected.id, location: '上海' });
    store.save('documents', { name: '旅行护照（演示）', type: '护照', issuer: '示例签发机构', number: 'DEMO123456', expiry: relative(75), remind_days: 90, renewable: true, notes: '虚构证件，请替换为真实信息。' });
    store.save('todos', { name: '留十分钟，记录今天', date: today, done: false });
    store.save('todos', { name: '规划下次旅行', date: today, done: false });
    store.database.prepare("INSERT INTO settings VALUES ('demo_loaded', 'true')").run();
    store.database.exec('COMMIT');
  } catch (error) { store.database.exec('ROLLBACK'); throw error; }
}
