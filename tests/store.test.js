import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, calculate, localDate } from '../src/store.js';
import { seed, demo } from '../src/seed.js';

function fixture(context) {
  const directory = mkdtempSync(join(tmpdir(), 'life-os-test-'));
  const store = openStore(directory);
  context.after(() => { try { store.database.close(); } catch {} rmSync(directory, { recursive: true, force: true }); });
  seed(store);
  return { store, directory };
}
const accountInput = { name: '测试酒店', type: '酒店', number: 'SECRET-123456', balance: 100, annual: 10, lifetime: 50, cycle_start: '2026-01-01', expiry: '2026-12-31', annual_target: 50, lifetime_target: 600 };
const challengeInput = { name: '测试挑战', type: '年度挑战', start_date: '2026-01-01', end_date: '2026-12-31', target: 50, initial: 0, unit: '晚', status: '进行中' };

test('会员小数房晚及积分在保存、累计、备份恢复和存档中保持精度', context => {
  const { store } = fixture(context);
  const account = store.save('loyalty_accounts', { ...accountInput, annual: 20.5, lifetime: 100.5, balance: 500.5 });
  const stay = store.save('hotel_stays', { name: '小数房晚', date: '2026-01-01', checkout: '2026-01-02', nights: 1.25, points: 100.25, account_id: account.id });
  assert.equal(store.get('hotel_stays', stay.id).nights, 1.25);
  assert.equal(store.get('loyalty_accounts', account.id).annual, 20.5);
  const progress = calculate(store.all()).accounts[account.id];
  assert.equal(progress.annual, 21.75);
  assert.equal(progress.lifetime, 101.75);
  assert.equal(progress.balance, 600.75);
  store.importData(store.exportData());
  assert.deepEqual(calculate(store.all()).accounts[account.id], progress);
  const archive = store.createArchive({ year: Number(localDate().slice(0, 4)) });
  assert.equal(archive.snapshot.accounts.find(row => row.definition.id === account.id).progress.annual, 21.75);
});

test('直接入账：多航司酒店独立选计划，修改换计划删除可逆，不叠加规则', context => {
  const { store } = fixture(context);
  const first = store.save('loyalty_accounts', accountInput);
  const second = store.save('loyalty_accounts', { ...accountInput, name: '另一酒店计划', annual: 0, lifetime: 0, balance: 0 });
  const airline = store.save('loyalty_accounts', { ...accountInput, name: '合作航司计划', type: '航空', annual: 0, lifetime: 0, balance: 0 });
  store.save('loyalty_rules', { name: '不应重复计入', account_id: first.id, source: 'hotel_stays', metric: 'nights', multiplier: 10, destination: 'annual', effective: '2026-01-01' });
  const stay = store.save('hotel_stays', { name: '某品牌酒店', date: '2026-11-01', checkout: '2026-11-04', nights: 3, points: 500, spend: 1000, account_id: first.id });
  assert.equal(stay.accrual_mode, '直接入账');
  assert.equal(stay._rules.length, 0);
  assert.deepEqual(calculate(store.all()).accounts[first.id], { balance: 600, annual: 13, lifetime: 53, spend: 1000 });
  store.save('hotel_stays', { ...stay, account_id: second.id, nights: 2, lifetime_nights: 0 }, stay.id);
  assert.equal(calculate(store.all()).accounts[first.id].annual, 10);
  assert.equal(calculate(store.all()).accounts[second.id].annual, 2);
  assert.equal(calculate(store.all()).accounts[second.id].lifetime, 0);
  const flight = store.save('flights', { date: '2026-11-02', airline: '实际承运航司', origin: 'PVG', destination: 'KIX', miles: 1000, qualifying: 200, lifetime_credit: 50, account_id: airline.id });
  store.save('flights', { date: '2026-11-03', airline: '另一承运航司', origin: 'KIX', destination: 'PVG', miles: 800, qualifying: 100, account_id: airline.id });
  assert.deepEqual(calculate(store.all()).accounts[airline.id], { balance: 1800, annual: 300, lifetime: 50, spend: 0 });
  assert.throws(() => store.save('flights', { ...flight, account_id: first.id }), /航空计划/);
  const payload = store.exportData();
  store.importData(payload);
  assert.deepEqual(calculate(store.all()).accounts, calculate(payload.records).accounts);
  store.remove('hotel_stays', stay.id);
  assert.equal(calculate(store.all()).accounts[second.id].annual, 0);
  store.remove('flights', flight.id);
  assert.equal(calculate(store.all()).accounts[airline.id].balance, 800);
});

