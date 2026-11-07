import { customReference } from './reference-data.js';

const airports = [
  ['PEK', ['北京首都', '北京首都国际机场', '首都机场']],
  ['PKX', ['北京大兴', '北京大兴国际机场']],
  ['HAK', ['海口美兰', '海口美兰国际机场']],
  ['ZHY', ['中卫沙坡头', '中卫沙坡头机场']],
  ['KWL', ['桂林两江', '桂林两江国际机场']],
  ['HKG', ['香港赤鱲角', '香港国际机场']],
  ['TPE', ['台北桃园', '台湾桃园国际机场']],
  ['PVG', ['上海浦东', '上海浦东国际机场']],
  ['SHA', ['上海虹桥', '上海虹桥国际机场']],
  ['AMS', ['阿姆斯特丹史基浦', '阿姆斯特丹史基浦机场']],
  ['SYD', ['悉尼金斯福德史密斯', '悉尼机场']],
  ['BNE', ['布里斯班', '布里斯班机场']],
  ['OOL', ['黄金海岸', '黄金海岸机场']],
  ['MEL', ['墨尔本塔拉梅林', '墨尔本机场']],
  ['OHE', ['漠河古莲', '漠河古莲机场']],
  ['HRB', ['哈尔滨太平', '哈尔滨太平国际机场']],
  ['TSN', ['天津滨海', '天津滨海国际机场']],
  ['KIX', ['大阪关西', '关西国际机场']],
  ['KWE', ['贵阳龙洞堡', '贵阳龙洞堡国际机场']],
  ['HND', ['东京羽田', '羽田机场']],
  ['FOC', ['福州长乐', '福州长乐国际机场']],
  ['FUK', ['福冈', '福冈机场']],
  ['DLC', ['大连周水子', '大连周水子国际机场']],
  ['HGH', ['杭州萧山', '杭州萧山国际机场']],
  ['MFM', ['澳门国际', '澳门国际机场']],
  ['SZX', ['深圳宝安', '深圳宝安国际机场']],
  ['LXA', ['拉萨贡嘎', '拉萨贡嘎国际机场']],
  ['TFU', ['成都天府', '成都天府国际机场']],
  ['CTU', ['成都双流', '成都双流国际机场']],
  ['URC', ['乌鲁木齐天山', '乌鲁木齐地窝堡', '乌鲁木齐天山国际机场']],
  ['ZUH', ['珠海金湾', '珠海金湾机场']],
  ['NKG', ['南京禄口', '南京禄口国际机场']],
  ['SYX', ['三亚凤凰', '三亚凤凰国际机场']],
  ['JHG', ['西双版纳嘎洒', '西双版纳嘎洒国际机场']],
  ['DXB', ['迪拜国际', '迪拜国际机场']],
  ['CPH', ['哥本哈根凯斯楚普', '哥本哈根机场']],
  ['OSL', ['奥斯陆', '奥斯陆机场']],
  ['BGO', ['卑尔根弗雷斯兰德', '卑尔根机场']],
  ['TOS', ['特罗姆瑟朗内斯', '特罗姆瑟机场']],
  ['HEL', ['赫尔辛基万塔', '赫尔辛基机场']],
  ['TLL', ['塔林国际', '塔林机场']],
  ['VNO', ['维尔纽斯国际', '维尔纽斯机场']],
  ['ARN', ['斯德哥尔摩阿兰达', '斯德哥尔摩阿兰达机场']],
  ['WHA', ['芜湖宣州', '芜湖宣州机场']],
  ['DOH', ['多哈哈马德', '哈马德国际机场']],
  ['MAD', ['马德里巴拉哈斯', '马德里巴拉哈斯机场']],
  ['OPO', ['波尔图弗朗西斯科·萨·卡内罗', '波尔图机场']],
  ['FNC', ['丰沙尔克里斯蒂亚诺·罗纳尔多', '丰沙尔机场', '马德拉机场']],
  ['LIS', ['里斯本温贝托·德尔加多', '里斯本机场']],
  ['BCN', ['巴塞罗那埃尔普拉特', '巴塞罗那机场']],
  ['NCE', ['尼斯蔚蓝海岸', '尼斯机场']],
  ['AGP', ['马拉加太阳海岸', '马拉加机场']]
];
const aliases = new Map(airports.flatMap(([code, names]) => names.map(name => [name, code])));
const fullNames = {
  PEK: '北京首都国际机场', PKX: '北京大兴国际机场', HAK: '海口美兰国际机场',
  ZHY: '中卫沙坡头机场', KWL: '桂林两江国际机场', HKG: '香港国际机场', TPE: '台湾桃园国际机场',
  PVG: '上海浦东国际机场', SHA: '上海虹桥国际机场', AMS: '阿姆斯特丹史基浦机场',
  SYD: '悉尼金斯福德·史密斯机场', BNE: '布里斯班机场', OOL: '黄金海岸机场', MEL: '墨尔本塔拉梅林机场',
  OHE: '漠河古莲机场', HRB: '哈尔滨太平国际机场', TSN: '天津滨海国际机场', KIX: '关西国际机场',
  KWE: '贵阳龙洞堡国际机场', HND: '东京国际机场（羽田机场）', FOC: '福州长乐国际机场',
  FUK: '福冈机场', DLC: '大连周水子国际机场', HGH: '杭州萧山国际机场', MFM: '澳门国际机场',
  SZX: '深圳宝安国际机场', LXA: '拉萨贡嘎国际机场', TFU: '成都天府国际机场', CTU: '成都双流国际机场',
  URC: '乌鲁木齐天山国际机场', ZUH: '珠海金湾机场', NKG: '南京禄口国际机场', SYX: '三亚凤凰国际机场',
  JHG: '西双版纳嘎洒国际机场', DXB: '迪拜国际机场', CPH: '哥本哈根凯斯楚普机场',
  OSL: '奥斯陆加勒穆恩机场', BGO: '卑尔根弗莱斯兰机场', TOS: '特罗姆瑟朗内斯机场',
  HEL: '赫尔辛基万塔机场', TLL: '塔林伦纳特·梅里机场', VNO: '维尔纽斯国际机场',
  ARN: '斯德哥尔摩阿兰达机场', WHA: '芜湖宣州机场', DOH: '哈马德国际机场',
  MAD: '阿道弗·苏亚雷斯马德里巴拉哈斯机场', OPO: '波尔图弗朗西斯科·萨·卡内罗机场',
  FNC: '克里斯蒂亚诺·罗纳尔多马德拉国际机场', LIS: '里斯本温贝托·德尔加多机场',
  BCN: '巴塞罗那埃尔普拉特机场', NCE: '尼斯蔚蓝海岸机场', AGP: '马拉加太阳海岸机场'
};
for (const [code, name] of Object.entries(fullNames)) aliases.set(name, code);
export function airportFullName(value, directory = []) {
  const code = airportCode(value, directory);
  const custom = customReference('airport', code, directory);
  if (custom) return custom.name;
  return Object.hasOwn(fullNames, code) ? fullNames[code] : /^[A-Z]{3}$/.test(code) ? '机场全名暂未收录' : code;
}
export function airportCode(value, directory = []) {
  const original = String(value || '').trim();
  const withoutTerminal = original.replace(/\s*(?:T\d+|国际线|D)$/i, '').trim();
  const custom = customReference('airport', original, directory) || customReference('airport', withoutTerminal, directory);
  if (custom) return custom.code;
  if (/^[a-z]{3}$/i.test(original)) return original.toUpperCase();
  return aliases.get(original) || aliases.get(withoutTerminal) || original;
}
export function airportKnown(value, directory = []) {
  const code = airportCode(value, directory);
  return Boolean(customReference('airport', code, directory)) || Object.hasOwn(fullNames, code);
}
export function normalizeFlightAirports(input, directory = []) {
  const data = { ...input };
  const originals = [];
  for (const [key, label] of [['origin', '原始出发机场'], ['destination', '原始到达机场'], ['via', '原始经停机场']]) {
    if (data[key] !== undefined && data[key] !== null && typeof data[key] !== 'string') continue;
    const value = String(data[key] || '').trim();
    if (!value) continue;
    const normalized = key === 'via' ? value.split(/[,，;；/→]+/).map(item => airportCode(item, directory)).join(' / ') : airportCode(value, directory);
    if (normalized !== value) originals.push(`${label}：${value}`);
    data[key] = normalized;
  }
  if (originals.length) data.notes = [data.notes || '', ...originals].filter(Boolean).join('\n');
  return data;
}
