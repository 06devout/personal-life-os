import { createServer } from 'node:http';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore, AppError } from './store.js';
import { seed, demo } from './seed.js';

const root = fileURLToPath(new URL('../public/', import.meta.url));
const store = openStore(resolve(process.env.DATA_DIR || './data'));
seed(store);
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '127.0.0.1';
const hash = value => createHash('sha256').update(value).digest('hex');
const passwordHash = password => { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`; };
const verify = (password, saved) => { const [salt, encoded] = saved.split(':'); return timingSafeEqual(Buffer.from(encoded, 'hex'), scryptSync(password, salt, 64)); };
const failures = new Map();
const json = (response, status, value, headers = {}) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); response.end(JSON.stringify(value)); };
const body = async request => {
  let size = 0;
  const chunks = [];
  for await (const chunk of request) { size += chunk.length; if (size > 50 * 1024 * 1024) throw new AppError('请求超过 50MB 上限', 413); chunks.push(chunk); }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid object');
    return value;
  } catch { throw new AppError('无效 JSON 对象'); }
};
export const requestHandler = async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`, `[::1]:${port}`, process.env.PUBLIC_HOST].filter(Boolean));
    if (!allowedHosts.has(request.headers.host)) throw new AppError('主机名未授权。局域网部署请设置 PUBLIC_HOST。', 403);
    if (!['GET', 'HEAD'].includes(request.method)) {
      const origin = request.headers.origin;
      if (origin && (!allowedHosts.has(new URL(origin).host) || !['http:', 'https:'].includes(new URL(origin).protocol))) throw new AppError('拒绝跨站请求', 403);
      if (request.headers['sec-fetch-site'] === 'cross-site') throw new AppError('拒绝跨站请求', 403);
      if (!request.headers['content-type']?.startsWith('application/json')) throw new AppError('必须使用 application/json', 415);
    }
    const path = url.pathname.split('/').filter(Boolean);
    const configured = Boolean(store.database.prepare('SELECT id FROM users LIMIT 1').get());
    const token = /(?:^|; )life_session=([^;]*)/.exec(request.headers.cookie || '')?.[1];
    const session = token ? store.database.prepare('SELECT * FROM sessions WHERE token_hash = ? AND expires > ?').get(hash(token), Date.now()) : null;
    if (url.pathname === '/api/auth' && request.method === 'GET') return json(response, 200, { configured, authenticated: Boolean(session) });
    if (url.pathname === '/api/auth' && request.method === 'POST') {
      const remote = request.socket.remoteAddress;
      const attempt = failures.get(remote);
      if (attempt?.count >= 8 && attempt.until > Date.now()) throw new AppError('尝试次数过多，请 15 分钟后重试', 429);
      const input = await body(request);
      if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 256) throw new AppError('密码需要 12–256 个字符');
      const user = store.database.prepare('SELECT * FROM users LIMIT 1').get();
      if (user && !verify(input.password, user.password_hash)) {
        failures.set(remote, { count: attempt?.until > Date.now() ? attempt.count + 1 : 1, until: Date.now() + 900000 });
        throw new AppError('密码不正确', 401);
      }
      if (!user) store.database.prepare('INSERT INTO users VALUES (?, ?, ?)').run('owner', passwordHash(input.password), new Date().toISOString());
      failures.delete(remote);
      const fresh = randomBytes(32).toString('hex');
      store.database.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
      store.database.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(hash(fresh), 'owner', Date.now() + 7 * 86400000);
      return json(response, 200, { ok: true }, { 'Set-Cookie': `life_session=${fresh}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.SECURE_COOKIE === '1' ? '; Secure' : ''}` });
    }
    if (path[0] === 'api') {
      if (!session) throw new AppError('请先登录', 401);
      if (url.pathname === '/api/logout' && request.method === 'POST') {
        store.database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
        return json(response, 200, { ok: true }, { 'Set-Cookie': 'life_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
      }
      if (url.pathname === '/api/password' && request.method === 'POST') {
        const input = await body(request);
        const user = store.database.prepare('SELECT * FROM users LIMIT 1').get();
        if (typeof input.current !== 'string' || input.current.length > 256 || !verify(input.current, user.password_hash)) throw new AppError('原密码错误', 403);
        if (typeof input.password !== 'string' || input.password.length < 12 || input.password.length > 256) throw new AppError('新密码需要 12–256 个字符');
        store.database.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash(input.password), 'owner');
        store.database.prepare('DELETE FROM sessions WHERE token_hash != ?').run(hash(token));
        return json(response, 200, { ok: true });
      }
      if (url.pathname === '/api/state' && request.method === 'GET') return json(response, 200, { records: store.all(), attachments: store.database.prepare('SELECT id, model, record_id, name, mime, created_at FROM attachments').all(), archives: store.listArchives(), archiveSuggestion: store.archiveSuggestion(), directory: store.listDirectory() });
      if (path[1] === 'directory') {
        if (request.method === 'GET') return json(response, 200, store.listDirectory());
        if (request.method === 'POST' && !path[2]) return json(response, 201, store.saveReference(await body(request)));
        if (request.method === 'PUT' && path[2] && path[3]) return json(response, 200, store.saveReference({ ...await body(request), kind: path[2], code: path[3] }, true));
        if (request.method === 'DELETE' && path[2] && path[3]) { store.removeReference(path[2], path[3]); return json(response, 200, { ok: true }); }
        throw new AppError('资料库接口不支持该操作', 405);
      }
      if (path[1] === 'archives') {
        if (request.method === 'GET') return json(response, 200, path[2] ? store.getArchive(path[2]) : store.listArchives());
        if (request.method === 'POST' && !path[2]) return json(response, 201, store.createArchive(await body(request)));
        if (request.method === 'DELETE' && path[2]) { store.removeArchive(path[2]); return json(response, 200, { ok: true }); }
        throw new AppError('存档不可编辑；请创建新版本', 405);
      }
      if (url.pathname === '/api/export' && request.method === 'GET') return json(response, 200, store.exportData(), { 'Content-Disposition': 'attachment; filename="life-os-backup.json"' });
      if (url.pathname === '/api/import' && request.method === 'POST') return json(response, 200, store.importData(await body(request)));
      if (url.pathname === '/api/demo' && request.method === 'POST') { demo(store); return json(response, 200, { ok: true }); }
      if (path[1] === 'records') {
        const [, , model, id] = path;
        if (request.method === 'GET') return json(response, 200, id ? store.get(model, id) : store.list(model));
        if (request.method === 'POST' && !id) return json(response, 201, store.save(model, await body(request)));
        if (request.method === 'PUT' && id) { store.get(model, id); return json(response, 200, store.save(model, await body(request), id)); }
        if (request.method === 'DELETE' && id) { store.remove(model, id); return json(response, 200, { ok: true }); }
      }
      if (path[1] === 'attachments') {
        if (request.method === 'POST' && !path[2]) return json(response, 201, store.addAttachment(await body(request)));
        const attachment = store.database.prepare('SELECT * FROM attachments WHERE id = ?').get(path[2] || '');
        if (!attachment) throw new AppError('附件不存在', 404);
        if (request.method === 'DELETE') { store.database.prepare('DELETE FROM attachments WHERE id = ?').run(attachment.id); return json(response, 200, { ok: true }); }
        if (request.method === 'GET') {
          const bytes = Buffer.from(store.decrypt(attachment.content), 'base64');
          const imageType = bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' ? 'image/png' : bytes.subarray(0, 3).toString('hex') === 'ffd8ff' ? 'image/jpeg' : ['GIF87a', 'GIF89a'].includes(bytes.subarray(0, 6).toString()) ? 'image/gif' : bytes.subarray(0, 4).toString() === 'RIFF' && bytes.subarray(8, 12).toString() === 'WEBP' ? 'image/webp' : null;
          const preview = url.searchParams.get('preview') === '1';
          if (preview && !imageType) throw new AppError('仅支持 PNG、JPEG、GIF、WebP 照片预览', 415);
          response.writeHead(200, { 'Content-Type': preview ? imageType : 'application/octet-stream', 'Content-Disposition': `${preview ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.name)}`, 'Cache-Control': 'no-store' });
          return response.end(bytes);
        }
      }
      throw new AppError('接口不存在', 404);
    }
    if (!['GET', 'HEAD'].includes(request.method)) throw new AppError('方法不支持', 405);
    const file = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!file.startsWith(root) || !statSync(file, { throwIfNoEntry: false })?.isFile()) throw new AppError('文件不存在', 404);
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png' };
    response.writeHead(200, { 'Content-Type': `${types[extname(file)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-cache', ...(url.pathname === '/sw.js' ? { 'Service-Worker-Allowed': '/' } : {}) });
    response.end(request.method === 'HEAD' ? undefined : readFileSync(file));
  } catch (error) {
    if (!error.status) console.error(error);
    json(response, error.status || 500, { error: error.status ? error.message : '操作失败，数据未提交。请查看服务日志。' });
  }
};
export const closeStore = () => store.database.close();
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const server = createServer(requestHandler);
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用，请设置 PORT 使用其他端口。` : `无法监听 ${host}:${port}（${error.code}）。请检查系统或沙箱网络权限。`);
    store.database.close(); process.exitCode = 1;
  });
  server.listen(port, host, () => console.log(`Personal Life OS → http://${host}:${port}\n数据目录：${store.directory}\n首次打开后设置本地访问密码。`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.database.close(); process.exit(0); }));
}
