import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore, localDate } from '../src/store.js';
import { buildYearSnapshot } from '../src/archives.js';
import { seed } from '../src/seed.js';

function fixture(context) {
  const directory = mkdtempSync(join(tmpdir(), 'life-os-archives-'));
  const store = openStore(directory); seed(store);
  context.after(() => { store.database.close(); rmSync(directory, { recursive: true, force: true }); });
  const year = Number(localDate().slice(0, 4));
  const account = store.save('loyalty_accounts', { name: '年度会籍', type: '酒店', tier: '金卡', number: 'SECRET-123', balance: 100, annual: 10, lifetime: 50, cycle_start: `${year}-01-01`, expiry: `${year}-12-31`, annual_target: 50, lifetime_target: 600 });
  const challenge = store.save('challenges', { name: '年度阅读', type: '年度挑战', start_date: `${year}-01-01`, end_date: `${year}-12-31`, target: 30, initial: 2, unit: '本', status: '进行中' });
  store.save('challenge_progress', { challenge_id: challenge.id, date: `${year}-01-01`, amount: 3 });
  return { store, year, account, challenge, directory };
}

test('存档保存独立版本、加密落盘、排除未来流水且不重置原始记录', context => {
  const { store, year, account, challenge } = fixture(context);
  store.save('hotel_stays', { name: '未来入住', date: `${year + 1}-01-02`, checkout: `${year + 1}-01-04`, nights: 2, points: 500, account_id: account.id });
  store.save('challenge_progress', { challenge_id: challenge.id, date: `${year + 1}-01-01`, amount: 100 });
  const before = store.all();
  const first = store.createArchive({ year, title: '第一次', notes: '开始规划下一年' });
  assert.deepEqual(store.all(), before);
  assert.equal(first.snapshot.accounts[0].progress.balance, 100);
  assert.equal(first.snapshot.challenges[0].progress.current, 5);
  assert.equal(first.cutoff, localDate());
  assert.equal(first.snapshot.accounts[0].definition.number, undefined);
  assert.ok(store.database.prepare('SELECT data FROM year_archives').get().data.startsWith('enc:'));
  store.save('loyalty_accounts', { ...account, tier: '白金卡', annual: 40 }, account.id);
  store.save('challenge_progress', { challenge_id: challenge.id, date: `${year}-01-01`, amount: 5 });
  const second = store.createArchive({ year });
  assert.equal(second.revision, 2);
  assert.equal(second.snapshot.accounts[0].definition.tier, '白金卡');
  assert.equal(store.getArchive(first.id).snapshot.accounts[0].definition.tier, '金卡');
  assert.equal(store.getArchive(first.id).snapshot.challenges[0].progress.current, 5);
  assert.equal(second.snapshot.challenges[0].progress.current, 10);
});

test('截止日与按年统计正确，挑战状态按存档截止日判定', context => {
  const { store, year, challenge } = fixture(context);
  const past = year - 1;
  const old = store.save('challenges', { ...challenge, start_date: `${past}-01-01`, end_date: `${past}-12-31`, initial: 0 });
  store.save('challenge_progress', { challenge_id: old.id, date: `${past}-12-31`, amount: 1 });
  store.save('trips', { name: '跨年旅行', start_date: `${past}-12-30`, end_date: `${year}-01-03` });
  store.save('daily_entries', { date: `${year}-12-31`, summary: '未来计划记录' });
  const snapshot = buildYearSnapshot(store.all(), past, localDate());
  assert.equal(snapshot.summary.travelDays, 2);
  assert.equal(snapshot.summary.journalDays, 0);
  assert.equal(snapshot.challenges.find(row => row.definition.id === old.id).progress.status, '进行中');
  assert.equal(store.createArchive({ year: past }).cutoff, `${past}-12-31`);
  assert.throws(() => store.createArchive({ year: year + 1 }), /未来/);
});