test('直接入账周期、无账户、旧记录兼容及显式切换算法', context => {
  const { store } = fixture(context);
  const account = store.save('loyalty_accounts', accountInput);
  const rule = store.save('loyalty_rules', { name: '旧规则', account_id: account.id, source: 'hotel_stays', metric: 'nights', multiplier: 2, destination: 'annual', effective: '2025-01-01' });
  store.save('hotel_stays', { name: '周期外', date: '2025-11-01', checkout: '2025-11-03', nights: 2, points: 50, account_id: account.id });
  store.save('hotel_stays', { name: '不入账', date: '2026-11-01', checkout: '2026-11-03', nights: 10 });
  assert.equal(calculate(store.all()).accounts[account.id].annual, 10);
  assert.equal(calculate(store.all()).accounts[account.id].lifetime, 52);
  const legacy = store.save('hotel_stays', { name: '历史记录', date: '2026-11-01', checkout: '2026-11-03', nights: 2, account_id: account.id, accrual_mode: '按高级规则' });
  const raw = { ...legacy }; delete raw.accrual_mode;
  store.database.prepare('UPDATE hotel_stays SET data = ? WHERE id = ?').run(JSON.stringify(raw), legacy.id);
  const backup = store.exportData();
  store.importData(backup);
  assert.equal(store.get('hotel_stays', legacy.id).accrual_mode, '按高级规则');
  assert.equal(calculate(store.all()).accounts[account.id].annual, 14);
  store.save('hotel_stays', { ...store.get('hotel_stays', legacy.id), accrual_mode: '直接入账' }, legacy.id);
  assert.equal(calculate(store.all()).accounts[account.id].annual, 12);
  store.save('hotel_stays', { ...store.get('hotel_stays', legacy.id), accrual_mode: '按高级规则' }, legacy.id);
  assert.equal(calculate(store.all()).accounts[account.id].annual, 14);
  assert.equal(store.get('hotel_stays', legacy.id)._rules[0].id, rule.id);
});

test('CRUD、日期唯一性与刷新后持久化', context => {
  const { store, directory } = fixture(context);
  const entry = store.save('daily_entries', { date: '2026-11-06', summary: '今天很好', mood: 5, sleep: 8 });
  assert.equal(store.get('daily_entries', entry.id).summary, '今天很好');
  assert.throws(() => store.save('daily_entries', { date: '2026-11-06' }), /已有日记/);
  assert.throws(() => store.save('daily_entries', { date: '2026-02-30' }), /日期无效/);
  store.save('daily_entries', { ...entry, summary: '更新后的日记' }, entry.id);
  const reopened = openStore(directory);
  assert.equal(reopened.get('daily_entries', entry.id).summary, '更新后的日记');
  reopened.database.close();
  store.remove('daily_entries', entry.id);
  assert.equal(store.list('daily_entries').length, 0);
});

test('服务器校验活动时间、数字与引用', context => {
  const { store } = fixture(context);
  assert.throws(() => store.save('activities', { name: '无效时间', date: '2026-11-06', start: '23:00', end: '01:00' }), /结束时间/);
  assert.throws(() => store.save('activities', { name: '无效关联', date: '2026-11-06', start: '09:00', end: '10:00', category_id: 'missing' }), /不存在/);
  assert.throws(() => store.save('daily_entries', { date: '2026-11-06', sleep: -1 }), /超出允许范围/);
  assert.throws(() => store.save('flights', { date: '2026-11-06', airline: '航司', origin: 'PVG', destination: 'KIX', miles: 'NaN' }), /超出允许范围/);
  assert.throws(() => store.list('users;DROP TABLE users'), /未知数据类型/);
});

test('敏感号码与附件加密落盘，导出可还原', context => {
  const { store } = fixture(context);
  const account = store.save('loyalty_accounts', accountInput);
  const document = store.save('documents', { name: '护照', number: 'SECRET-DOC', expiry: '2028-01-01' });
  store.addAttachment({ model: 'documents', record_id: document.id, name: 'passport.txt', mime: 'text/plain', content: Buffer.from('private passport').toString('base64') });
  const raw = store.database.prepare('SELECT data FROM loyalty_accounts WHERE id = ?').get(account.id).data;
  assert.ok(!raw.includes(accountInput.number));
  assert.ok(raw.includes('enc:'));
  assert.equal(store.get('loyalty_accounts', account.id).number, accountInput.number);
  const attachment = store.database.prepare('SELECT content FROM attachments').get();
  assert.ok(attachment.content.startsWith('enc:'));
  assert.equal(Buffer.from(store.exportData().attachments[0].content, 'base64').toString(), 'private passport');
});

