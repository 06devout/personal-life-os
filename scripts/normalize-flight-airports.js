import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync, copyFileSync, chmodSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { openStore } from '../src/store.js';
import { normalizeFlightAirports } from '../public/airports.js';

const directory = resolve(process.argv[2] || process.env.DATA_DIR || './data');
const backupDirectory = join(directory, 'backups', 'before-airport-codes-' + new Date().toISOString().replace(/[:.]/g, '-'));
mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
const original = new DatabaseSync(join(directory, 'life.sqlite'), { readOnly: true });
try { await backup(original, join(backupDirectory, 'life.sqlite')); } finally { original.close(); }
chmodSync(join(backupDirectory, 'life.sqlite'), 0o600);
copyFileSync(join(directory, 'secret.key'), join(backupDirectory, 'secret.key'));
chmodSync(join(backupDirectory, 'secret.key'), 0o600);
const store = openStore(directory);
try {
  const records = store.list('flights');
  let changed = 0;
  store.database.exec('BEGIN IMMEDIATE');
  try {
    for (const record of records) {
      const normalized = normalizeFlightAirports(record);
      if (['origin', 'destination', 'via'].some(key => normalized[key] !== record[key])) {
        store.save('flights', normalized, record.id);
        changed++;
      }
    }
    store.database.exec('COMMIT');
  } catch (error) { store.database.exec('ROLLBACK'); throw error; }
  const unresolved = store.list('flights').filter(row => !/^[A-Z]{3}$/.test(row.origin) || !/^[A-Z]{3}$/.test(row.destination) || row.via && !/^[A-Z]{3}(?: \/ [A-Z]{3})*$/.test(row.via));
  const summary = { flights: records.length, changed, unresolved: unresolved.length, distanceStorageUnchanged: true, backup: backupDirectory };
  writeFileSync(join(backupDirectory, 'normalization-result.json'), JSON.stringify(summary, null, 2), { mode: 0o600 });
  console.log(JSON.stringify(summary, null, 2));
} finally { store.database.close(); }
