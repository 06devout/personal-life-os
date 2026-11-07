import { models } from './models.js';
import { calculate, localDate } from './metrics.js';
import { holidaysOn, holidayNotice } from './holidays.js';
import { milesToKilometers, kilometersToMiles } from './units.js';
import { buildFlightHistory, findUnknownFlightReferences } from './flight-history.js';
import { airportCode } from './airports.js';

const icons = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  book: '<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zM13 7a3 3 0 0 1 3-3h5v15h-4a4 4 0 0 0-4 2"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-12 4h1m4 0h1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  award: '<circle cx="12" cy="8" r="5"/><path d="m8 12-2 9 6-3 6 3-2-9"/>',
  map: '<path d="m3 5 6-2 6 3 6-2v15l-6 2-6-3-6 2zM9 3v15m6-12v15"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8m-8 4h5"/>',
  trend: '<path d="M4 20V4m0 16h17M7 15l5-5 4 3 5-7"/>',
  settings: '<path d="m9 3-1 3-3 1v4l2 1-1 3 3 3 3-1 2 2 4-2v-3l3-2-1-4-3-1-1-3z"/><circle cx="12" cy="11" r="3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>', chevron: '<path d="m9 5 7 7-7 7"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0v5l2 3H4l2-3zm4 11h4"/>',
  check: '<path d="m5 12 4 4L19 6"/>', plane: '<path d="m22 2-7 19-4-8-8-4zM11 13l5-5"/>',
  hotel: '<path d="M4 21V3h16v18M8 7h2m4 0h2M8 11h2m4 0h2m-6 10v-5h4v5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  logout: '<path d="M10 4H4v16h6m4-4 4-4-4-4m-6 4h10"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  heart: '<path d="M20 5c-3-3-6-1-8 1-2-2-5-4-8-1-5 5 3 11 8 15 5-4 13-10 8-15"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>'
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const number = (value, digits = 0) => Number(value || 0).toLocaleString('zh-CN', { maximumFractionDigits: digits });
const label = (model, row) => row.name || row.summary || (model === 'flights' ? `${row.origin} → ${row.destination} ${row.number || ''}` : row.date) || models[model].singular;
const daysUntil = date => Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${localDate()}T00:00:00Z`)) / 86400000);
const dateAdd = (date, days) => { const value = new Date(`${date}T12:00:00`); value.setDate(value.getDate() + days); return localDate(value); };
function validBrowseDate(value) {
  return typeof value === 'string' && /^[1-9]\d{3}-\d{2}-\d{2}$/.test(value) && value.slice(0, 4) !== '9999' && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
function readBrowsePosition() {
  try {
    const saved = JSON.parse(localStorage.getItem('life-browse-position') || '{}');
    return { date: validBrowseDate(saved?.date) ? saved.date : localDate(), calendarMode: ['month', 'week', 'day'].includes(saved?.calendarMode) ? saved.calendarMode : 'month' };
  } catch { return { date: localDate(), calendarMode: 'month' }; }
}
const browsing = readBrowsePosition();
const state = { records: {}, attachments: [], archives: [], directory: [], archiveSuggestion: null, route: 'overview', year: Number(browsing.date.slice(0, 4)), date: browsing.date, calendarMode: browsing.calendarMode, query: '', sort: 'desc', filter: '', travelTab: 'trips', loyaltyTab: 'loyalty_accounts', theme: localStorage.getItem('life-theme') || 'light' };
function rememberBrowsePosition() {
  try { localStorage.setItem('life-browse-position', JSON.stringify({ date: state.date, calendarMode: state.calendarMode })); } catch {}
}
function setBrowseDate(date) {
  if (!validBrowseDate(date)) return false;
  state.date = date;
  state.year = Number(date.slice(0, 4));
  rememberBrowsePosition();
  return true;
}
function changeBrowseYear(year) {
  if (!Number.isInteger(year) || year < 1000 || year > 9998) return false;
  const month = Number(state.date.slice(5, 7));
  const day = Math.min(Number(state.date.slice(8)), new Date(year, month, 0).getDate());
  return setBrowseDate(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`);
}
const app = document.querySelector('#app');
const modal = document.querySelector('#modal');
let toastTimer;
let installPrompt;
const toast = message => { const target = document.querySelector('#toast'); target.textContent = message; target.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => target.classList.remove('visible'), 4500); };
async function api(path, options = {}) {
  const response = await fetch(`/api/${path}`, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers }, ...(options.body ? { body: JSON.stringify(options.body) } : {}) });
  const value = await response.json();
  if (!response.ok) { if (response.status === 401 && !path.startsWith('auth')) { modal.close(); await boot(); } throw new Error(value.error || '操作失败'); }
  return value;
}
async function refresh() { const data = await api('state'); state.records = data.records; state.attachments = data.attachments; state.archives = data.archives || []; state.directory = data.directory || []; state.archiveSuggestion = data.archiveSuggestion ?? null; render(); }
const button = (text, action, extra = '', cls = '') => `<button class="${cls}" data-action="${action}" ${extra}>${text}</button>`;
const editButton = (model, row, text = '编辑', cls = 'text-button') => button(text, 'edit', `data-model="${model}" data-id="${row.id}"`, cls);
const addButton = (model, text = `添加${models[model].singular}`) => button(`${icon('plus')}${text}`, 'add', `data-model="${model}"`, 'primary');
function setTheme() { document.documentElement.dataset.theme = state.theme; localStorage.setItem('life-theme', state.theme); }
function openDialog(content, cls = '') { modal.className = cls; modal.innerHTML = content; if (!modal.open) modal.showModal(); }
const closeButton = button(icon('close'), 'close-modal', 'aria-label="关闭"', 'icon-button');

function referenceForm(kind, value = '', codeToEdit = '', flightId = '') {
  const entry = (state.directory || []).find(row => row.kind === kind && row.code === codeToEdit);
  const isCode = (kind === 'airport' ? /^[A-Z]{3}$/i : /^[A-Z0-9]{2}$/i).test(value);
  const code = entry?.code || (isCode ? value.toUpperCase() : '');
  const name = entry?.name || (isCode ? '' : value);
  const aliases = entry?.aliases || (value ? [value] : []);
  openDialog(`<div class="dialog-heading"><h2>${entry ? '编辑' : '补全'}${kind === 'airport' ? '机场资料' : '航司资料'}</h2>${closeButton}</div><form id="reference-form"><div class="dialog-body"><label class="form-field">${kind === 'airport' ? '机场 IATA 三字码' : '航司 IATA 二字码'}<input name="code" value="${escape(code)}" ${entry ? 'readonly' : ''} pattern="${kind === 'airport' ? '[A-Za-z]{3}' : '[A-Za-z0-9]{2}'}" required maxlength="${kind === 'airport' ? 3 : 2}"></label><label class="form-field">完整名称<input name="name" value="${escape(name)}" required maxlength="200"></label><label class="form-field">其他名称 / 别名<textarea name="aliases" rows="3" placeholder="每行一个，也可用中英文逗号分隔">${escape(aliases.join('\n'))}</textarea></label><p class="help">填写一次，刷新、重启后继续复用。原未知名称自动保留为别名，历史统计重新归并，不改写历史航班。相同代码会更新名称及别名；不同代码不能抢占同一别名。资料由你确认，不自动联网核验。</p><p id="reference-error" class="error" role="alert"></p></div><div class="dialog-footer">${button('稍后填写', 'close-modal', '', 'secondary')}<button type="submit" class="primary">保存并复用</button></div></form>`, 'wide-dialog');
  document.querySelector('#reference-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true;
    try {
      const aliases = values.aliases.split(/[\n,，]+/).map(item => item.trim()).filter(Boolean);
      if (!entry && value && !aliases.includes(value)) aliases.unshift(value);
      await api(entry ? `directory/${kind}/${entry.code}` : 'directory', { method: entry ? 'PUT' : 'POST', body: { kind, code: values.code, name: values.name, aliases } });
      modal.close(); await refresh();
      const flight = state.records.flights.find(row => row.id === flightId);
      const next = flight && findUnknownFlightReferences([flight], state.directory)[0];
      if (next) referenceForm(next.kind, next.value, '', flightId);
      toast('资料已保存，历史及后续飞行足迹会自动复用。');
    } catch (error) { const message = document.querySelector('#reference-error'); if (message) message.textContent = error.message; else toast(error.message); } finally { submit.disabled = false; }
  });
}
function referenceManager() {
  openDialog(`<div class="dialog-heading"><h2>机场与航司资料库</h2>${closeButton}</div><div class="dialog-body"><div class="tags">${button('+ 添加机场', 'reference-add', 'data-kind="airport"', 'secondary')}${button('+ 添加航司', 'reference-add', 'data-kind="airline"', 'secondary')}</div><p class="help">这里管理自定义资料，内置资料继续自动使用。删除自定义资料不会删除航班，但可能使相关条目重新变成待补全。</p>${(state.directory || []).map(entry => `<div class="related-row"><div><b>${escape(entry.code)} · ${escape(entry.name)}</b><small class="muted">${entry.kind === 'airport' ? '机场' : '航司'} · ${escape(entry.aliases.join(' / ') || '无其他别名')}</small></div>${button('编辑', 'reference-edit', `data-kind="${entry.kind}" data-code="${entry.code}"`, 'text-button')}${button('删除', 'reference-delete', `data-kind="${entry.kind}" data-code="${entry.code}"`, 'text-button danger-text')}</div>`).join('') || empty('还没有自定义资料', '未知条目补全一次后会保留在这里。')}</div>`, 'wide-dialog');
}
function referenceIssues(unknown) {
  return unknown.length ? `<section class="panel">${sectionHead('资料待补全', '填写一次代码与全名，之后自动复用；可以稍后处理')}${unknown.map(item => `<div class="related-row"><span class="badge">${item.kind === 'airport' ? '机场' : '航司'}</span><span>${escape(item.value)} <small class="muted">出现 ${item.count} 次</small></span>${button('补全资料', 'reference-add', `data-kind="${item.kind}" data-value="${escape(item.value)}"`, 'text-button')}</div>`).join('')}</section>` : '';
}

