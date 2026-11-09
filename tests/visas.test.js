import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.js';
import { visaDateStatus } from '../public/document-status.js';

function fixture(context) {
  const directory = mkdtempSync(join(tmpdir(), 'life-os-visas-'));
  const store = openStore(directory);
  context.after(() => { store.database.close(); rmSync(directory, { recursive: true, force: true }); });
  const passport = store.save('documents', { name: '普通护照', type: '护照', number: 'PRIVATE-PASSPORT', expiry: '2028-01-01' });
  return { store, passport, directory };
}
const visaInput = passport => ({ name: '旅游签证', passport_id: passport.id, country: '示例地区', visa_type: '旅游', number: 'PRIVATE-VISA', valid_from: '2026-01-01', expiry: '2030-12-31', entries: '多次', stay_days: 30, remind_days: 90 });

test('一本护照多份签证，独立有效期、加密、更新持久化和删除保护', context => {
  const { store, passport, directory } = fixture(context);
  const first = store.save('visas', visaInput(passport));
  store.save('visas', { ...visaInput(passport), name: '另一份签证', country: '另一地区', expiry: '2027-03-01' });
  assert.equal(store.list('visas').filter(row => row.passport_id === passport.id).length, 2);
  assert.equal(store.get('visas', first.id).expiry, '2030-12-31');
  assert.equal(store.get('documents', passport.id).expiry, '2028-01-01');
  assert.ok(!store.database.prepare('SELECT data FROM visas WHERE id = ?').get(first.id).data.includes('PRIVATE-VISA'));
  assert.throws(() => store.remove('documents', passport.id), /关联/);
  assert.throws(() => store.save('documents', { ...passport, name: '保险', type: '保险' }, passport.id), /关联签证/);
  store.save('visas', { ...first, stay_days: 60 }, first.id);
  const reopened = openStore(directory);
  assert.equal(reopened.get('visas', first.id).stay_days, 60);
  reopened.database.close();
});

test('签证日期、停留天数、所属护照与引用校验', context => {
  const { store, passport } = fixture(context);
  assert.throws(() => store.save('visas', { ...visaInput(passport), valid_from: '2031-01-01' }), /生效日期/);
  assert.throws(() => store.save('visas', { ...visaInput(passport), stay_days: 2.5 }), /整数/);
  assert.throws(() => store.save('visas', { ...visaInput(passport), passport_id: '' }), /所属护照/);
  const insurance = store.save('documents', { name: '保险', type: '保险', expiry: '2030-01-01' });
  assert.throws(() => store.save('visas', { ...visaInput(passport), passport_id: insurance.id }), /护照类型/);
});

test('签证未生效、正常、180/90/30天内及过期日期状态', () => {
  const today = '2026-01-01';
  for (const [valid_from, expiry, label] of [
    ['2026-02-01', '2027-01-01', '未生效'], ['2025-01-01', '2027-01-01', '有效'],
    ['2025-01-01', '2026-05-01', '180 天内到期'], ['2025-01-01', '2026-03-01', '90 天内到期'],
    ['2025-01-01', '2026-01-31', '30 天内到期'], ['2025-01-01', '2025-12-31', '已过期']
  ]) assert.equal(visaDateStatus({ valid_from, expiry }, today).label, label);
});

test('签证及附件完整备份恢复，失败回滚与旧版备份兼容', context => {
  const { store, passport } = fixture(context);
  const visa = store.save('visas', visaInput(passport));
  store.addAttachment({ model: 'visas', record_id: visa.id, name: 'visa.txt', mime: 'text/plain', content: Buffer.from('private visa file').toString('base64') });
  const backup = store.exportData();
  store.importData(backup);
  assert.equal(store.get('visas', visa.id).number, 'PRIVATE-VISA');
  assert.equal(store.exportData().attachments.length, 1);
  const bad = structuredClone(backup); bad.records.visas[0].passport_id = 'missing';
  assert.throws(() => store.importData(bad), /不存在/);
  assert.equal(store.list('visas').length, 1);
  store.remove('visas', visa.id);
  assert.equal(store.exportData().attachments.length, 0);
  const old = store.exportData(); delete old.records.visas;
  store.importData(old);
  assert.equal(store.list('visas').length, 0);
  assert.equal(store.get('documents', passport.id).number, 'PRIVATE-PASSPORT');
});
