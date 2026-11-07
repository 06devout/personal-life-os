import { DatabaseSync, backup } from 'node:sqlite';
import { readFileSync, mkdirSync, copyFileSync, chmodSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { openStore } from '../src/store.js';
import { prepareFlightImport, importPreparedFlights } from '../src/flight-import.js';

const input = process.argv[2];
if (!input) throw new Error('用法：node scripts/import-flight-log.js <私有输入JSON> [数据目录]');
const directory = resolve(process.argv[3] || process.env.DATA_DIR || './data');
const payload = JSON.parse(readFileSync(resolve(input), 'utf8'));
const prepared = prepareFlightImport(payload);
const backupDirectory = join(directory, 'backups', 'before-flight-import-' + new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
const original = new DatabaseSync(join(directory, 'life.sqlite'), { readOnly: true });
try { await backup(original, join(backupDirectory, 'life.sqlite')); } finally { original.close(); }
chmodSync(join(backupDirectory, 'life.sqlite'), 0o600);
copyFileSync(join(directory, 'secret.key'), join(backupDirectory, 'secret.key'));
chmodSync(join(backupDirectory, 'secret.key'), 0o600);
const store = openStore(directory);
try {
  const before = store.list('flights').length;
  const result = importPreparedFlights(store, prepared);
  const imported = prepared.map(row => store.get('flights', row.id));
  const summary = {
    ...result, before, after: store.list('flights').length,
    dated: imported.filter(row => row.date).length, yearOnly: imported.filter(row => !row.date).length,
    kilometers: payload.rows.reduce((total, row) => total + (row[8] ?? 0), 0),
    backup: backupDirectory,
    byYear: Object.fromEntries([...new Set(imported.map(row => row.flight_year))].sort().map(year => [year, imported.filter(row => row.flight_year === year).length]))
  };
  writeFileSync(join(backupDirectory, 'import-result.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(summary, null, 2));
} finally { store.database.close(); }