function archiveBanner() {
  return state.archiveSuggestion && ['overview', 'archives'].includes(state.route) ? `<section class="today-strip"><div><div><b>${state.archiveSuggestion} 年的进度，值得留一份存档。</b><p>进入新一年前保存挑战和会员快照，不会清空任何记录。</p></div></div>${button('存档上一年', 'archive-new', `data-year="${state.archiveSuggestion}"`, 'secondary small')}</section>` : '';
}
function archivesPage() {
  const archives = state.archives || [];
  return `<section class="panel">${sectionHead('年度进度档案', '不可编辑的独立快照 · 同一年可以多次存档', button('+ 创建年度存档', 'archive-new', '', 'primary'))}<p class="help">存档保存当时的挑战、会员等级、余额、年度及终身进度，不会重置账户。规划下一年前可先手动存档；既有快照不随原始记录变动。</p>${archives.length ? `<div class="cards-grid">${archives.map(row => `<article class="challenge-card"><div class="challenge-heading"><span class="badge">${row.year} 年 · 版本 ${row.revision}</span><small class="muted">${escape(row.created_at.slice(0, 10))} 保存</small></div><h3>${escape(row.title)}</h3><p class="help">数据截止 ${escape(row.cutoff)}</p><div class="challenge-foot">${button('查看存档', 'archive-detail', `data-id="${row.id}"`, 'text-button')}${button('删除', 'archive-delete', `data-id="${row.id}"`, 'text-button danger-text')}</div></article>`).join('')}</div>` : empty('还没有年度存档', '在年度结束，或开始下一年规划前，给进度拍一张快照。')}</section>`;
}
function archiveForm(year = state.year, planNext = false) {
  const currentYear = Number(localDate().slice(0, 4));
  const chosenYear = Math.min(Number(year) || currentYear, currentYear);
  openDialog(`<div class="dialog-heading"><div><span class="eyebrow">KEEP YOUR PROGRESS</span><h2>保存年度进度快照</h2></div>${closeButton}</div><form id="archive-form"><div class="dialog-body"><div class="form-grid"><label class="form-field">所属年度<input name="year" type="number" min="1000" max="${currentYear}" value="${chosenYear}" required></label><label class="form-field">存档名称<input name="title" maxlength="200" placeholder="留空使用年度默认名称"></label><label class="form-field full-field">备注<textarea name="notes" maxlength="10000" rows="3" placeholder="例如：开始规划下一年前的进度"></textarea></label><label class="form-field checkbox-field full-field"><input name="plan_next" type="checkbox" ${planNext ? 'checked' : ''}>保存后打开下一年一月日历</label></div><p class="help">今年存档截止今天，过去年度截止当年 12 月 31 日；不纳入截止日之后的计划流水。保存的是当前定义、等级与初始值的快照，补做往年存档不能还原从未保存的旧等级。不会复制挑战、清零房晚或自动切换保级周期。</p><p id="archive-error" class="error" role="alert"></p></div><div class="dialog-footer">${button('取消', 'close-modal', '', 'secondary')}<button type="submit" class="primary">保存存档</button></div></form>`, 'wide-dialog');
  document.querySelector('#archive-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const values = Object.fromEntries(new FormData(form));
    submit.disabled = true;
    try {
      const archive = await api('archives', { method: 'POST', body: { year: Number(values.year), title: values.title, notes: values.notes } });
      modal.close(); await refresh();
      if (values.plan_next) { setBrowseDate(`${archive.year + 1}-01-01`); state.calendarMode = 'month'; navigate('calendar'); }
      else { navigate('archives'); await showArchive(archive.id); }
      toast('年度进度已存档，原始数据保持不变。');
    } catch (error) { const message = document.querySelector('#archive-error'); if (message) message.textContent = error.message; else toast(error.message); } finally { submit.disabled = false; }
  });
}
async function showArchive(id) {
  const archive = await api(`archives/${id}`);
  const snapshot = archive.snapshot;
  openDialog(`<div class="dialog-heading"><div><span class="eyebrow">${archive.year} · ARCHIVE V${archive.revision}</span><h2>${escape(archive.title)}</h2><small class="muted">保存于 ${escape(archive.created_at)} · 数据截止 ${escape(archive.cutoff)}</small></div>${closeButton}</div><div class="dialog-body"><p class="help">${escape(snapshot.basis)}</p>${archive.notes ? `<p>${escape(archive.notes)}</p>` : ''}<div class="compact-metrics">${metric('年度记录', snapshot.summary.journalDays, '天', 'book', '存档时汇总')}${metric('年度飞行', milesToKilometers(snapshot.summary.flightMiles), '公里', 'plane', `${snapshot.summary.flightCount} 个航段`)}</div><h3>挑战进度</h3><div class="cards-grid">${snapshot.challenges.map(({ definition, progress }) => `<article class="challenge-card"><span class="badge">${escape(definition.type)}</span><h3>${escape(definition.name)}</h3><p>${number(progress.current, 2)} / ${number(definition.target, 2)} ${escape(definition.unit)}</p><div class="progress-track"><span style="width:${Math.max(0, Math.min(100, Number(progress.percent) || 0))}%"></span></div><p class="help">${escape(progress.status)} · ${number(progress.percent, 1)}%</p></article>`).join('') || '<p class="muted">没有对应年度的挑战。</p>'}</div><h3>会员进度</h3><div class="cards-grid">${snapshot.accounts.map(({ definition, progress }) => `<article class="challenge-card"><span class="badge">${escape(definition.type)} · ${escape(definition.tier || '未设置等级')}</span><h3>${escape(definition.name)}</h3><p class="help">周期 ${escape(definition.cycle_start || '未设置')} 至 ${escape(definition.expiry || '未设置')}</p><dl class="detail-fields"><div><dt>积分 / 里程余额</dt><dd>${number(progress.balance, 2)}</dd></div><div><dt>年度进度 / 升级目标</dt><dd>${number(progress.annual, 2)} / ${number(definition.annual_target)}</dd></div><div><dt>年度保级目标</dt><dd>${number(definition.retain_target)}</dd></div><div><dt>终身进度 / 目标</dt><dd>${number(progress.lifetime, 2)} / ${number(definition.lifetime_target)}</dd></div><div><dt>年度合资格消费</dt><dd>${number(progress.spend, 2)}</dd></div></dl></article>`).join('') || '<p class="muted">没有会员账户。</p>'}</div><p class="help">只读历史快照，不关联实时数据。原始记录即使被编辑或删除，此处也保持不变。</p></div><div class="dialog-footer">${button('导出这份存档', 'archive-export', `data-id="${archive.id}"`, 'secondary')}${button('关闭', 'close-modal', '', 'primary')}</div>`, 'wide-dialog');
}

