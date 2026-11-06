import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { models } from '../public/models.js';
import { calculate, localDate } from '../public/metrics.js';
import { holidaysOn, holidayNotice } from '../public/holidays.js';
import { openStore } from '../src/store.js';
import { seed, demo } from '../src/seed.js';

test('浏览位置：年月共享、未来规划、刷新恢复、视图记忆与无效缓存回退', async () => {
  const storage = new Map();
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/^import .+;\n/gm, '').replace(/\nboot\(\);\s*$/, '\nglobalThis.ui = { state, render, setBrowseDate, changeBrowseYear, rememberBrowsePosition };');
  function load() {
    const elements = new Map();
    const handlers = {};
    const app = { innerHTML: '' };
    const runtime = {
      models, calculate, localDate, holidaysOn, holidayNotice, console, URL, Blob, setTimeout, clearTimeout,
      localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
      document: { querySelector: selector => selector === '#app' ? app : selector === '#modal' ? { addEventListener() {} } : elements.get(selector) || null, querySelectorAll: () => [], addEventListener: (name, handler) => handlers[name] = handler, documentElement: { dataset: {} } },
      window: { addEventListener() {} }, navigator: {}, location: { hash: '' }
    };
    runInNewContext(source, runtime);
    runtime.ui.state.records = Object.fromEntries(Object.keys(models).map(model => [model, []]));
    return { ui: runtime.ui, elements, handlers, app };
  }
  const first = load();
  assert.equal(first.ui.state.date, localDate());
  assert.ok(first.ui.setBrowseDate('2040-02-29'));
  assert.ok(first.ui.changeBrowseYear(2041));
  assert.equal(first.ui.state.date, '2041-02-28');
  assert.equal(first.ui.changeBrowseYear(9999), false);
  const changeHandlers = {};
  first.elements.set('#footprint-month', { addEventListener: (name, handler) => changeHandlers[name] = handler });
  first.ui.render();
  changeHandlers.change({ target: { value: '2050-08' } });
  assert.equal(first.ui.state.date, '2050-08-01');
  assert.equal(first.ui.state.year, 2050);
  assert.ok(first.app.innerHTML.includes('value="2050-08"'));
  first.ui.state.route = 'calendar';
  first.ui.render();
  assert.ok(first.app.innerHTML.includes('2050 年 8 月'));
  const click = async (action, extra = {}) => first.handlers.click({ target: { closest: () => ({ dataset: { action, ...extra } }) }, preventDefault() {} });
  await click('calendar-next');
  assert.equal(first.ui.state.date, '2050-09-01');
  await click('calendar-mode', { mode: 'week' });
  const reloaded = load();
  assert.equal(reloaded.ui.state.date, '2050-09-01');
  assert.equal(reloaded.ui.state.year, 2050);
  assert.equal(reloaded.ui.state.calendarMode, 'week');
  first.ui.state.route = 'overview'; first.ui.render();
  assert.ok(first.app.innerHTML.includes('value="2050-09"'));
  await click('browse-today');
  assert.equal(load().ui.state.date, localDate());
  for (const corrupt of ['broken-json', 'null', JSON.stringify({ date: '2040-02-30', calendarMode: 'invalid' })]) {
    storage.set('life-browse-position', corrupt);
    const fallback = load();
    assert.equal(fallback.ui.state.date, localDate());
    assert.equal(fallback.ui.state.calendarMode, 'month');
  }
});