test('新年提示、版本持久化、原记录删除后存档仍完整', context => {
  const { store, year, challenge, directory } = fixture(context);
  assert.equal(store.archiveSuggestion(), null);
  store.save('daily_entries', { date: `${year - 1}-08-01`, summary: '去年记录' });
  assert.equal(store.archiveSuggestion(), year - 1);
  store.createArchive({ year: year - 1 });
  assert.equal(store.archiveSuggestion(), null);
  const archive = store.createArchive({ year });
  for (const row of store.list('challenge_progress')) store.remove('challenge_progress', row.id);
  store.remove('challenges', challenge.id);
  assert.equal(store.getArchive(archive.id).snapshot.challenges[0].definition.name, '年度阅读');
  const reopened = openStore(directory);
  assert.equal(reopened.getArchive(archive.id).snapshot.challenges[0].progress.current, 5);
  reopened.database.close();
  store.removeArchive(archive.id);
  assert.throws(() => store.getArchive(archive.id), /不存在/);
});

test('全年存档包含年末计划，排除下一年，未来年度可提前保存', context => {
  const { store, year, account, challenge } = fixture(context);
  const stay = store.save('hotel_stays', { name: '年底入住', date: `${year}-12-20`, checkout: `${year}-12-22`, nights: 2.5, points: 500, account_id: account.id });
  store.save('challenge_progress', { challenge_id: challenge.id, date: `${year}-12-20`, amount: 10 });
  store.save('hotel_stays', { name: '次年入住', date: `${year + 1}-01-02`, checkout: `${year + 1}-01-04`, nights: 2, points: 1000, account_id: account.id });
  const today = `${year}-11-08`;
  const partial = buildYearSnapshot(store.all(), year, today);
  const full = buildYearSnapshot(store.all(), year, today, 'full_year');
  assert.equal(partial.accounts[0].progress.balance, 100);
  assert.equal(full.accounts[0].progress.balance, 600);
  assert.equal(full.accounts[0].progress.annual, 12.5);
  assert.equal(full.challenges[0].progress.current, 15);
  assert.equal(full.plan.hotel_stays.length, 1);
  assert.equal(full.includes_future, true);
  const archive = store.createArchive({ year, coverage: 'full_year' });
  assert.equal(archive.cutoff, `${year}-12-31`);
  assert.equal(store.listArchives()[0].coverage, 'full_year');
  store.remove('hotel_stays', stay.id);
  assert.equal(store.getArchive(archive.id).snapshot.plan.hotel_stays[0].name, '年底入住');
  const backup = store.exportData();
  store.importData(backup);
  assert.deepEqual(store.getArchive(archive.id), archive);
  const invalid = structuredClone(backup);
  invalid.archives[0].snapshot.coverage = 'invalid';
  assert.throws(() => store.importData(invalid), /范围/);
  assert.equal(store.createArchive({ year: year + 1, coverage: 'full_year' }).cutoff, `${year + 1}-12-31`);
  assert.throws(() => store.createArchive({ year, coverage: 'invalid' }), /范围/);
});

test('完整备份恢复存档、旧备份兼容、失败回滚保护已有存档', context => {
  const { store, year } = fixture(context);
  const archive = store.createArchive({ year });
  const backup = store.exportData();
  store.removeArchive(archive.id);
  store.importData(backup);
  assert.deepEqual(store.getArchive(archive.id), archive);
  const duplicate = structuredClone(backup);
  duplicate.archives.push(duplicate.archives[0]);
  assert.throws(() => store.importData(duplicate));
  assert.deepEqual(store.getArchive(archive.id), archive);
  const invalid = structuredClone(backup);
  invalid.archives[0].snapshot.accounts[0].progress.annual = 'bad';
  assert.throws(() => store.importData(invalid), /存档会籍/);
  assert.equal(store.listArchives().length, 1);
  delete backup.archives;
  store.importData(backup);
  assert.equal(store.listArchives().length, 0);
});
