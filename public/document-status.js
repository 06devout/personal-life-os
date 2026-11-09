export function isPassport(document) {
  return /护照|passport/i.test(document?.type || document?.name || '');
}
export function visaDateStatus(visa, today) {
  const days = Math.round((Date.parse(visa.expiry + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000);
  if (days < 0) return { label: '已过期', tone: 'danger', days };
  if (visa.valid_from && visa.valid_from > today) return { label: '未生效', tone: '', days };
  return { label: days <= 30 ? '30 天内到期' : days <= 90 ? '90 天内到期' : days <= 180 ? '180 天内到期' : '有效', tone: days <= 30 ? 'danger' : days <= 180 ? 'amber' : '', days };
}