test('前端渲染烟测：所有页面、空态、详情、表单、日历模式与主题', context => {
  const directory = mkdtempSync(join(tmpdir(), 'life-os-ui-'));
  const store = openStore(directory); seed(store);
  context.after(() => { store.database.close(); rmSync(directory, { recursive: true, force: true }); });
  const app = { innerHTML: '' };
  const modal = { innerHTML: '', open: false, showModal() { this.open = true; }, close() { this.open = false; }, addEventListener() {} };
  const form = { addEventListener() {} };
  const storage = new Map();
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/^import .+;\n/gm, '').replace(/\nboot\(\);\s*$/, '\nglobalThis.ui = { state, render, detail, editForm, quickAdd, dayDetail, markdown };');
  const contextObject = {
    models, calculate, localDate, holidaysOn, holidayNotice, console, URL, Blob, setTimeout, clearTimeout,
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    document: { querySelector: selector => ({ '#app': app, '#modal': modal, '#record-form': form })[selector] || null, querySelectorAll: () => [], addEventListener() {}, documentElement: { dataset: {} } },
    window: { addEventListener() {} }, navigator: {}, location: { hash: '' }
  };
  runInNewContext(source, contextObject);
  const ui = contextObject.ui;
  for (const withDemo of [false, true]) {
    if (withDemo) demo(store);
    ui.state.records = store.all();
    for (const route of ['overview', 'calendar', 'daily_entries', 'activities', 'challenges', 'loyalty', 'travel', 'documents', 'analytics', 'settings']) {
      ui.state.route = route; ui.render();
      assert.ok(app.innerHTML.includes('Life OS'), route);
      assert.ok(!app.innerHTML.includes('NaN'), `${route} 包含 NaN`);
      assert.ok(!app.innerHTML.includes('undefined'), `${route} 包含 undefined`);
    }
    for (const [model, rows] of Object.entries(ui.state.records)) {
      ui.editForm(model);
      assert.ok(modal.innerHTML.includes('保存记录'), model);
      for (const row of rows) { ui.detail(model, row.id); assert.ok(modal.innerHTML.includes('编辑记录'), model); ui.editForm(model, row.id); }
    }
    ui.dayDetail(localDate());
    assert.ok(modal.innerHTML.includes('data-model="flights" data-date="' + localDate() + '"'));
    assert.ok(modal.innerHTML.includes('data-model="hotel_stays" data-date="' + localDate() + '"'));
    ui.state.date = '2026-04-05'; ui.state.year = 2026; ui.state.route = 'calendar';
    for (const mode of ['month', 'week', 'day']) {
      ui.state.calendarMode = mode; ui.render();
      assert.ok(app.innerHTML.includes('class="holiday-label"'), mode);
      assert.ok(app.innerHTML.includes('>清明</span>'), mode);
      assert.ok(app.innerHTML.includes('>复活节</span>'), mode);
    }
    ui.dayDetail('2026-04-05');
    assert.ok(modal.innerHTML.includes('>清明</span>'));
    assert.ok(modal.innerHTML.includes('>复活节</span>'));
    for (const model of ['flights', 'hotel_stays']) {
      ui.editForm(model, null, { date: '2026-11-10' });
      assert.ok(modal.innerHTML.includes('value="2026-11-10"'));
      assert.ok(modal.innerHTML.includes('value="直接入账" selected'));
      assert.ok(modal.innerHTML.includes('本次入账常旅客计划'));
    }
    ui.quickAdd(); assert.ok(modal.innerHTML.includes('想记录些什么'));
    for (const mode of ['month', 'week', 'day']) { ui.state.route = 'calendar'; ui.state.calendarMode = mode; ui.render(); assert.ok(app.innerHTML.includes('calendar-panel')); }
    for (const tab of ['trips', 'flights', 'hotel_stays']) { ui.state.route = 'travel'; ui.state.travelTab = tab; ui.render(); assert.ok(!app.innerHTML.includes('NaN')); }
    for (const tab of ['loyalty_accounts', 'loyalty_transactions', 'loyalty_rules']) { ui.state.route = 'loyalty'; ui.state.loyaltyTab = tab; ui.render(); assert.ok(!app.innerHTML.includes('NaN')); }
    ui.state.theme = 'dark'; ui.render(); assert.equal(contextObject.document.documentElement.dataset.theme, 'dark');
  }
  assert.ok(!ui.markdown('<img src=x onerror=alert(1)> **safe**').includes('<img'));
  assert.ok(ui.markdown('## 标题\n**加粗**').includes('<strong>加粗</strong>'));
});