async function boot() {
  setTheme();
  try {
    const auth = await api('auth');
    if (!auth.authenticated) {
      app.innerHTML = `<main class="auth"><div class="auth-art"><span class="eyebrow">A LITTLE MORE INTENTIONAL, EVERY DAY.</span><h1>生活的每一面，<br>都值得被记录。</h1><p>记录平常日子，追踪长远目标。<br>这是只属于你的生活空间。</p><div class="auth-orbit"><span>Life</span><i></i><b>OS</b></div><small>PERSONAL LIFE OS · LOCAL & PRIVATE</small></div><section class="auth-form"><a class="brand" href="/">${icon('grid')}<b>Life OS<span>PERSONAL SPACE</span></b></a><h2>${auth.configured ? '欢迎回来。' : '从这里，开始记录。'}</h2><p class="muted">${auth.configured ? '输入密码，回到你的生活空间。' : '设置本地访问密码，保护你的私人记录。'}</p><form id="auth-form"><label>访问密码<input name="password" type="password" minlength="12" maxlength="256" required autocomplete="${auth.configured ? 'current-password' : 'new-password'}" placeholder="至少 12 个字符"></label>${!auth.configured ? '<label>再次确认密码<input name="confirm" type="password" minlength="12" required autocomplete="new-password"></label>' : ''}<p id="auth-error" class="error" role="alert"></p><button class="primary" type="submit">${auth.configured ? '进入我的空间' : '创建私人空间'} ${icon('arrow')}</button></form><small class="muted">${icon('lock')} 数据保存在本机，不依赖第三方服务。</small></section></main>`;
      document.querySelector('#auth-form').addEventListener('submit', async event => {
        event.preventDefault(); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
        if (!auth.configured && values.password !== values.confirm) { document.querySelector('#auth-error').textContent = '两次密码不一致'; return; }
        form.querySelector('button').disabled = true;
        try { await api('auth', { method: 'POST', body: values }); await refresh(); } catch (error) { document.querySelector('#auth-error').textContent = error.message; } finally { form.querySelector('button').disabled = false; }
      });
      return;
    }
    await refresh();
  } catch (error) { app.innerHTML = `<div class="loading"><h2>暂时无法连接本地服务</h2><p>${escape(error.message)}</p><p>请确认服务器运行中，然后刷新页面。</p></div>`; }
}
const navItems = [['overview', 'grid', '生活概览', 'Overview'], ['calendar', 'calendar', '日历', 'Calendar'], ['daily_entries', 'book', '每日日记', 'Daily journal'], ['activities', 'clock', '活动时间线', 'Activities'], ['challenges', 'target', '目标与挑战', 'Goals & challenges'], ['loyalty', 'award', '常旅客计划', 'Loyalty programs'], ['travel', 'map', '旅行档案', 'Travel'], ['documents', 'file', '证件与文件', 'Documents'], ['analytics', 'trend', '统计与回顾', 'Analytics'], ['archives', 'book', '年度存档', 'Year archives']];
function activeModel() { return state.route === 'travel' ? state.travelTab : state.route === 'loyalty' ? state.loyaltyTab : state.route; }
function render() {
  setTheme();
  rememberBrowsePosition();
  const stats = calculate(state.records, state.year);
  const currentNav = navItems.find(item => item[0] === state.route) || ['settings', 'settings', '空间设置', 'Settings'];
  const due = reminders();
  app.innerHTML = `<aside class="sidebar"><a class="brand" href="#overview">${icon('grid')}<b>Life OS<span>PERSONAL SPACE</span></b></a><div class="workspace"><span class="avatar">我</span><div>我的生活空间<small>${icon('lock')} 本地 · 私有</small></div><span class="workspace-dot"></span></div><span class="nav-label">MY LIFE / 我的生活</span><nav>${navItems.map(([route, glyph, title]) => `<a href="#${route}" class="nav-item ${route === state.route ? 'active' : ''}">${icon(glyph)}${title}${route === 'overview' ? '<span class="nav-dot"></span>' : ''}</a>`).join('')}</nav><div class="sidebar-bottom"><div class="sidebar-note"><span class="seedling">✳</span><b>一点一滴，都是生活。</b><p>不必完美，只需真实。</p></div><a href="#settings" class="nav-item ${state.route === 'settings' ? 'active' : ''}">${icon('settings')}空间设置</a><div class="profile"><span class="avatar">L</span><div>Personal Life OS<small>你的私人生活操作系统</small></div>${button(icon(state.theme === 'dark' ? 'sun' : 'moon'), 'theme', 'aria-label="切换主题"', 'icon-button')}</div></div></aside><div class="main"><header class="topbar">${button(icon('menu'), 'menu', 'aria-label="打开导航"', 'icon-button mobile-menu')}<div class="breadcrumb">我的空间 <span>/</span> <b>${currentNav[2]}</b></div><div class="top-actions"><span class="local-status"><i></i>本地数据已连接</span>${button(`${icon('bell')}${due.length ? `<span class="notification-count">${due.length}</span>` : ''}`, 'notifications', 'aria-label="查看提醒"', 'icon-button notification')}${button(`${icon('plus')}快速记录`, 'quick', '', 'primary small')}</div></header><main class="content"><div class="page-heading"><div><span class="eyebrow">${currentNav[3].toUpperCase()}</span><h1>${state.route === 'overview' ? '好好生活，慢慢记录。' : currentNav[2]}<span class="title-dot">.</span></h1><p>${pageDescription()}</p></div><div class="heading-actions">${state.route === 'overview' || state.route === 'analytics' ? `<input id="year-select" type="number" min="1000" max="9998" step="1" aria-label="统计年份" title="输入任意年份，包括未来年份" value="${state.year}">` : ''}${state.route === 'overview' ? button(`${icon('book')}记录今天`, 'journal-today', '', 'secondary') : models[activeModel()] ? addButton(activeModel()) : ''}</div></div>${archiveBanner()}${state.route === 'archives' ? archivesPage() : state.route === 'overview' ? overview(stats) : state.route === 'calendar' ? calendarPage() : state.route === 'analytics' ? analytics(stats) : state.route === 'settings' ? settingsPage() : collectionPage(activeModel(), stats)}<footer>PERSONAL LIFE OS <span>生活不是待办清单，而是值得珍藏的每一天。</span><span>LOCAL FIRST. ALWAYS YOURS.</span></footer></main></div>`;
  bindInputs();
}
function pageDescription() {
  return ({ overview: new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }) + ' · 留意那些让日子发光的小事。', calendar: '在时间里，找到属于自己的生活节奏。', daily_entries: '用自己的方式，留住每一个平常日子。', activities: '让时间有迹可循，也给生活留一点空白。', challenges: '每一小步，都在靠近想成为的自己。', loyalty: '每一次出发，都在积累下一段旅程的可能。', travel: '世界很大，记录走过的路与遇见的风景。', documents: '把重要的事情安放好，安心去生活。', analytics: '回望走过的日子，看见自己的成长。', archives: '留住每一年走到这里时的样子。', settings: '按自己的节奏，照顾好这片私人空间。' })[state.route] || '';
}
function metric(title, value, unit, glyph, note, tone = '') {
  return `<article class="metric ${tone}"><div class="metric-top"><span>${title}</span>${icon(glyph)}</div><div class="metric-value">${number(value, 1)}<small>${unit}</small></div><p>${note}</p></article>`;
}
function sectionHead(title, subtitle = '', action = '') { return `<div class="section-head"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${action}</div>`; }
function overview(stats) {
  const today = localDate();
  const activities = state.records.activities.filter(row => row.date === today).sort((first, second) => first.start.localeCompare(second.start));
  const todayStudy = activities.filter(row => ['学习', '工作'].includes(state.records.categories.find(category => category.id === row.category_id)?.kind)).reduce((sum, row) => sum + stats.hours(row), 0);
  const todaySports = activities.filter(row => state.records.categories.find(category => category.id === row.category_id)?.kind === '运动').reduce((sum, row) => sum + stats.hours(row), 0);
  const entry = state.records.daily_entries.find(row => row.date === today);
  const challenges = state.records.challenges.filter(row => stats.challenges[row.id].status !== '已完成').slice(0, 3);
  const due = reminders().slice(0, 3);
  return `<section class="today-strip"><div><span class="sun-badge">${icon('sun')}</span><div><b>今天，也为自己留一点时间。</b><p>${entry ? escape(entry.summary || '今天的日记已经记录。') : '从一条记录开始，让平凡的今天也有迹可循。'}</p></div></div><span class="date-badge">${today.replaceAll('-', ' / ')}</span></section><div class="metric-grid">${metric('年度记录', stats.journalDays, '天', 'book', `${state.year} 年，与你自己保持连接`, 'sage')}${metric('学习与专注', stats.studyHours, '小时', 'clock', '每一点投入，都有意义')}${metric('旅行时光', stats.travelDays, '天', 'map', `${stats.flightCount} 次飞行 · ${number(milesToKilometers(stats.flightMiles))} 公里`)}${metric('运动与健康', stats.sportsHours, '小时', 'heart', '照顾身体，也照顾自己')}</div><div class="dashboard-grid"><div class="dashboard-primary"><section class="panel">${sectionHead('生活的足迹', `${state.year} 年 · 每一个小方格，都是认真生活的证明`, '<span class="badge">年度记录</span>')}<div class="browse-toolbar"><label>规划年月 <input id="footprint-month" type="month" min="1000-01" max="9998-12" value="${state.date.slice(0, 7)}" aria-label="生活足迹年月"></label>${button('打开所选月份', 'browse-calendar', '', 'text-button')}${button('回到今天', 'browse-today', '', 'text-button')}${button('存档并规划下一年', 'archive-new', `data-year="${state.year}" data-plan="1"`, 'text-button')}</div>${heatmap(state.year)}</section><section class="panel">${sectionHead('今日时间线', `${activities.length} 项活动 · 专注 ${number(todayStudy, 1)}h · 运动 ${number(todaySports, 1)}h`, button(`查看全部 ${icon('arrow')}`, 'navigate', 'data-route="activities"', 'text-button'))}${activities.length ? `<div class="timeline">${activities.map(row => timelineItem(row)).join('')}</div>` : empty('今天的时间线还是一张白纸', '从一件小事开始记录。', addButton('activities'))}</section><section class="panel">${sectionHead('最近的日子', '生活的碎片，也值得珍藏', button(`所有记录 ${icon('arrow')}`, 'navigate', 'data-route="daily_entries"', 'text-button'))}${state.records.daily_entries.slice().sort((first, second) => second.date.localeCompare(first.date)).slice(0, 3).map(row => `<button class="journal-row" data-action="detail" data-model="daily_entries" data-id="${row.id}"><span class="journal-date"><b>${row.date.slice(8)}</b><small>${Number(row.date.slice(5, 7))} 月</small></span><span><b>${escape(row.summary || '平常而珍贵的一天')}</b><small>${escape(row.city || '未记录位置')} ${row.tags ? '· ' + escape(row.tags) : ''}</small></span><span class="mood">${mood(row.mood)}</span>${icon('chevron')}</button>`).join('') || empty('还没有生活记录', '记录今天，从这里开始。')}</section></div><div class="dashboard-secondary"><section class="panel goals-panel">${sectionHead('慢慢靠近目标', `${state.records.challenges.filter(row => stats.challenges[row.id].status === '进行中').length} 个进行中 · ${state.records.challenges.filter(row => stats.challenges[row.id].status === '已完成').length} 个已完成`, icon('target'))}${challenges.map(row => challengeCard(row, stats.challenges[row.id], true)).join('') || empty('给未来的自己，一个小目标', '', addButton('challenges'))}${button(`查看全部目标 ${icon('arrow')}`, 'navigate', 'data-route="challenges"', 'wide text-button')}</section><section class="panel">${sectionHead('别忘了这些事', '重要的事，替你记着', icon('bell'))}${due.length ? due.map(row => `<button class="reminder-row" data-action="detail" data-model="${row.model}" data-id="${row.id}"><span class="reminder-icon">${icon(row.model === 'documents' ? 'file' : 'award')}</span><span><b>${escape(row.title)}</b><small>${escape(row.subtitle)}</small></span><span class="badge ${row.days <= 30 ? 'danger' : 'amber'}">${row.days < 0 ? '已过期' : `${row.days} 天`}</span></button>`).join('') : '<div class="quiet-message">'+icon('check')+'暂时没有即将到期的事项</div>'}</section><section class="panel">${sectionHead('今日待办', '给今天一点方向', button(icon('plus'), 'add', 'data-model="todos" aria-label="添加待办"', 'icon-button'))}${state.records.todos.filter(row => row.date === today).map(row => `<div class="todo-row"><input type="checkbox" aria-label="完成 ${escape(row.name)}" data-todo="${row.id}" ${row.done ? 'checked' : ''}><span class="${row.done ? 'done' : ''}">${escape(row.name)}</span>${editButton('todos', row, icon('chevron'), 'icon-button')}</div>`).join('') || '<p class="muted">今天没有待办，享受一点自由。</p>'}</section><div class="quote-card"><span>“</span><p>把日子过成自己喜欢的样子，<br>不急，慢慢来。</p><small>A LIFE WELL NOTICED.</small></div></div></div>`;
}
function mood(value) { return ['—', '☂', '☁', '◡', '☺', '☀'][Math.round(value)] || '—'; }
function heatmap(year) {
  const counts = new Map();
  for (const row of [...state.records.daily_entries, ...state.records.activities, ...state.records.flights]) counts.set(row.date, (counts.get(row.date) || 0) + 1);
  const first = `${year}-01-01`;
  const offset = (new Date(`${first}T12:00:00`).getDay() + 6) % 7;
  const total = new Date(year, 1, 29).getMonth() === 1 ? 366 : 365;
  const count = state.records.daily_entries.filter(row => row.date.startsWith(String(year))).length;
  return `<div class="heatmap-scroll"><div class="heatmap-months">${Array.from({ length: 12 }, (_, index) => `<span>${index + 1}月</span>`).join('')}</div><div class="heatmap-body"><div class="weekday-labels"><span>一</span><span>三</span><span>五</span><span>日</span></div><div class="heatmap" style="--weeks:${Math.ceil((total + offset) / 7)}">${Array.from({ length: offset }, () => '<i class="heat-empty"></i>').join('')}${Array.from({ length: total }, (_, index) => { const date = dateAdd(first, index); const value = counts.get(date) || 0; return `<button class="heat-cell level-${Math.min(4, value)} ${date.slice(0, 7) === state.date.slice(0, 7) ? 'selected-month' : ''} ${date === localDate() ? 'is-today' : ''}" title="${date}：${value} 条记录 ${escape(holidaysOn(date).map(holiday => holiday.name).join(' / '))}" aria-label="${date}：${value} 条记录 ${escape(holidaysOn(date).map(holiday => holiday.name).join(' / '))}" data-action="day" data-date="${date}"></button>`; }).join('')}</div></div></div><div class="heatmap-footer"><span>已记录 <b>${count}</b> 天 <span class="muted">· 生活在细节中积累</span></span><span class="heat-legend">少${[0, 1, 2, 3, 4].map(level => `<i class="heat-cell level-${level}"></i>`).join('')}多</span></div>`;
}
function timelineItem(row, draggable = false) {
  const category = state.records.categories.find(item => item.id === row.category_id);
  return `<div class="timeline-item" ${draggable ? `draggable="true" data-drag-id="${row.id}"` : ''}><time>${row.start}<small>${row.end}</small></time><span class="timeline-line"><i style="background:${safeColor(category?.color)}"></i></span><button class="timeline-content" data-action="detail" data-model="activities" data-id="${row.id}"><span><b>${escape(row.name)}</b><small>${escape(row.location || '未记录地点')}</small></span><span class="activity-meta"><span class="tag" style="--tag-color:${safeColor(category?.color)}">${escape(category?.name || '未分类')}</span><small>${number(calculate(state.records).hours(row), 2)} h</small></span></button></div>`;
}
function safeColor(value) { return /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#a6bfa3'; }
function challengeCard(row, progress, compact = false) {
  return `<article class="challenge-card ${compact ? 'compact' : ''}"><div class="challenge-heading"><span class="badge">${escape(row.type || '自定义')}</span>${!compact ? editButton('challenges', row) : ''}</div><button class="card-title" data-action="detail" data-model="challenges" data-id="${row.id}">${escape(row.name)}</button><div class="progress-label"><span><b>${number(progress.current, 2)}</b> / ${number(row.target)} ${escape(row.unit)}</span><b>${number(progress.percent)}%</b></div><div class="progress-track"><span style="width:${progress.percent}%"></span></div><div class="challenge-foot"><small>${escape(progress.status)}${row.end_date ? ` · ${row.end_date} 截止` : ''}</small>${button('+ 进度', 'progress', `data-id="${row.id}"`, 'text-button')}</div>${compact ? '' : `<p class="muted">还差 ${number(progress.remaining, 2)} ${escape(row.unit)} · ${progress.projected ? `预计 ${progress.projected} 达成` : '积累更多记录后估算达成日期'}</p>`}</article>`;
}
function empty(title, subtitle = '', action = '') { return `<div class="empty"><span>${icon('book')}</span><h3>${title}</h3><p>${subtitle}</p>${action}</div>`; }
function reminders() {
  const rows = [];
  for (const row of state.records.documents || []) {
    const days = daysUntil(row.expiry);
    if (days <= Math.max(180, row.remind_days || 0)) rows.push({ model: 'documents', id: row.id, title: row.name, subtitle: `${row.expiry} 到期 · ${days < 0 ? '已过期，请及时更新' : days <= 30 ? '30 天内到期' : days <= 90 ? '90 天内到期' : '请提前安排续期'}`, days });
  }
  for (const row of state.records.loyalty_accounts || []) {
    const days = daysUntil(row.expiry);
    if (days <= 90) rows.push({ model: 'loyalty_accounts', id: row.id, title: row.name, subtitle: `${row.expiry} 会员 / 保级截止`, days });
  }
  for (const row of state.records.reminders || []) if (!row.done && daysUntil(row.date) <= 30) rows.push({ model: 'reminders', id: row.id, title: row.name, subtitle: `${row.date} · ${row.notes || '自定义提醒'}`, days: daysUntil(row.date) });
  if (state.records.challenges) {
    const metrics = calculate(state.records);
    for (const row of state.records.challenges) if (metrics.challenges[row.id].status === '进行中' && metrics.challenges[row.id].percent >= 80) rows.push({ model: 'challenges', id: row.id, title: row.name, subtitle: `已完成 ${number(metrics.challenges[row.id].percent)}%，再往前一点`, days: row.end_date ? daysUntil(row.end_date) : 999 });
    for (const row of state.records.loyalty_accounts) if (row.lifetime_target > 0 && metrics.accounts[row.id].lifetime / row.lifetime_target >= 0.8 && metrics.accounts[row.id].lifetime < row.lifetime_target) rows.push({ model: 'loyalty_accounts', id: row.id, title: row.name, subtitle: `终身里程碑还差 ${number(row.lifetime_target - metrics.accounts[row.id].lifetime)}`, days: 999 });
  }
  return rows.sort((first, second) => first.days - second.days);
}
function collectionPage(model, stats) {
  let tabs = '';
  const options = state.route === 'travel' ? ['trips', 'flights', 'hotel_stays', 'flight_history'] : state.route === 'loyalty' ? ['loyalty_accounts', 'loyalty_transactions', 'loyalty_rules'] : state.route === 'activities' ? ['activities', 'categories'] : [];
  if (options.length) tabs = `<div class="tabs">${options.map(item => button(item === 'flight_history' ? '飞行足迹' : models[item].label, 'tab', `data-model="${item}"`, item === model ? 'selected' : '')).join('')}</div>`;
  if (model === 'flight_history') return tabs + flightHistoryPage();
  if (state.route === 'activities' && state.activityTab === 'categories') model = 'categories';
  let rows = state.records[model] || [];
  const filter = state.filter;
  rows = rows.filter(row => (label(model, row) + ' ' + JSON.stringify(Object.fromEntries(Object.entries(row).filter(([key]) => !(models[model].sensitive || []).includes(key))))).toLowerCase().includes(state.query.toLowerCase()));
  if (filter && model === 'challenges') rows = rows.filter(row => stats.challenges[row.id].status === filter);
  if (filter && model === 'documents') rows = rows.filter(row => filter === '已过期' ? daysUntil(row.expiry) < 0 : filter === '正常' ? daysUntil(row.expiry) > 180 : daysUntil(row.expiry) >= 0 && daysUntil(row.expiry) <= Number(filter));
  rows = rows.slice().sort((first, second) => { const firstKey = state.sort === 'name' ? label(model, first) : first.date || (first.flight_year ? first.flight_year + '-00-00' : '') || first.start_date || first.expiry || first.created_at; const secondKey = state.sort === 'name' ? label(model, second) : second.date || (second.flight_year ? second.flight_year + '-00-00' : '') || second.start_date || second.expiry || second.created_at; return String(firstKey).localeCompare(String(secondKey), 'zh-CN') * (state.sort === 'desc' ? -1 : 1); });
  const summary = model === 'flights' ? `<div class="compact-metrics">${metric('累计飞行', milesToKilometers(state.records.flights.reduce((sum, row) => sum + row.distance, 0)), '公里', 'plane', '全部年份')}${metric('飞行次数', state.records.flights.length, '次', 'map', `${new Set(state.records.flights.map(row => row.airline)).size} 家航空公司 · ${new Set(state.records.flights.map(row => row.aircraft).filter(Boolean)).size} 种机型`)}</div>` : '';
  return `${tabs}${summary}<div class="collection-toolbar"><label class="search-box">${icon('search')}<input id="search" type="search" value="${escape(state.query)}" placeholder="搜索${models[model].label}…" aria-label="搜索记录"></label><div>${model === 'challenges' || model === 'documents' ? `<select id="filter" aria-label="筛选状态"><option value="">全部状态</option>${(model === 'challenges' ? ['未开始', '进行中', '已完成', '已暂停', '失败 / 过期'] : ['正常', '180', '90', '30', '已过期']).map(value => `<option value="${value}" ${value === filter ? 'selected' : ''}>${/^\d+$/.test(value) ? value + ' 天内到期' : value}</option>`).join('')}</select>` : ''}<select id="sort" aria-label="排序"><option value="desc" ${state.sort === 'desc' ? 'selected' : ''}>日期从新到旧</option><option value="asc" ${state.sort === 'asc' ? 'selected' : ''}>日期从旧到新</option><option value="name" ${state.sort === 'name' ? 'selected' : ''}>按名称排序</option></select><span class="muted count">${rows.length} 条记录</span>${model !== activeModel() ? addButton(model) : ''}</div></div>${rows.length ? model === 'challenges' ? `<div class="cards-grid">${rows.map(row => challengeCard(row, stats.challenges[row.id])).join('')}</div>` : model === 'daily_entries' ? `<div class="cards-grid journal-cards">${rows.map(row => journalCard(row)).join('')}</div>` : model === 'loyalty_accounts' ? `<div class="cards-grid">${rows.map(row => accountCard(row, stats.accounts[row.id])).join('')}</div>` : model === 'documents' ? `<div class="cards-grid">${rows.map(row => documentCard(row)).join('')}</div>` : model === 'activities' ? `<section class="panel">${groupActivities(rows)}</section>` : tableView(model, rows) : `<section class="panel">${empty(`还没有${models[model].singular}记录`, '把想记住的事情，放在这里。', addButton(model))}</section>`}${model === 'loyalty_rules' ? '<p class="help">规则是你的个人配置，不是任何品牌的官方标准。每条规则的生效日期决定新记录的计算方式；历史记录保留创建时的规则快照。修改记录的账户或日期会重新匹配规则。</p>' : ''}`;
}
function flightHistoryPage() {
  const history = buildFlightHistory(state.records.flights, { directory: state.directory || [], mode: state.flightHistoryMode || 'first', includeStopovers: state.historyStopovers === true, includePlanned: state.historyPlanned === true });
  const unknown = findUnknownFlightReferences(state.records.flights, state.directory || []);
  const all = state.flightHistoryMode === 'all';
  const list = (entries, kind) => entries.length ? `<ol class="flight-history-list">${entries.map((entry, index) => `<li><span class="history-rank">${index + 1}</span><div><b>${escape(entry.label)}</b>${entry.fullName ? `<span class="history-full-name">${escape(entry.fullName)}</span>` : ''}<small>${all ? '' : '首次'}${kind === 'airports' ? escape(entry.role) : '乘坐'}：${escape(entry.date)}${entry.approximate ? '（日期待补）' : ''} · ${escape(entry.flightNumber)}</small><small>${entry.planned ? '未来计划 · ' : ''}${kind === 'airports' ? `记录出现 ${entry.count} 次` : `记录乘坐 ${entry.count} 次`}</small></div>${button('查看航班', 'detail', `data-model="flights" data-id="${escape(entry.flightId)}"`, 'text-button')}</li>`).join('')}</ol>` : empty('还没有对应飞行足迹', '添加航班后会自动生成。');
  return `${referenceIssues(unknown)}<div class="collection-toolbar"><div><select id="flight-history-mode" aria-label="飞行足迹列表模式"><option value="first" ${all ? '' : 'selected'}>首次出现（去重）</option><option value="all" ${all ? 'selected' : ''}>完整顺序（含重复）</option></select><label class="history-option"><input id="history-stopovers" type="checkbox" ${state.historyStopovers ? 'checked' : ''}>计入经停机场</label><label class="history-option"><input id="history-planned" type="checkbox" ${state.historyPlanned ? 'checked' : ''}>包含未来计划</label></div>${button('机场 / 航司资料库', 'reference-manager', '', 'secondary')}${addButton('flights')}</div><div class="compact-metrics">${metric('到访机场', history.airportCount, '座', 'map', `来自 ${history.countedFlights} 条飞行记录`)}${metric('乘坐航司', history.airlineCount, '家', 'plane', '按首次乘坐顺序自动生成')}</div><p class="help">每段航班按「出发机场 → 经停（可选）→ 到达机场」统计到访顺序，首次出现即入榜，出发机场也算到访。新增、编辑、删除航班后自动更新，不受航班表格搜索和排序影响。已排除 ${history.excludedFuture} 条未来计划。</p><p class="help">顺序按飞行年份、日期、出发当地时间排列。${history.approximateFlights} 条仅年份记录置于对应年份的「日期待补」组，组内按原表序号或录入时间排序；这不代表它们早于同年日期完整的航班。同日缺失时间的记录暂列该日末尾，无法判断准确乘坐先后。跨时区日期 / 当地时间不换算成 UTC；到达日期显示已填写的跨日偏移，经停日期仅用航班出发日期作参考。</p><div class="analytics-grid"><section class="panel">${sectionHead(all ? '机场到访顺序' : '机场 · 首次到访顺序', '三字码 + 机场全名；详情标注出发 / 经停 / 到达')}${list(history.airports, 'airports')}</section><section class="panel">${sectionHead(all ? '航司乘坐顺序' : '航司 · 首次乘坐顺序', '大号 IATA 二字码 + 小字号航司名称；以记录填写的航司为准')}${list(history.airlines, 'airlines')}</section></div>`;
}
function groupActivities(rows) {
  const dates = [...new Set(rows.map(row => row.date))];
  return dates.map(date => `<div class="activity-group"><h3>${date} <span class="muted">${new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'long' })}</span>${button('打开当天', 'day', `data-date="${date}"`, 'text-button')}</h3><div class="timeline">${rows.filter(row => row.date === date).sort((first, second) => first.start.localeCompare(second.start)).map(row => timelineItem(row)).join('')}</div></div>`).join('');
}
function journalCard(row) {
  const attachments = state.attachments.filter(item => item.model === 'daily_entries' && item.record_id === row.id);
  return `<article class="panel journal-card"><div class="journal-card-top"><span>${row.date}</span><span class="mood">${mood(row.mood)}</span></div><button class="card-title" data-action="detail" data-model="daily_entries" data-id="${row.id}">${escape(row.summary || '平常而珍贵的一天')}</button><p class="journal-excerpt">${escape(row.content || '为今天留下一点记忆…').slice(0, 160)}</p><div class="tags">${(row.tags || '').split(/[,，]/).filter(Boolean).map(tag => `<span class="tag">${escape(tag)}</span>`).join('')}</div><div class="journal-card-foot"><small>${escape(row.city || '未记录地点')} · ${row.sleep || '—'}h 睡眠${attachments.length ? ` · ${attachments.length} 个附件` : ''}</small>${editButton('daily_entries', row)}</div></article>`;
}
function accountCard(row, current) {
  return `<article class="panel account-card"><div class="account-brand">${icon(row.type === '酒店' ? 'hotel' : 'plane')}<span>${escape(row.brand || row.type)}</span><span class="badge">${escape(row.tier || '普通会员')}</span></div><button class="card-title" data-action="detail" data-model="loyalty_accounts" data-id="${row.id}">${escape(row.name)}</button><small class="muted">会员号码 ${row.number ? '•••• ' + escape(row.number.slice(-4)) : '未填写'}</small><div class="account-balance"><b>${number(current.balance)}</b><span>当前积分 / 里程余额</span></div>${[['年度升级', current.annual, row.annual_target], ['年度保级', current.annual, row.retain_target], ['终身里程碑', current.lifetime, row.lifetime_target]].map(([title, value, target]) => `<div class="mini-progress"><div><span>${title}</span><small>${number(value)} / ${number(target)}</small></div><div class="progress-track"><span style="width:${target ? Math.min(100, Math.max(0, value / target * 100)) : 0}%"></span></div></div>`).join('')}<div class="challenge-foot"><small>${row.expiry ? row.expiry + ' 到期' : '未设置有效期'}</small>${editButton('loyalty_accounts', row)}</div></article>`;
}
function documentCard(row) {
  const days = daysUntil(row.expiry);
  return `<article class="panel document-card"><div class="document-top"><span class="document-symbol">${icon('file')}</span><span class="badge ${days <= 30 ? 'danger' : days <= 180 ? 'amber' : ''}">${days < 0 ? '已过期' : days <= 180 ? days + ' 天内到期' : '有效'}</span></div><button class="card-title" data-action="detail" data-model="documents" data-id="${row.id}">${escape(row.name)}</button><p class="muted">${escape(row.type || '重要文件')} · ${escape(row.issuer || '未填写机构')}</p><div class="document-number">${row.number ? '•••• •••• ' + escape(row.number.slice(-4)) : '未记录编号'}</div><div class="challenge-foot"><small>有效期至 <b>${row.expiry}</b></small>${editButton('documents', row)}</div></article>`;
}
function tableView(model, rows) {
  const fields = model === 'flights' ? ['date', 'number', 'origin', 'destination', 'aircraft', 'distance', 'price'].map(key => models.flights.fields.find(item => item.key === key)) : models[model].fields.filter(item => !['textarea', 'password', 'checkbox', 'color'].includes(item.type)).slice(0, 5);
  return `<section class="panel table-panel"><div class="table-scroll"><table><thead><tr>${fields.map(item => `<th>${item.label}</th>`).join('')}<th>操作</th></tr></thead><tbody>${rows.map(row => `<tr>${fields.map(item => `<td>${model === 'flights' && item.key === 'date' && !row.date ? escape(row.flight_year + '（日期待补）') : formatValue(item, row[item.key])}</td>`).join('')}<td class="table-actions">${button('查看', 'detail', `data-model="${model}" data-id="${row.id}"`, 'text-button')}${editButton(model, row)}${button('删除', 'delete', `data-model="${model}" data-id="${row.id}"`, 'text-button danger-text')}</td></tr>`).join('')}</tbody></table></div></section>`;
}
function formatValue(field, value) {
  if (['origin', 'destination', 'via'].includes(field.key) && value) return escape(field.key === 'via' ? value.split(/[,，;；/→]+/).map(item => airportCode(item, state.directory || [])).join(' / ') : airportCode(value, state.directory || []));
  if (field.displayUnit === 'km') return value === null || value === undefined || value === '' ? '—' : number(milesToKilometers(value), 2);
  if (field.type === 'reference') return escape(state.records[field.model].find(row => row.id === value)?.name || (value ? '关联记录' : '—'));
  if (field.type === 'checkbox') return value ? '是' : '否';
  if (field.type === 'password') return value ? '•••• ' + escape(value.slice(-4)) : '—';
  if (field.type === 'number') return value === null || value === undefined || value === '' ? '—' : number(value, 2);
  return escape(value || '—');
}

function calendarPage() {
  const date = new Date(`${state.date}T12:00:00`);
  const start = state.calendarMode === 'month' ? dateAdd(localDate(new Date(date.getFullYear(), date.getMonth(), 1)), -((new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7)) : state.calendarMode === 'week' ? dateAdd(state.date, -((date.getDay() + 6) % 7)) : state.date;
  const length = state.calendarMode === 'month' ? 42 : state.calendarMode === 'week' ? 7 : 1;
  return `<section class="panel calendar-panel"><div class="calendar-toolbar"><div>${button('‹', 'calendar-prev', 'aria-label="上一期"', 'icon-button')}<h2>${date.getFullYear()} 年 ${date.getMonth() + 1} 月</h2>${button('›', 'calendar-next', 'aria-label="下一期"', 'icon-button')}${button('今天', 'calendar-today', '', 'secondary small')}<input id="calendar-month" type="month" min="1000-01" max="9998-12" value="${state.date.slice(0, 7)}" aria-label="日历年月"><input id="calendar-date" type="date" min="1000-01-01" max="9998-12-31" value="${state.date}" aria-label="跳转日期"></div><div class="tabs compact-tabs">${[['month', '月'], ['week', '周'], ['day', '日']].map(([mode, title]) => button(title, 'calendar-mode', `data-mode="${mode}"`, state.calendarMode === mode ? 'selected' : '')).join('')}</div></div>${state.calendarMode === 'month' ? `<div class="calendar-weekdays">${['周一', '周二', '周三', '周四', '周五', '周六', '周日'].map(day => `<span>${day}</span>`).join('')}</div><div class="calendar-grid">${Array.from({ length }, (_, index) => dayCell(dateAdd(start, index), date.getMonth())).join('')}</div>` : `<div class="week-grid ${state.calendarMode === 'day' ? 'single-day' : ''}">${Array.from({ length }, (_, index) => dayColumn(dateAdd(start, index))).join('')}</div>`}<p class="holiday-notice">${escape(holidayNotice(date.getFullYear()))}</p><div class="calendar-legend"><span><i class="legend-dot"></i> 已写日记</span><span>${icon('plane')} 旅行 / 航班</span><span>${icon('file')} 照片与附件</span><small>周 / 日视图：将活动拖至某天的时间槽可调整时间。</small></div></section>`;
}
function holidayLabels(date) {
  return holidaysOn(date).map(holiday => `<span class="holiday-label" title="${escape(holiday.description)}">${escape(holiday.name)}</span>`).join('');
}
function dayCell(date, month) {
  const entry = state.records.daily_entries.find(row => row.date === date);
  const activities = state.records.activities.filter(row => row.date === date);
  const flights = state.records.flights.filter(row => row.date === date);
  const trips = state.records.trips.filter(row => row.start_date <= date && row.end_date >= date);
  const attached = entry && state.attachments.some(item => item.model === 'daily_entries' && item.record_id === entry.id);
  return `<button class="calendar-day ${new Date(`${date}T12:00:00`).getMonth() !== month ? 'outside' : ''} ${date === localDate() ? 'today' : ''}" data-action="day" data-date="${date}"><div class="day-number"><span>${Number(date.slice(8))}</span>${entry ? '<i class="legend-dot"></i>' : ''}${attached ? icon('file') : ''}</div><div class="day-holidays">${holidayLabels(date)}</div>${entry ? `<p class="calendar-summary">${escape(entry.summary || '已记录日记')}</p>` : ''}${activities.slice(0, 2).map(row => { const category = state.records.categories.find(item => item.id === row.category_id); return `<span class="calendar-event" style="--tag-color:${safeColor(category?.color)}">${row.start} ${escape(row.name)}</span>`; }).join('')}${activities.length > 2 ? `<small class="muted">+${activities.length - 2} 项活动</small>` : ''}${flights.length || trips.length ? `<span class="calendar-travel">${icon('plane')}${flights.length ? flights.map(row => escape(row.origin + ' → ' + row.destination)).join(' · ') : escape(trips[0].name)}</span>` : ''}</button>`;
}
function dayColumn(date) {
  const activities = state.records.activities.filter(row => row.date === date);
  return `<div class="day-column"><button class="day-column-header ${date === localDate() ? 'today' : ''}" data-action="day" data-date="${date}">${new Date(`${date}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' })}<b>${date.slice(5)}</b><span class="day-holidays">${holidayLabels(date)}</span></button>${Array.from({ length: 24 }, (_, hour) => `<div class="time-slot" data-drop-date="${date}" data-drop-hour="${hour}"><span>${String(hour).padStart(2, '0')}:00</span>${activities.filter(row => Number(row.start.slice(0, 2)) === hour).map(row => `<button draggable="true" data-drag-id="${row.id}" data-action="detail" data-model="activities" data-id="${row.id}" class="slot-activity">${row.start}–${row.end}<b>${escape(row.name)}</b></button>`).join('')}</div>`).join('')}</div>`;
}
function dayDetail(date) {
  setBrowseDate(date);
  render();
  const entry = state.records.daily_entries.find(row => row.date === date);
  const activities = state.records.activities.filter(row => row.date === date).sort((first, second) => first.start.localeCompare(second.start));
  const related = ['flights', 'hotel_stays'].flatMap(model => state.records[model].filter(row => row.date === date).map(row => ({ model, row })));
  openDialog(`<div class="dialog-heading"><div><span class="eyebrow">A DAY IN YOUR LIFE</span><h2>${date}</h2><div class="day-holidays">${holidayLabels(date)}</div></div>${closeButton}</div><div class="dialog-body">${entry ? `<div class="day-summary"><span class="mood">${mood(entry.mood)}</span><div><h3>${escape(entry.summary || '今天的日记')}</h3><p class="muted">${escape(entry.city)} · 睡眠 ${entry.sleep}h · ${number(entry.steps)} 步</p></div>${editButton('daily_entries', entry)}</div><div class="markdown">${markdown(entry.content)}</div>${attachmentList('daily_entries', entry.id)}` : empty('这一天，还没有日记', '写下一点想记住的事情。', button('写当天日记', 'add', `data-model="daily_entries" data-date="${date}"`, 'primary'))}<div class="tags">${button(icon('plane') + ' 添加航班', 'add', `data-model="flights" data-date="${date}"`, 'secondary')}${button(icon('hotel') + ' 添加住宿', 'add', `data-model="hotel_stays" data-date="${date}"`, 'secondary')}</div><div class="section-head"><h3>活动时间线</h3>${button('+ 添加活动', 'add', `data-model="activities" data-date="${date}"`, 'text-button')}</div><div class="timeline">${activities.map(row => timelineItem(row)).join('') || '<p class="muted">这一天还没有活动记录。</p>'}</div>${related.map(({ model, row }) => `<div class="related-row">${icon(models[model].icon)}${escape(label(model, row))}${button('查看详情', 'detail', `data-model="${model}" data-id="${row.id}"`, 'text-button')}</div>`).join('')}</div>`, 'wide-dialog');
}
function analytics(stats) {
  const year = String(state.year);
  const entries = state.records.daily_entries.filter(row => row.date.startsWith(year));
  const flights = state.records.flights.filter(row => (row.date || String(row.flight_year || '')).startsWith(year));
  const trips = state.records.trips.filter(row => row.start_date <= `${year}-12-31` && row.end_date >= `${year}-01-01`);
  const countries = new Set(trips.flatMap(row => (row.country || '').split(/[,，]/).map(value => value.trim()).filter(Boolean)));
  const cities = trips.flatMap(row => (row.city || '').split(/[,，]/).map(value => value.trim()).filter(Boolean));
  const airlines = [...new Set(flights.map(row => row.airline))].map(name => ({ name, value: milesToKilometers(flights.filter(row => row.airline === name).reduce((sum, row) => sum + row.distance, 0)), color: '#8da994' }));
  const completed = state.records.challenges.filter(row => stats.challenges[row.id].status === '已完成' && (row.start_date?.startsWith(year) || row.end_date?.startsWith(year) || stats.challenges[row.id].history.some(item => item.date.startsWith(year))));
  return `<div class="report-toolbar"><p class="muted">所有图表由实际记录生成 · 统计以记录日期为准</p>${button(`${icon('download')}导出年度报告 / PDF`, 'print', '', 'secondary small')}</div><div class="metric-grid">${metric('记录的日子', entries.length, '天', 'book', `${year} 年的生活痕迹`, 'sage')}${metric('旅行与探索', countries.size, '个国家 / 地区', 'map', `${new Set(cities).size} 座城市 · ${stats.travelDays} 天旅行`)}${metric('飞行里程', milesToKilometers(stats.flightMiles), '公里', 'plane', `${flights.length} 个航段`)}${metric('完成挑战', completed.length, '个', 'target', '每一小步都算数')}</div><div class="analytics-grid"><section class="panel">${sectionHead('每月生活记录', '有意识地记录，与自己保持连接')}<div class="bar-chart">${Array.from({ length: 12 }, (_, index) => { const month = String(index + 1).padStart(2, '0'); const count = entries.filter(row => row.date.slice(5, 7) === month).length; return `<div class="chart-column"><span>${count}</span><i style="height:${Math.max(2, count / 31 * 150)}px" title="${index + 1} 月：${count} 天"></i><small>${index + 1}月</small></div>`; }).join('')}</div></section><section class="panel">${sectionHead('时间花在了哪里', '活动时长分布 / 小时')}${horizontalBars(stats.categories.map(row => ({ name: row.name, value: row.hours, color: row.color })))}</section><section class="panel">${sectionHead('睡眠与心情', '按月汇总 · 仅统计已填写的数据')}<div class="table-scroll"><table><thead><tr><th>月份</th><th>平均睡眠</th><th>平均心情</th><th>总步数</th></tr></thead><tbody>${Array.from({ length: 12 }, (_, index) => { const rows = entries.filter(row => Number(row.date.slice(5, 7)) === index + 1); if (!rows.length) return ''; const sleep = rows.filter(row => row.sleep > 0); const moodRows = rows.filter(row => row.mood > 0); return `<tr><td>${index + 1}月</td><td>${sleep.length ? number(sleep.reduce((sum, row) => sum + row.sleep, 0) / sleep.length, 1) + ' h' : '—'}</td><td>${moodRows.length ? number(moodRows.reduce((sum, row) => sum + row.mood, 0) / moodRows.length, 1) + ' / 5' : '—'}</td><td>${number(rows.reduce((sum, row) => sum + row.steps, 0))}</td></tr>`; }).join('')}</tbody></table></div></section><section class="panel">${sectionHead('与哪些航空公司同行', `${year} 年飞行距离分布 / 公里`)}${horizontalBars(airlines)}</section><section class="panel full-span">${sectionHead(`${year} · 这一年的故事`, '年度回顾 · 不给生活打分，只是看见自己的成长')}<div class="review-summary"><div><small>最常到访的城市</small><b>${escape(mostCommon(cities))}</b></div><div><small>最常乘坐的航空公司</small><b>${escape(mostCommon(flights.map(row => row.airline)))}</b></div><div><small>学习 / 工作</small><b>${number(stats.studyHours, 1)} / ${number(stats.categories.filter(row => row.kind === '工作').reduce((sum, row) => sum + row.hours, 0), 1)} h</b></div><div><small>新签发证件</small><b>${state.records.documents.filter(row => row.issued?.startsWith(year)).length} 份</b></div></div>${trips.length ? `<div class="destination-strip">${trips.map(row => `<button data-action="detail" data-model="trips" data-id="${row.id}">${icon('map')}<b>${escape(row.city || row.country || row.name)}</b><small>${row.start_date} — ${row.end_date}</small></button>`).join('')}</div>` : '<p class="muted">还没有这一年的旅行记录。</p>'}<h3>完成的挑战</h3><div class="tags">${completed.map(row => `<span class="tag">${icon('check')}${escape(row.name)}</span>`).join('') || '<span class="muted">继续积累，慢慢来。</span>'}</div><h3>年度时间线</h3>${[...entries.map(row => ({ model: 'daily_entries', row, date: row.date })), ...trips.map(row => ({ model: 'trips', row, date: row.start_date })), ...state.records.documents.filter(row => row.issued?.startsWith(year)).map(row => ({ model: 'documents', row, date: row.issued }))].sort((first, second) => second.date.localeCompare(first.date)).slice(0, 30).map(({ model, row, date }) => `<div class="review-event"><time>${date}</time>${icon(models[model].icon)}${button(escape(label(model, row)), 'detail', `data-model="${model}" data-id="${row.id}"`, 'text-button')}</div>`).join('')}<h3>会员里程碑与进度</h3>${state.records.loyalty_accounts.map(row => `<div class="review-event"><b>${escape(row.name)}</b><span>${escape(row.tier)} · 年度 ${number(stats.accounts[row.id].annual)} / ${number(row.annual_target)} · 终身 ${number(stats.accounts[row.id].lifetime)} / ${number(row.lifetime_target)}</span></div>`).join('') || '<p class="muted">还没有会员计划。</p>'}<p class="help">国家与城市按旅行中填写的名称去重，未接入地图地理编码；会员等级是当前值，尚不追溯历史等级变更。年度照片可在对应日记附件中下载。</p></section></div>`;
}
function mostCommon(values) { const counts = new Map(); for (const value of values) counts.set(value, (counts.get(value) || 0) + 1); return [...counts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0] || '等待下一段故事'; }
function horizontalBars(rows) {
  const visible = rows.filter(row => row.value > 0).sort((first, second) => second.value - first.value);
  const maximum = Math.max(1, ...visible.map(row => row.value));
  return visible.length ? `<div class="horizontal-bars">${visible.map(row => `<div><div><span><i style="background:${safeColor(row.color)}"></i>${escape(row.name)}</span><b>${number(row.value, 1)}</b></div><div class="progress-track"><span style="width:${row.value / maximum * 100}%;background:${safeColor(row.color)}"></span></div></div>`).join('')}</div>` : empty('还没有足够的数据', '开始记录后，统计会自然生长。');
}
function settingsPage() {
  return `<div class="settings-grid"><section class="panel">${sectionHead('数据属于你', '完整备份包含所有记录、历史计算规则与附件')}<div class="setting-row"><div><b>导出完整备份</b><p>下载可恢复的 JSON 文件。含明文敏感信息，请加密保存。</p></div>${button(`${icon('download')}导出`, 'export', '', 'secondary')}</div><div class="setting-row"><div><b>从备份恢复</b><p>完整替换当前业务数据；恢复前自动保存本机加密快照。</p></div><label class="button secondary">导入备份<input id="import-file" type="file" accept=".json,application/json" hidden></label></div><p class="help">本机数据目录含 life.sqlite 与 secret.key。停服后整体复制 data/ 是另一种备份方式。请不要只复制数据库而遗漏密钥。</p></section><section class="panel">${sectionHead('让空间更像你', '少一些负担，多一点自在')}<div class="setting-row"><div><b>浅色 / 深色模式</b><p>仅保存在当前浏览器，不修改业务数据。</p></div>${button(icon(state.theme === 'dark' ? 'sun' : 'moon') + '切换主题', 'theme', '', 'secondary')}</div><div class="setting-row"><div><b>添加到桌面</b><p>支持的浏览器可安装；手机端访问需要本机可达的 HTTPS 地址。</p></div>${button('安装应用', 'install', '', 'secondary')}</div><div class="setting-row"><div><b>活动分类</b><p>自定义你的活动分类与统计归类。</p></div>${button('管理分类', 'categories', '', 'secondary')}</div></section><section class="panel">${sectionHead('安全与访问', '单人本地空间 · 访问密码由服务端验证')}<div class="setting-row"><div><b>修改访问密码</b><p>更改后其他登录会话会失效。</p></div>${button('修改密码', 'password', '', 'secondary')}</div><div class="setting-row"><div><b>退出当前空间</b><p>数据会保留在本机数据库中。</p></div>${button('退出登录', 'logout', '', 'secondary')}</div><p class="help">证件号码、会员号码与附件使用 AES-256-GCM 加密落盘；其他日记和业务字段不是全库加密。请开启操作系统磁盘加密，不要直接暴露到公网。</p></section><section class="panel">${sectionHead('开始探索', '载入可编辑、可删除的虚构示例记录')}<p class="muted">演示数据仅在点击后添加一次，不会替换已有数据。示例会员规则不代表官方标准。</p>${button('载入演示数据', 'demo', '', 'secondary')}<hr><b>自定义提醒</b><p class="muted">到期提醒在登录后展示。服务未运行、浏览器未打开时不会发送推送。</p>${button('管理提醒', 'reminders', '', 'secondary')}${button('管理全部待办', 'todos', '', 'text-button')}</section></div>`;
}
function markdown(input = '') {
  return escape(input).split('\n').map(line => {
    const content = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/`([^`]+)`/g, '<code>$1</code>');
    if (/^### /.test(content)) return `<h4>${content.slice(4)}</h4>`;
    if (/^## /.test(content)) return `<h3>${content.slice(3)}</h3>`;
    if (/^# /.test(content)) return `<h2>${content.slice(2)}</h2>`;
    if (/^- /.test(content)) return `<div class="markdown-list">• ${content.slice(2)}</div>`;
    if (/^&gt; /.test(content)) return `<blockquote>${content.slice(5)}</blockquote>`;
    return content ? `<p>${content}</p>` : '<br>';
  }).join('');
}
function attachmentList(model, id) {
  const rows = state.attachments.filter(item => item.model === model && item.record_id === id);
  return `${photoGallery(rows)}<div class="attachments">${rows.map(item => `<div>${icon('file')}<a href="/api/attachments/${item.id}" download>${escape(item.name)}</a>${button('移除', 'delete-attachment', `data-id="${item.id}" data-model="${model}" data-record="${id}"`, 'text-button danger-text')}</div>`).join('')}</div>`;
}
function photoGallery(rows) {
  const photos = rows.filter(item => /^image\/(png|jpeg|gif|webp)$/.test(item.mime));
  return photos.length ? `<div class="photo-gallery">${photos.map(item => `<a href="/api/attachments/${item.id}" download title="下载 ${escape(item.name)}"><img src="/api/attachments/${item.id}?preview=1" alt="${escape(item.name)}" loading="lazy"><small>${escape(item.name)}</small></a>`).join('')}</div>` : '';
}
function detail(model, id) {
  const row = state.records[model].find(item => item.id === id);
  if (!row) return toast('记录已不存在');
  const stats = calculate(state.records);
  let extra = '';
  if (model === 'challenges') {
    const progress = stats.challenges[id];
    const values = [Number(row.initial || 0), ...progress.history.map(item => item.value)];
    const maximum = Math.max(row.target, ...values, 1);
    const minimum = Math.min(0, ...values);
    const points = values.map((value, index) => `${20 + index / Math.max(1, values.length - 1) * 560},${145 - (value - minimum) / (maximum - minimum) * 125}`).join(' ');
    extra = `${challengeCard(row, progress)}<h3>历史进度曲线</h3><svg class="progress-chart" viewBox="0 0 600 170" role="img" aria-label="挑战进度历史"><path d="M20 15v130h560" fill="none" stroke="var(--border)"/><polyline points="${points}" fill="none" stroke="var(--accent)" stroke-width="3"/>${values.map((value, index) => `<circle cx="${20 + index / Math.max(1, values.length - 1) * 560}" cy="${145 - (value - minimum) / (maximum - minimum) * 125}" r="4" fill="var(--accent)"><title>${number(value, 2)}</title></circle>`).join('')}</svg><div class="tags">${(row.milestones || '').split(/[,，]/).filter(value => Number(value) > 0).map(value => `<span class="badge">${progress.current >= Number(value) ? '✓' : '○'} ${escape(value)} ${escape(row.unit)}</span>`).join('')}</div><h3>进度流水</h3>${progress.history.map(event => `<div class="related-row"><time>${event.date}</time><b>${event.amount >= 0 ? '+' : ''}${number(event.amount, 2)}</b><span class="muted">${escape(event.source || '手动记录')}</span>${event.source && models[event.source] ? button('查看来源', 'detail', `data-model="${event.source}" data-id="${event.id}"`, 'text-button') : editButton('challenge_progress', event)}${models[event.source] ? '' : button('删除', 'delete', `data-model="challenge_progress" data-id="${event.id}"`, 'text-button danger-text')}</div>`).join('') || '<p class="muted">还没有进度更新。</p>'}`;
  }
  if (model === 'loyalty_accounts') extra = accountCard(row, stats.accounts[id]) + '<h3>关联流水（保留创建时的计算依据）</h3>' + ['flights', 'hotel_stays', 'loyalty_transactions'].flatMap(source => state.records[source].filter(item => item.account_id === id).map(item => `<div class="related-row"><time>${item.date}</time>${button(escape(label(source, item)), 'detail', `data-model="${source}" data-id="${item.id}"`, 'text-button')}<small>${item.accrual_mode === '直接入账' ? '直接入账' : (item._rules || []).length + ' 条历史规则'}</small></div>`)).join('');
  if (row.accrual_mode === '直接入账') extra += '<p class="help">本条记录直接计入所选计划，不叠加高级规则。年度积分 / 房晚与消费受账户保级周期限制；酒店终身房晚留空时使用合资格房晚。未选择计划则仅保存行程。</p>';
  if (row._rules && row.accrual_mode !== '直接入账') extra += `<h3>创建 / 重新关联时的计算依据</h3>${row._rules.map(rule => `<p class="help">${escape(rule.name)}：${escape(rule.metric)} × ${rule.multiplier} → ${escape(rule.destination)}，生效日期 ${rule.effective}</p>`).join('') || '<p class="help">创建时没有匹配的规则，此记录不会自动影响账户余额。请在添加下一条记录前配置规则。</p>'}`;
  if (model === 'trips') extra += '<h3>这段旅途的记录</h3>' + ['flights', 'hotel_stays', 'activities'].flatMap(source => state.records[source].filter(item => item.trip_id === id).map(item => `<div class="related-row">${icon(models[source].icon)}${button(escape(label(source, item)), 'detail', `data-model="${source}" data-id="${item.id}"`, 'text-button')}<time>${item.date}</time></div>`)).join('');
  if (model === 'documents') extra += button('+ 添加证件提醒', 'document-reminder', `data-id="${id}"`, 'secondary') + state.records.reminders.filter(item => item.document_id === id).map(item => `<div class="related-row">${item.date} ${escape(item.name)} ${editButton('reminders', item)}</div>`).join('');
  if (row.date && model !== 'daily_entries') extra += button('打开当天日记与时间线', 'day', `data-date="${row.date}"`, 'text-button');
  openDialog(`<div class="dialog-heading"><div><span class="eyebrow">${models[model].label}</span><h2>${escape(label(model, row))}</h2></div>${closeButton}</div><div class="dialog-body">${extra}<dl class="detail-fields">${models[model].fields.filter(item => !['content', 'notes'].includes(item.key)).map(item => `<div><dt>${item.label}</dt><dd>${formatValue(item, row[item.key])}</dd></div>`).join('')}</dl>${row.content ? `<div class="markdown">${markdown(row.content)}</div>` : ''}${row.notes ? `<h3>备注</h3><div class="markdown">${markdown(row.notes)}</div>` : ''}<h3>照片与附件</h3>${attachmentList(model, id)}${button('+ 上传附件', 'attach', `data-model="${model}" data-id="${id}"`, 'secondary')}<p class="help">单个附件不超过 5MB。支持 PNG / JPEG / GIF / WebP 预览；其他附件仅下载，不执行或内嵌。</p></div><div class="dialog-footer">${button('删除记录', 'delete', `data-model="${model}" data-id="${id}"`, 'secondary danger-text')}${editButton(model, row, '编辑记录', 'primary')}</div>`, 'wide-dialog');
}
function formField(item, values) {
  let value = values[item.key] ?? '';
  if (item.displayUnit === 'km' && value !== '') value = milesToKilometers(value);
  if (item.type === 'number' && !item.required && Number(value) < (item.min ?? 0)) value = '';
  const attrs = `name="${item.key}" id="field-${item.key}" ${item.required ? 'required' : ''}`;
  let control;
  if (item.type === 'textarea') control = `<textarea ${attrs} rows="${item.key === 'content' ? 10 : 3}" placeholder="${item.key === 'content' ? '写一点今天的故事… 支持标题、列表、加粗和代码。' : ''}">${escape(value)}</textarea>${item.key === 'content' ? `<div class="markdown-tools">${button('预览 Markdown', 'markdown-preview', '', 'text-button')}</div><div id="markdown-preview" class="markdown" hidden></div>` : ''}`;
  else if (item.type === 'reference' || item.type === 'select') {
    const options = item.type === 'reference' ? state.records[item.model].filter(row => !item.accountType || row.type === item.accountType).map(row => ({ value: row.id, text: label(item.model, row) })) : item.values.map(option => ({ value: option, text: option }));
    control = `<select ${attrs}><option value="">请选择（可留空）</option>${options.map(option => `<option value="${escape(option.value)}" ${option.value === value ? 'selected' : ''}>${escape(option.text)}</option>`).join('')}</select>`;
  } else if (item.type === 'checkbox') control = `<input ${attrs} type="checkbox" ${value ? 'checked' : ''}>`;
  else control = `<input ${attrs} type="${item.type}" value="${escape(value)}" ${item.type === 'password' ? 'autocomplete="off"' : ''} ${item.type === 'number' ? `step="any" min="${item.min ?? 0}" ${item.max !== undefined ? `max="${item.max}"` : ''}` : ''} ${item.type === 'text' ? 'maxlength="1000"' : ''}>${item.type === 'password' ? button('显示 / 隐藏', 'reveal', `data-target="field-${item.key}"`, 'text-button reveal-button') : ''}`;
  return `<label class="form-field ${item.type === 'textarea' ? 'full-field' : ''} ${item.type === 'checkbox' ? 'checkbox-field' : ''}" for="field-${item.key}"><span>${item.label}${item.required ? ' <em>*</em>' : ''}</span>${control}</label>`;
}
function editForm(model, id, defaults = {}) {
  const row = id ? state.records[model].find(item => item.id === id) : null;
  const values = row ? { ...row, accrual_mode: row.accrual_mode || '按高级规则' } : { accrual_mode: '直接入账', date: defaults.date || localDate(), start_date: localDate(), start: '09:00', end: '10:00', status: '进行中', type: models[model].fields.find(item => item.key === 'type')?.values?.[0] || '', color: '#a6bfa3', kind: '其他', multiplier: 1, target: 100, unit: '次', remind_days: 90, ...defaults };
  openDialog(`<div class="dialog-heading"><div><span class="eyebrow">MAKE A LITTLE ROOM FOR LIFE</span><h2>${id ? '编辑' : '添加'}${models[model].singular}</h2></div>${closeButton}</div><form id="record-form" data-model="${model}" data-id="${id || ''}"><div class="dialog-body"><div class="form-grid">${models[model].fields.map(item => formField(item.key === 'account_id' && ['flights', 'hotel_stays'].includes(model) ? { ...item, accountType: model === 'flights' ? '航空' : '酒店' } : item, values)).join('')}</div>${['flights', 'hotel_stays'].includes(model) ? '<p class="help">历史航班若只记得年份，可清空飞行日期并填写年份；这类记录计入年度统计，但不会出现在某个具体日历日期。每条记录独立选择入账计划，实际航司 / 酒店不决定积分归属。直接入账无需规则，也不会叠加高级规则。酒店合资格房晚计入年度，终身房晚留空时同合资格房晚；航班终身累计请单独填写。未选择计划则不累计。年度累计受计划保级周期限制。尚无计划？请先在常旅客计划页创建。</p>' : ''}${model === 'loyalty_rules' ? '<p class="help">可选高级功能：仅用于选择“按高级规则”的航班 / 住宿，及会员积分流水。历史记录保留原规则快照。</p>' : ''}<p id="form-error" class="error" role="alert"></p></div><div class="dialog-footer">${button('取消', 'close-modal', '', 'secondary')}<button class="primary" type="submit">${icon('check')}保存记录</button></div></form>`, 'wide-dialog');
  document.querySelector('#record-form').addEventListener('submit', async event => {
    event.preventDefault(); const form = event.currentTarget; const submit = form.querySelector('[type="submit"]');
    const values = Object.fromEntries(new FormData(form));
    for (const item of models[model].fields) { if (item.type === 'checkbox') values[item.key] = form.elements[item.key].checked; if (item.type === 'number' && values[item.key] !== '') values[item.key] = Number(values[item.key]); }
    for (const item of models[model].fields.filter(item => item.displayUnit === 'km')) {
      if (values[item.key] !== '') values[item.key] = row && values[item.key] === milesToKilometers(row[item.key]) ? row[item.key] : kilometersToMiles(values[item.key]);
    }
    submit.disabled = true;
    try { const saved = await api(`records/${model}${id ? '/' + id : ''}`, { method: id ? 'PUT' : 'POST', body: values }); modal.close(); await refresh(); toast('已保存，生活又多了一点痕迹。'); if (model === 'flights') { const pending = findUnknownFlightReferences([saved], state.directory)[0]; if (pending) referenceForm(pending.kind, pending.value, '', saved.id); } } catch (error) { document.querySelector('#form-error').textContent = error.message; } finally { submit.disabled = false; }
  });
}
function quickAdd() {
  openDialog(`<div class="dialog-heading"><div><span class="eyebrow">CAPTURE A MOMENT</span><h2>想记录些什么？</h2></div>${closeButton}</div><div class="dialog-body quick-grid">${['daily_entries', 'activities', 'flights', 'trips', 'hotel_stays', 'challenge_progress', 'documents', 'todos'].map(model => button(`${icon(models[model].icon)}<b>${models[model].singular}</b><small>留下一点生活的痕迹</small>`, 'add', `data-model="${model}"`, 'quick-item')).join('')}</div>`);
}
function bindInputs() {
  document.querySelector('#flight-history-mode')?.addEventListener('change', event => { state.flightHistoryMode = event.target.value; render(); });
  document.querySelector('#history-stopovers')?.addEventListener('change', event => { state.historyStopovers = event.target.checked; render(); });
  document.querySelector('#history-planned')?.addEventListener('change', event => { state.historyPlanned = event.target.checked; render(); });
  document.querySelector('#year-select')?.addEventListener('change', event => { changeBrowseYear(Number(event.target.value)); render(); });
  for (const selector of ['#footprint-month', '#calendar-month']) document.querySelector(selector)?.addEventListener('change', event => { if (setBrowseDate(event.target.value + '-01')) render(); });
  document.querySelector('#search')?.addEventListener('input', event => { const position = event.target.selectionStart; state.query = event.target.value; render(); const search = document.querySelector('#search'); search.focus(); search.setSelectionRange(position, position); });
  document.querySelector('#sort')?.addEventListener('change', event => { state.sort = event.target.value; render(); });
  document.querySelector('#filter')?.addEventListener('change', event => { state.filter = event.target.value; render(); });
  document.querySelector('#calendar-date')?.addEventListener('change', event => { if (setBrowseDate(event.target.value)) render(); });
  document.querySelector('#import-file')?.addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    if (file.size > 50 * 1024 * 1024) { toast('备份不能超过 50MB'); return; }
    if (!confirm('这会完整替换当前业务数据、附件及机场 / 航司资料库，不能合并。已导出一份当前备份了吗？确认后继续。')) { event.target.value = ''; return; }
    try { const payload = JSON.parse(await file.text()); await api('import', { method: 'POST', body: payload }); await refresh(); toast('备份恢复成功，恢复前快照已保存在 data/。'); } catch (error) { toast(error.message); }
  });
  for (const input of document.querySelectorAll('[data-todo]')) input.addEventListener('change', async event => {
    const row = state.records.todos.find(item => item.id === event.target.dataset.todo);
    try { await api(`records/todos/${row.id}`, { method: 'PUT', body: { ...row, done: event.target.checked } }); await refresh(); } catch (error) { event.target.checked = !event.target.checked; toast(error.message); }
  });
  for (const item of document.querySelectorAll('[data-drag-id]')) item.addEventListener('dragstart', event => event.dataTransfer.setData('text/plain', item.dataset.dragId));
  for (const slot of document.querySelectorAll('[data-drop-date]')) {
    slot.addEventListener('dragover', event => { event.preventDefault(); slot.classList.add('drag-over'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', async event => {
      event.preventDefault(); slot.classList.remove('drag-over');
      const row = state.records.activities.find(item => item.id === event.dataTransfer.getData('text/plain'));
      if (!row) return;
      const duration = calculate(state.records).hours(row) * 60;
      const start = Number(slot.dataset.dropHour) * 60;
      const end = start + duration;
      if (end >= 1440) return toast('活动跨天，请选择更早的时间或拆分记录。');
      const time = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(Math.round(minutes % 60)).padStart(2, '0')}`;
      try { await api(`records/activities/${row.id}`, { method: 'PUT', body: { ...row, date: slot.dataset.dropDate, start: time(start), end: time(end) } }); await refresh(); toast('活动时间已调整'); } catch (error) { toast(error.message); }
    });
  }
}
function navigate(route) { if (location.hash === `#${route}`) { state.route = route; render(); } else location.hash = route; }
function openModelManager(model) {
  openDialog(`<div class="dialog-heading"><h2>${models[model].label}</h2>${closeButton}</div><div class="dialog-body">${addButton(model)}${state.records[model].length ? tableView(model, state.records[model]) : empty('还没有记录')}</div>`, 'wide-dialog');
}
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target || target.disabled) return;
  event.preventDefault();
  const { action, model, id, date, route } = target.dataset;
  try {
    if (action === 'reference-add') return referenceForm(target.dataset.kind, target.dataset.value || '');
    if (action === 'reference-edit') return referenceForm(target.dataset.kind, '', target.dataset.code);
    if (action === 'reference-manager') return referenceManager();
    if (action === 'reference-delete') {
      if (!confirm('删除自定义资料？原始航班保留，相关条目可能需要重新补全。')) return;
      await api(`directory/${target.dataset.kind}/${target.dataset.code}`, { method: 'DELETE' }); await refresh(); referenceManager(); return;
    }
    if (action === 'archive-new') return archiveForm(target.dataset.year || state.year, target.dataset.plan === '1');
    if (action === 'archive-detail') return await showArchive(id);
    if (action === 'archive-delete') {
      if (!confirm('永久删除这份独立存档？原始记录不受影响。请先导出需要保留的版本。')) return;
      await api('archives/' + id, { method: 'DELETE' }); await refresh(); toast('存档已删除'); return;
    }
    if (action === 'archive-export') {
      if (!confirm('存档包含个人挑战、会员等级和进度，导出文件为明文，请安全保存。')) return;
      const archive = await api('archives/' + id);
      const url = URL.createObjectURL(new Blob([JSON.stringify({ format: 'life-os-year-archive', version: 1, ...archive }, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'life-os-' + archive.year + '-v' + archive.revision + '.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); return;
    }
    if (action === 'close-modal') return modal.close();
    if (action === 'theme') { state.theme = state.theme === 'light' ? 'dark' : 'light'; render(); return; }
    if (action === 'menu') return document.body.classList.toggle('menu-open');
    if (action === 'navigate') return navigate(route);
    if (action === 'quick') return quickAdd();
    if (action === 'edit') return editForm(model, id);
    if (action === 'add') return editForm(model, null, date ? { date } : {});
    if (action === 'progress') return editForm('challenge_progress', null, { challenge_id: id });
    if (action === 'document-reminder') return editForm('reminders', null, { document_id: id });
    if (action === 'detail') return detail(model, id);
    if (action === 'day') return dayDetail(date);
    if (action === 'journal-today') { const row = state.records.daily_entries.find(item => item.date === localDate()); return editForm('daily_entries', row?.id); }
    if (action === 'reveal') { const input = document.getElementById(target.dataset.target); input.type = input.type === 'password' ? 'text' : 'password'; return; }
    if (action === 'markdown-preview') { const preview = document.querySelector('#markdown-preview'); preview.hidden = !preview.hidden; preview.innerHTML = markdown(document.querySelector('[name="content"]').value); return; }
    if (action === 'tab') {
      state.query = ''; state.filter = '';
      if (state.route === 'travel') state.travelTab = model;
      else if (state.route === 'loyalty') state.loyaltyTab = model;
      else if (model === 'categories') return openModelManager('categories');
      render(); return;
    }
    if (action === 'delete') {
      if (!confirm('确认删除这条记录及其附件？该操作无法撤销。存在关联记录时系统会阻止删除。')) return;
      await api(`records/${model}/${id}`, { method: 'DELETE' }); modal.close(); await refresh(); toast('记录已删除，相关累计已重新计算。'); return;
    }
    if (action === 'delete-attachment') {
      if (!confirm('确认永久删除该附件？')) return;
      await api(`attachments/${id}`, { method: 'DELETE' }); await refresh(); detail(model, target.dataset.record); return;
    }
    if (action === 'attach') {
      const input = document.createElement('input'); input.type = 'file'; input.multiple = true;
      input.addEventListener('change', async () => {
        let saved = 0;
        try {
          for (const file of input.files) {
            if (file.size > 5 * 1024 * 1024) throw new Error(`${file.name} 超过 5MB，其余文件请分批上传。`);
            const content = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.onerror = () => reject(new Error('无法读取文件')); reader.readAsDataURL(file); });
            await api('attachments', { method: 'POST', body: { model, record_id: id, name: file.name, mime: file.type || 'application/octet-stream', content } }); saved++;
          }
          toast(`已上传 ${saved} 个附件`);
        } catch (error) { toast(`已保存 ${saved} 个附件。${error.message}`); }
        await refresh(); detail(model, id);
      }); input.click(); return;
    }
    if (action === 'browse-calendar') { state.calendarMode = 'month'; rememberBrowsePosition(); return navigate('calendar'); }
    if (action === 'browse-today') { setBrowseDate(localDate()); render(); return; }
    if (action.startsWith('calendar-')) {
      const previousDate = state.date;
      if (action === 'calendar-mode') state.calendarMode = target.dataset.mode;
      else if (action === 'calendar-today') state.date = localDate();
      else {
        const direction = action === 'calendar-prev' ? -1 : 1;
        if (state.calendarMode === 'month') { const value = new Date(`${state.date}T12:00:00`); value.setDate(1); value.setMonth(value.getMonth() + direction); state.date = localDate(value); }
        else state.date = dateAdd(state.date, direction * (state.calendarMode === 'week' ? 7 : 1));
      }
      if (!setBrowseDate(state.date)) setBrowseDate(previousDate);
      render(); return;
    }
    if (action === 'notifications') {
      openDialog(`<div class="dialog-heading"><h2>值得留意的事</h2>${closeButton}</div><div class="dialog-body">${reminders().map(row => `<div class="reminder-row"><span>${icon('bell')}</span><div><b>${escape(row.title)}</b><p>${escape(row.subtitle)}</p></div>${button('查看', 'detail', `data-model="${row.model}" data-id="${row.id}"`, 'text-button')}</div>`).join('') || empty('一切都安排妥当', '暂无到期提醒。')}<p class="help">提醒随页面刷新更新；未运行服务 / 未打开页面时，不发送后台推送。</p></div>`); return;
    }
    if (action === 'categories' || action === 'reminders' || action === 'todos') return openModelManager(action);
    if (action === 'demo') { if (!confirm('添加一套虚构演示数据？已有记录不会被覆盖。')) return; await api('demo', { method: 'POST', body: {} }); await refresh(); toast('演示数据已载入。你可以自由编辑或删除。'); return; }
    if (action === 'export') {
      if (!confirm('导出的备份包含明文证件号码、会员号码与附件。请仅在可信设备下载，并妥善加密保存。继续？')) return;
      const payload = await api('export'); const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `life-os-${localDate()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); toast('备份已导出'); return;
    }
    if (action === 'logout') { await api('logout', { method: 'POST', body: {} }); state.records = {}; state.attachments = []; state.archives = []; state.directory = []; state.archiveSuggestion = null; await boot(); return; }
    if (action === 'password') {
      openDialog(`<div class="dialog-heading"><h2>修改访问密码</h2>${closeButton}</div><form id="password-form"><div class="dialog-body"><label class="form-field">当前密码<input type="password" name="current" required autocomplete="current-password"></label><label class="form-field">新密码<input type="password" name="password" minlength="12" maxlength="256" required autocomplete="new-password"></label><label class="form-field">确认新密码<input type="password" name="confirm" minlength="12" required autocomplete="new-password"></label><p class="error" id="password-error"></p></div><div class="dialog-footer"><button class="primary" type="submit">保存密码</button></div></form>`);
      document.querySelector('#password-form').addEventListener('submit', async event => { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); if (values.password !== values.confirm) { document.querySelector('#password-error').textContent = '两次密码不一致'; return; } try { await api('password', { method: 'POST', body: values }); modal.close(); toast('访问密码已更新'); } catch (error) { document.querySelector('#password-error').textContent = error.message; } }); return;
    }
    if (action === 'install') { if (installPrompt) { await installPrompt.prompt(); installPrompt = null; } else toast('请在浏览器菜单选择“安装应用”或“添加到主屏幕”；需要 localhost 或 HTTPS。'); return; }
    if (action === 'print') return window.print();
  } catch (error) { toast(error.message); }
});
window.addEventListener('hashchange', () => { const route = location.hash.slice(1); state.route = [...navItems.map(item => item[0]), 'settings'].includes(route) ? route : 'overview'; state.query = ''; state.filter = ''; document.body.classList.remove('menu-open'); if (state.records.daily_entries) render(); });
window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); installPrompt = event; });
window.addEventListener('online', () => toast('网络已连接；请刷新读取本地服务数据。'));
window.addEventListener('offline', () => toast('当前离线。已保存的数据不会丢失，无法连接服务时不能提交新记录。'));
modal.addEventListener('click', event => { if (event.target === modal) { const rect = modal.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) modal.close(); } });
state.route = [...navItems.map(item => item[0]), 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
boot();
