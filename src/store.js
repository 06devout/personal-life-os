import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, chmodSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { models, referenceFields } from '../public/models.js';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const localDate = (value = new Date()) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
export function openStore(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const keyPath = join(directory, 'secret.key');
  if (!existsSync(keyPath)) {
    if (existsSync(join(directory, 'life.sqlite'))) throw new Error('数据库存在但 secret.key 丢失。请先从备份恢复密钥，不能生成替代密钥。');
    writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
  }
  const key = readFileSync(keyPath);
  const database = new DatabaseSync(join(directory, 'life.sqlite'));
  chmodSync(join(directory, 'life.sqlite'), 0o600);
  database.exec(readFileSync(new URL('../migrations/001_initial.sql', import.meta.url), 'utf8'));
  database.exec(readFileSync(new URL('../migrations/002_records.sql', import.meta.url), 'utf8'));
  const encrypt = value => {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    return `enc:${Buffer.concat([nonce, cipher.update(String(value)), cipher.final(), cipher.getAuthTag()]).toString('base64')}`;
  };
  const decrypt = value => {
    if (!value?.startsWith('enc:')) return value;
    const bytes = Buffer.from(value.slice(4), 'base64');
    const cipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(-16));
    return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]).toString();
  };
  const assertModel = table => { if (!Object.hasOwn(models, table)) throw new AppError('未知数据类型', 404); };
  const decode = (table, row) => {
    const data = JSON.parse(row.data);
    for (const field of models[table].sensitive || []) data[field] = decrypt(data[field]);
    return { ...data, id: row.id, created_at: row.created_at, updated_at: row.updated_at };
  };
  const list = table => { assertModel(table); return database.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC, id`).all().map(row => decode(table, row)); };
  const get = (table, id) => { assertModel(table); const row = database.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id); if (!row) throw new AppError('记录不存在', 404); return decode(table, row); };
  const validate = (table, input) => {
    assertModel(table);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError('数据格式错误');
    const data = {};
    for (const item of models[table].fields) {
      let value = input[item.key];
      if (item.required && (value === '' || value === undefined || value === null)) throw new AppError(`请填写${item.label}`);
      if (item.type === 'checkbox') { data[item.key] = value === true; continue; }
      if (value === undefined || value === null || value === '') { data[item.key] = item.type === 'number' ? null : ''; continue; }
      if (item.type === 'number') {
        value = Number(value);
        if (!Number.isFinite(value) || value < (item.min ?? -Infinity) || value > (item.max ?? 1e12)) throw new AppError(`${item.label}超出允许范围`);
      } else {
        if (typeof value !== 'string' || value.length > (item.type === 'textarea' ? 100000 : 1000)) throw new AppError(`${item.label}格式错误或内容过长`);
        if (item.type === 'select' && !item.values.includes(value)) throw new AppError(`${item.label}选项无效`);
        if (item.type === 'date' && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value)) throw new AppError(`${item.label}日期无效`);
        if (item.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new AppError('时间格式错误');
        if (item.type === 'reference') get(item.model, value);
      }
      data[item.key] = value;
    }
    if (data.start && data.end <= data.start) throw new AppError('结束时间必须晚于开始时间，跨天活动请分日记录');
    if (data.end_date && data.start_date > data.end_date) throw new AppError('结束日期不能早于开始日期');
    if (data.checkout && data.checkout <= data.date) throw new AppError('退房日期必须晚于入住日期');
    if (data.issued && data.issued > data.expiry) throw new AppError('到期日期不能早于签发日期');
    if (table === 'loyalty_rules') {
      const metrics = { flights: ['miles', 'qualifying', 'spend'], hotel_stays: ['nights', 'points', 'spend'], loyalty_transactions: ['points', 'qualifying', 'spend'] };
      if (!metrics[data.source]?.includes(data.metric)) throw new AppError('该来源不包含所选原始指标');
      if (!data.account_id) throw new AppError('请选择会员账户');
    }
    if (table === 'challenge_progress' && !data.challenge_id) throw new AppError('请选择关联挑战');
    return data;
  };
  const save = (table, input, id = randomUUID(), options = {}) => {
    const data = validate(table, input);
    const previous = database.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
    if (table === 'daily_entries' && list(table).some(row => row.date === data.date && row.id !== id)) throw new AppError('这一天已有日记，请编辑已有记录', 409);
    const ruleSources = ['flights', 'hotel_stays', 'loyalty_transactions'];
    if (ruleSources.includes(table)) {
      const old = previous ? JSON.parse(previous.data) : null;
      const isTravel = table === 'flights' || table === 'hotel_stays';
      if (isTravel) {
        data.accrual_mode ||= old?.accrual_mode || (old || options.restoreRules !== undefined ? '按高级规则' : '直接入账');
        if (data.accrual_mode === '直接入账' && data.account_id) {
          const account = get('loyalty_accounts', data.account_id);
          if (account.type !== (table === 'flights' ? '航空' : '酒店')) throw new AppError('航班请选择航空计划，住宿请选择酒店计划');
        }
      }
      const unchangedBasis = old && old.account_id === data.account_id && old.date === data.date && (old.accrual_mode || '按高级规则') === (data.accrual_mode || '按高级规则');
      const applicable = unchangedBasis ? old._rules : list('loyalty_rules').filter(rule => rule.account_id === data.account_id && rule.source === table && (!rule.effective || rule.effective <= data.date));
      data._rules = data.accrual_mode === '直接入账' ? [] : options.restoreRules ?? applicable ?? [];
    }
    const encoded = { ...data };
    for (const field of models[table].sensitive || []) if (encoded[field]) encoded[field] = encrypt(encoded[field]);
    const references = referenceFields[table];
    const columns = ['id', 'data', 'created_at', 'updated_at', ...references.map(item => item.key)];
    const now = new Date().toISOString();
    const created = options.created_at || previous?.created_at || now;
    const values = [id, JSON.stringify(encoded), created, now, ...references.map(item => data[item.key] || null)];
    database.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${columns.filter(column => column !== 'id' && column !== 'created_at').map(column => `${column}=excluded.${column}`).join(',')}`).run(...values);
    return get(table, id);
  };
  const remove = (table, id) => {
    get(table, id);
    const dependents = [];
    for (const [source, references] of Object.entries(referenceFields)) for (const item of references.filter(reference => reference.model === table)) {
      const count = database.prepare(`SELECT count(*) AS count FROM ${source} WHERE ${item.key} = ?`).get(id).count;
      if (count) dependents.push(`${models[source].label} ${count} 条`);
    }
    if (table === 'challenges' || table === 'loyalty_accounts') {
      const count = ['flights', 'hotel_stays', 'loyalty_transactions'].flatMap(source => list(source)).filter(row => row._rules?.some(rule => rule.challenge_id === id || rule.account_id === id)).length;
      if (count) dependents.push(`历史计算依据 ${count} 条`);
    }
    if (dependents.length) throw new AppError(`无法删除：仍关联${dependents.join('、')}。请先编辑或删除关联记录。`, 409);
    database.exec('BEGIN IMMEDIATE');
    try {
      database.prepare('DELETE FROM attachments WHERE model = ? AND record_id = ?').run(table, id);
      database.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
      database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); throw error; }
  };
  const all = () => Object.fromEntries(Object.keys(models).map(table => [table, list(table)]));
  const exportData = () => ({ format: 'personal-life-os', version: 1, exported_at: new Date().toISOString(), records: all(), attachments: database.prepare('SELECT * FROM attachments').all().map(row => ({ ...row, content: decrypt(row.content) })) });
  const importData = payload => {
    if (payload?.format !== 'personal-life-os' || payload.version !== 1 || !payload.records || !Array.isArray(payload.attachments)) throw new AppError('备份格式或版本不受支持');
    const tables = Object.keys(models);
    if (Object.keys(payload.records).length !== tables.length || tables.some(table => !Array.isArray(payload.records[table]))) throw new AppError('备份数据表不完整');
    const ids = new Set();
    for (const table of tables) for (const row of payload.records[table]) {
      if (!row || typeof row.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(row.id) || ids.has(`${table}/${row.id}`)) throw new AppError('备份包含重复或无效 ID');
      ids.add(`${table}/${row.id}`);
    }
    for (const attachment of payload.attachments) validateAttachment(attachment, ids);
    const snapshot = join(directory, `before-import-${Date.now()}.json.enc`);
    writeFileSync(snapshot, encrypt(JSON.stringify(exportData())), { mode: 0o600 });
    database.exec('BEGIN IMMEDIATE; PRAGMA defer_foreign_keys = ON;');
    try {
      database.exec('DELETE FROM attachments');
      for (const table of tables) for (const reference of referenceFields[table]) database.exec(`UPDATE ${table} SET ${reference.key} = NULL`);
      for (const table of [...tables].reverse()) database.exec(`DELETE FROM ${table}`);
      for (const table of tables) for (const row of payload.records[table]) {
        database.prepare(`INSERT INTO ${table} (id, data, created_at, updated_at) VALUES (?, '{}', ?, ?)`).run(row.id, row.created_at || new Date().toISOString(), new Date().toISOString());
      }
      for (const table of tables) for (const row of payload.records[table]) {
        if (row._rules !== undefined) {
          if (!Array.isArray(row._rules) || row._rules.length > 1000) throw new AppError('历史规则格式无效');
          for (const rule of row._rules) {
            validate('loyalty_rules', rule);
            if (rule.source !== table || rule.account_id !== row.account_id) throw new AppError('历史规则关联无效');
          }
        }
        save(table, row, row.id, { created_at: row.created_at, restoreRules: row._rules });
      }
      for (const attachment of payload.attachments) database.prepare('INSERT INTO attachments VALUES (?, ?, ?, ?, ?, ?, ?)').run(attachment.id, attachment.model, attachment.record_id, attachment.name, attachment.mime, encrypt(attachment.content), attachment.created_at || new Date().toISOString());
      database.exec('COMMIT');
    } catch (error) { database.exec('ROLLBACK'); throw error; }
    return { snapshot: snapshot.split('/').pop() };
  };
  const validateAttachment = (attachment, ids) => {
    if (!attachment || !Object.hasOwn(models, attachment.model) || !ids.has(`${attachment.model}/${attachment.record_id}`) || typeof attachment.id !== 'string' || !/^[a-zA-Z0-9-]{1,80}$/.test(attachment.id) || typeof attachment.name !== 'string' || attachment.name.length > 255 || typeof attachment.mime !== 'string' || attachment.mime.length > 255 || typeof attachment.content !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.content) || Buffer.from(attachment.content, 'base64').length > 5 * 1024 * 1024) throw new AppError('附件格式无效或超过 5MB');
  };
  const addAttachment = input => {
    get(input.model, input.record_id);
    const attachment = { ...input, id: randomUUID() };
    validateAttachment(attachment, new Set([`${input.model}/${input.record_id}`]));
    database.prepare('INSERT INTO attachments VALUES (?, ?, ?, ?, ?, ?, ?)').run(attachment.id, input.model, input.record_id, input.name, input.mime, encrypt(input.content), new Date().toISOString());
    return { id: attachment.id };
  };
  return { database, directory: resolve(directory), list, get, save, remove, all, exportData, importData, addAttachment, decrypt };
}

export { calculate } from '../public/metrics.js';
