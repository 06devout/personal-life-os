export const referenceKey = value => String(value || '').normalize('NFKC').trim().toUpperCase();
export function customReference(kind, value, entries = []) {
  const key = referenceKey(value);
  if (!key) return null;
  return entries.find(entry => entry.kind === kind && [entry.code, entry.name, ...(entry.aliases || [])].some(alias => referenceKey(alias) === key)) || null;
}