test('会员规则快照、修改删除自动回滚累计，挑战进度无重复', context => {
  const { store } = fixture(context);
  const account = store.save('loyalty_accounts', accountInput);
  const challenge = store.save('challenges', challengeInput);
  const rule = store.save('loyalty_rules', { name: '房晚规则', account_id: account.id, source: 'hotel_stays', metric: 'nights', multiplier: 1, destination: 'annual', challenge_id: challenge.id, effective: '2026-01-01' });
  const stay = store.save('hotel_stays', { accrual_mode: '按高级规则', name: '酒店', date: '2026-11-01', checkout: '2026-11-04', nights: 3, account_id: account.id });
  assert.equal(calculate(store.all()).accounts[account.id].annual, 13);
  assert.equal(calculate(store.all()).challenges[challenge.id].current, 3);
  store.save('loyalty_rules', { ...rule, multiplier: 2 }, rule.id);
  assert.equal(calculate(store.all()).accounts[account.id].annual, 13);
  store.save('hotel_stays', { accrual_mode: '按高级规则', ...stay, nights: 4 }, stay.id);
  assert.equal(calculate(store.all()).accounts[account.id].annual, 14);
  const next = store.save('hotel_stays', { accrual_mode: '按高级规则', ...stay, date: '2026-11-05', checkout: '2026-11-08', nights: 3 });
  assert.equal(calculate(store.all()).accounts[account.id].annual, 20);
  store.remove('hotel_stays', next.id);
  assert.equal(calculate(store.all()).accounts[account.id].annual, 14);
  assert.throws(() => store.remove('challenges', challenge.id), /关联/);
  store.remove('loyalty_rules', rule.id);
  assert.equal(calculate(store.all()).accounts[account.id].annual, 14);
  assert.throws(() => store.remove('challenges', challenge.id), /历史计算依据/);
  store.remove('hotel_stays', stay.id);
  assert.equal(calculate(store.all()).accounts[account.id].annual, 10);
  assert.equal(calculate(store.all()).challenges[challenge.id].current, 0);
});

test('备份可完整恢复已有数据及附件，非法导入原子回滚', context => {
  const { store } = fixture(context);
  demo(store);
  const before = store.exportData();
  const document = before.records.documents[0];
  store.addAttachment({ model: 'documents', record_id: document.id, name: '附件.txt', mime: 'text/plain', content: Buffer.from('测试内容').toString('base64') });
  const payload = store.exportData();
  store.importData(payload);
  assert.equal(store.list('daily_entries').length, payload.records.daily_entries.length);
  assert.equal(store.list('loyalty_accounts')[0].number, payload.records.loyalty_accounts[0].number);
  assert.equal(store.exportData().attachments[0].content, payload.attachments[0].content);
  assert.deepEqual(calculate(store.all()).accounts, calculate(payload.records).accounts);
  const invalid = structuredClone(payload);
  invalid.records.activities[0].category_id = 'missing';
  assert.throws(() => store.importData(invalid), /不存在/);
  assert.equal(store.list('activities').length, payload.records.activities.length);
  assert.equal(store.exportData().attachments.length, 1);
});

test('备份支持关联挑战与已删除规则的历史快照', context => {
  const { store } = fixture(context);
  const account = store.save('loyalty_accounts', accountInput);
  const challenge = store.save('challenges', { ...challengeInput, account_id: account.id });
  const rule = store.save('loyalty_rules', { name: '测试规则', account_id: account.id, source: 'hotel_stays', metric: 'nights', multiplier: 1, destination: 'lifetime', challenge_id: challenge.id, effective: '2026-01-01' });
  store.save('hotel_stays', { accrual_mode: '按高级规则', name: '酒店', date: '2026-11-01', checkout: '2026-11-04', nights: 3, account_id: account.id });
  store.remove('loyalty_rules', rule.id);
  const payload = store.exportData();
  store.importData(payload);
  assert.equal(calculate(store.all()).challenges[challenge.id].current, 3);
  assert.equal(calculate(store.all()).accounts[account.id].lifetime, 53);
});

test('统计按年份计算，重叠跨年旅行按自然日去重', context => {
  const { store } = fixture(context);
  store.save('trips', { name: '跨年', start_date: '2025-12-30', end_date: '2026-01-03' });
  store.save('trips', { name: '重叠', start_date: '2026-01-02', end_date: '2026-01-04' });
  assert.equal(calculate(store.all(), 2026).travelDays, 4);
  assert.equal(calculate(store.all(), 2025).travelDays, 2);
  const category = store.list('categories').find(row => row.kind === '学习');
  store.save('activities', { name: '学习', date: '2026-11-06', start: '09:00', end: '10:30', category_id: category.id });
  assert.equal(calculate(store.all(), 2026).studyHours, 1.5);
  assert.equal(calculate(store.all(), 2025).studyHours, 0);
});

test('年度会籍累计遵守保级周期，终身累计不受周期限制', context => {
  const { store } = fixture(context);
  const account = store.save('loyalty_accounts', accountInput);
  for (const destination of ['annual', 'lifetime']) store.save('loyalty_rules', { name: destination, account_id: account.id, source: 'hotel_stays', metric: 'nights', multiplier: 1, destination, effective: '2025-01-01' });
  store.save('hotel_stays', { accrual_mode: '按高级规则', name: '旧年酒店', date: '2025-11-01', checkout: '2025-11-03', nights: 2, account_id: account.id });
  assert.equal(calculate(store.all()).accounts[account.id].annual, 10);
  assert.equal(calculate(store.all()).accounts[account.id].lifetime, 52);
  assert.match(localDate(), /^\d{4}-\d{2}-\d{2}$/);
});
