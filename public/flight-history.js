import { airportCode, airportFullName, airportKnown } from './airports.js';
import { localDate } from './metrics.js';
import { customReference, referenceKey } from './reference-data.js';

const airlineNames = [
  ['CA', '中国国际航空', ['国航', '中国国际航空公司']],
  ['CZ', '中国南方航空', ['南航', '中国南方航空公司']],
  ['MU', '中国东方航空', ['东航', '中国东方航空公司']],
  ['HU', '海南航空', ['海航']], ['3U', '四川航空', ['川航']],
  ['GS', '天津航空', []], ['SC', '山东航空', ['山航']],
  ['GJ', '浙江长龙航空', ['长龙航空']], ['GX', '北部湾航空', []],
  ['8L', '祥鹏航空', []], ['KN', '中国联合航空', ['中联航']],
  ['NX', '澳门航空', []], ['KA', '港龙航空', ['国泰港龙航空']],
  ['VA', '维珍澳大利亚航空', ['Virgin Australia']],
  ['EK', '阿联酋航空', ['Emirates']], ['QR', '卡塔尔航空', ['Qatar Airways']],
  ['AY', '芬兰航空', ['Finnair']], ['SK', '北欧航空', ['SAS']],
  ['WF', '威德罗航空', ['Widerøe', 'Wideroe']],
  ['U2', '易捷航空', ['easyJet']], ['VY', '伏林航空', ['Vueling']],
  ['D8', '挪威航空瑞典', ['Norwegian Air Sweden', 'Norwegian Air Sweden AOC']]
];
const icaoCodes = {
  CA: 'CCA', CZ: 'CSN', MU: 'CES', HU: 'CHH', '3U': 'CSC', GS: 'GCR', SC: 'CDG',
  GJ: 'CDC', GX: 'CBG', '8L': 'LKE', KN: 'CUA', NX: 'AMU', KA: 'HDA', VA: 'VOZ',
  EK: 'UAE', QR: 'QTR', AY: 'FIN', SK: 'SAS', WF: 'WIF', U2: 'EZY', VY: 'VLG', D8: 'NSZ'
};
const airlineAliases = new Map(airlineNames.flatMap(([code, name, aliases]) => [code, name, icaoCodes[code], ...aliases].map(alias => [alias.toUpperCase(), { key: code, label: code, fullName: name, known: true }])));
export function airlineIdentity(value, directory = []) {
  const name = String(value || '').trim();
  const custom = customReference('airline', name, directory);
  if (custom) return { key: custom.code, label: custom.code, fullName: custom.name, known: true };
  const builtIn = airlineAliases.get(name.toUpperCase());
  if (builtIn) {
    const override = customReference('airline', builtIn.key, directory);
    return override ? { key: override.code, label: override.code, fullName: override.name, known: true } : builtIn;
  }
  return { key: name.toUpperCase(), label: /^[a-z0-9]{2}$/i.test(name) ? name.toUpperCase() : '待补二字码', fullName: /^[a-z0-9]{2,3}$/i.test(name) ? `航司名称暂未收录（原代码：${name.toUpperCase()}）` : name, known: false };
}
export function findUnknownFlightReferences(flights, directory = []) {
  const unknown = new Map();
  const add = (kind, value) => {
    const original = String(value || '').trim();
    if (!original || (kind === 'airport' ? airportKnown(original, directory) : airlineIdentity(original, directory).known)) return;
    const key = kind + ':' + referenceKey(original);
    const previous = unknown.get(key);
    unknown.set(key, { kind, value: original, count: (previous?.count || 0) + 1 });
  };
  for (const flight of flights) {
    add('airport', flight.origin); add('airport', flight.destination);
    for (const stopover of String(flight.via || '').split(/[,，;；/→]+/)) add('airport', stopover);
    add('airline', flight.airline);
  }
  return [...unknown.values()];
}
function importedSequence(row) {
  const explicit = Number(row.sequence);
  if (Number.isInteger(explicit) && explicit > 0) return explicit;
  const match = /(?:^|\n|；)\s*原表序号：\s*(\d+)/.exec(row.notes || '');
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}
function nextDate(date, days) {
  return new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
}
export function buildFlightHistory(flights, options = {}) {
  const directory = options.directory || [];
  const asOf = options.asOf || localDate();
  const currentYear = Number(asOf.slice(0, 4));
  const includePlanned = options.includePlanned === true;
  const includeStopovers = options.includeStopovers === true;
  const ordered = flights.map((flight, index) => ({ flight, index, year: Number(flight.date?.slice(0, 4) || flight.flight_year) }))
    .filter(item => Number.isInteger(item.year) && item.year >= 1000)
    .sort((first, second) => {
      const year = first.year - second.year;
      if (year) return year;
      const precision = Number(Boolean(first.flight.date)) - Number(Boolean(second.flight.date));
      if (precision) return precision;
      const date = (first.flight.date || '').localeCompare(second.flight.date || '');
      if (date) return date;
      const time = (first.flight.departure_time || '99:99').localeCompare(second.flight.departure_time || '99:99');
      return time || importedSequence(first.flight) - importedSequence(second.flight) || (first.flight.created_at || '').localeCompare(second.flight.created_at || '') || first.index - second.index;
    });
  const airports = [];
  const airlines = [];
  let excludedFuture = 0;
  let countedFlights = 0;
  let approximateFlights = 0;
  for (const { flight, year } of ordered) {
    const planned = flight.date ? flight.date > asOf : year > currentYear;
    if (planned && !includePlanned) { excludedFuture++; continue; }
    countedFlights++;
    if (!flight.date) approximateFlights++;
    const basis = { flightId: flight.id, flightNumber: flight.number || '未填航班号', sourceDate: flight.date || String(year), approximate: !flight.date, planned };
    if (flight.airline?.trim()) airlines.push({ ...basis, ...airlineIdentity(flight.airline, directory), date: basis.sourceDate });
    const origin = airportCode(flight.origin, directory);
    if (origin) airports.push({ ...basis, key: origin, label: origin, fullName: airportFullName(origin, directory), date: basis.sourceDate, role: '出发' });
    const destination = airportCode(flight.destination, directory);
    const stopovers = includeStopovers ? [...new Set(String(flight.via || '').split(/[,，;；/→]+/).map(value => airportCode(value, directory)).filter(code => code && code !== destination))] : [];
    for (const code of stopovers) airports.push({ ...basis, key: code, label: code, fullName: airportFullName(code, directory), date: basis.sourceDate, role: '经停' });
    if (destination) {
      const arrivalDate = flight.date ? nextDate(flight.date, Number(flight.arrival_day_offset || 0)) : String(year);
      const arrivalPlanned = planned || Boolean(flight.date && arrivalDate > asOf);
      if (includePlanned || !arrivalPlanned) airports.push({ ...basis, key: destination, label: destination, fullName: airportFullName(destination, directory), date: arrivalDate, planned: arrivalPlanned, role: '到达' });
    }
  }
  const summarize = events => {
    const counts = new Map();
    for (const event of events) counts.set(event.key, (counts.get(event.key) || 0) + 1);
    const seen = new Set();
    return events.filter(event => {
      if (options.mode === 'all') return true;
      if (seen.has(event.key)) return false;
      seen.add(event.key); return true;
    }).map(event => ({ ...event, count: counts.get(event.key) }));
  };
  return { airports: summarize(airports), airlines: summarize(airlines), airportCount: new Set(airports.map(event => event.key)).size, airlineCount: new Set(airlines.map(event => event.key)).size, countedFlights, excludedFuture, approximateFlights };
}
