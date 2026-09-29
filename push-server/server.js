// ============================================================
// Traindía · servidor de avisos (Web Push) para el fin del descanso
// ============================================================
// Qué hace: la app le pide «avisa a este móvil dentro de N segundos»; el servidor
// espera y, a su hora, manda una notificación push (cifrada) al servicio de push
// del navegador (Google, Mozilla, Apple, Microsoft), que la entrega al móvil
// aunque esté bloqueado.
//
// Qué guarda: SOLO en memoria y SOLO mientras dura cada descanso: un id aleatorio,
// la suscripción push (dirección del buzón + sus claves) y la hora de aviso. Se
// borra al avisar o al cancelar. Sin base de datos, sin ficheros, sin IPs en logs.
//
// API (JSON):
//   GET    /health          → { ok, pendientes }
//   GET    /vapid           → { publicKey }            clave pública para suscribirse
//   POST   /rest            { subscription, inMs }     → { id }   programa un aviso
//   PUT    /rest/:id        { inMs }                   → { ok }   lo reprograma (+15 s)
//   DELETE /rest/:id                                   → { ok }   lo cancela
//
// Compartir progreso con un amigo (enlace): la app sube un paquete YA CIFRADO en
// el móvil (AES-GCM; la llave va en el enlace, en la parte «#» que nunca llega
// aquí), así que el servidor guarda algo que no puede leer. Solo en memoria, se
// borra al abrirlo o a las SHARE_TTL_H horas (48 por defecto).
//   POST   /share           { data }                   → { id, del, exp }
//   GET    /share/:id                                  → { data }  (y se borra)
//   DELETE /share/:id?del=…                            → { ok }   lo retira quien lo subió

'use strict';
const http = require('node:http');
const crypto = require('node:crypto');
const webpush = require('web-push');

const env = (k, d) => (process.env[k] ?? d);
const PORT = +env('PORT', 8787);
const HOST = env('HOST', '0.0.0.0'); // dentro del contenedor; fuera se publica solo en 127.0.0.1
const ORIGINS = env('ALLOWED_ORIGINS', 'https://traindia.raulmarquez.dev').split(',').map(s => s.trim()).filter(Boolean);
const MAX_DELAY_MS = +env('MAX_DELAY_S', 900) * 1000;   // un descanso de más de 15 min no tiene sentido
const RATE_PER_MIN = +env('RATE_LIMIT_PER_MIN', 60);     // por IP; el uso normal son 1-2/min
const MAX_PENDING = +env('MAX_PENDING', 500);            // tope de avisos a la vez (memoria acotada)
const SHARE_MAX_BYTES = +env('SHARE_MAX_KB', 2048) * 1024;      // un paquete (ya comprimido y cifrado)
const SHARE_TOTAL_BYTES = +env('SHARE_TOTAL_MB', 40) * 1048576; // todos a la vez (el contenedor tiene 128 MB)
const SHARE_TTL_MS = +env('SHARE_TTL_H', 48) * 3600000;
const SHARE_MAX = +env('SHARE_MAX', 300);
const VAPID_PUBLIC = env('VAPID_PUBLIC_KEY', '');
const VAPID_PRIVATE = env('VAPID_PRIVATE_KEY', '');
const VAPID_SUBJECT = env('VAPID_SUBJECT', 'https://traindia.raulmarquez.dev');

if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error('Faltan VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY en el .env (genera un par con: npx web-push generate-vapid-keys)');
  process.exit(1);
}
webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

// Solo se avisa a servicios de push reales: así nadie puede usar este servidor
// para mandar peticiones a cualquier URL.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/,       // Chrome / Android / Edge en Android
  /^updates\.push\.services\.mozilla\.com$/, /\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/,                                    // Safari / iOS
  /\.notify\.windows\.com$/,                                    // Edge en Windows
];
function validSubscription(s) {
  if (!s || typeof s !== 'object' || typeof s.endpoint !== 'string' || s.endpoint.length > 1000) return false;
  let u; try { u = new URL(s.endpoint); } catch (e) { return false; }
  if (u.protocol !== 'https:' || !PUSH_HOSTS.some(r => r.test(u.hostname))) return false;
  const k = s.keys || {};
  return typeof k.p256dh === 'string' && typeof k.auth === 'string' && k.p256dh.length < 200 && k.auth.length < 100;
}
const validDelay = (ms) => Number.isFinite(ms) && ms >= 0 && ms <= MAX_DELAY_MS;

// ---- Avisos pendientes (en memoria) ----
const pending = new Map(); // id -> { subscription, timer, at }
let enviados = 0, fallidos = 0;

function schedule(id, delay) {
  const p = pending.get(id);
  if (!p) return;
  clearTimeout(p.timer);
  p.at = Date.now() + delay;
  p.timer = setTimeout(() => fire(id), delay);
}
async function fire(id) {
  const p = pending.get(id);
  if (!p) return;
  pending.delete(id); // se borra ANTES de enviar: pase lo que pase, no queda nada guardado
  const payload = JSON.stringify({ type: 'rest-end', title: '⏱ Descanso terminado', body: 'A por la siguiente serie.', tag: 'traindia-rest', ts: Date.now() });
  try {
    // TTL corto: un aviso de descanso que llega un minuto tarde ya no sirve.
    // topic: si hubiera uno sin entregar, lo sustituye en vez de acumularse.
    await webpush.sendNotification(p.subscription, payload, { TTL: 60, urgency: 'high', topic: 'rest' });
    enviados++;
  } catch (e) {
    fallidos++;
    console.warn(`aviso no entregado (${e.statusCode || e.code || 'error'})`); // sin datos del destinatario
  }
}

// ---- Paquetes compartidos (cifrados en el móvil; aquí solo se guardan un rato) ----
const shares = new Map(); // id -> { data, del, exp, size }
let sharesBytes = 0, compartidos = 0, abiertos = 0;
function dropShare(id) { const x = shares.get(id); if (x) { sharesBytes -= x.size; shares.delete(id); } }
setInterval(() => { const now = Date.now(); for (const [id, x] of shares) if (x.exp <= now) dropShare(id); }, 10 * 60000).unref();
const B64URL = /^[A-Za-z0-9_-]+$/;

// ---- Límite de peticiones por IP (ventana de 1 minuto) ----
const hits = new Map(); // ip -> { n, since }
function rateLimited(ip) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || now - h.since > 60000) { hits.set(ip, { n: 1, since: now }); return false; }
  h.n++;
  return h.n > RATE_PER_MIN;
}
setInterval(() => { const now = Date.now(); for (const [ip, h] of hits) if (now - h.since > 60000) hits.delete(ip); }, 60000).unref();

// ---- HTTP ----
function send(res, status, body, origin) {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (origin) Object.assign(headers, { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' });
  res.writeHead(status, headers);
  res.end(body === undefined ? '' : JSON.stringify(body));
}
function readJson(req, max = 8192) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > max) { reject(Object.assign(new Error('grande'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch (e) { reject(Object.assign(new Error('json'), { status: 400 })); } });
    req.on('error', reject);
  });
}

const DEBUG = env('DEBUG', '') === '1';
const server = http.createServer(async (req, res) => {
  if (DEBUG) res.on('finish', () => console.log(`${req.method} ${req.url.replace(/[0-9a-f-]{36}/, (x) => x.slice(0, 8))} → ${res.statusCode} · pendientes ${pending.size}`));
  const origin = req.headers.origin;
  const allowed = origin && ORIGINS.includes(origin) ? origin : null;
  const url = new URL(req.url, 'http://x');
  const path = url.pathname.replace(/\/+$/, '') || '/';

  // Preflight CORS
  if (req.method === 'OPTIONS') {
    if (!allowed) return send(res, 403, { error: 'origen no permitido' });
    res.writeHead(204, {
      'Access-Control-Allow-Origin': allowed, 'Vary': 'Origin',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    });
    return res.end();
  }

  if (req.method === 'GET' && path === '/health') return send(res, 200, { ok: true, pendientes: pending.size, enviados, fallidos, compartidos, abiertos, paquetes: shares.size }, allowed);
  if (req.method === 'GET' && path === '/vapid') return send(res, 200, { publicKey: VAPID_PUBLIC }, allowed);

  // Lo que programa avisos: solo desde la app (su origen) y con límite por IP.
  // Detrás del túnel todo llega desde localhost: la IP real va en CF-Connecting-IP.
  if (!allowed) return send(res, 403, { error: 'origen no permitido' });
  const ip = String(req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '');
  if (rateLimited(ip)) return send(res, 429, { error: 'demasiadas peticiones' }, allowed);

  try {
    if (req.method === 'POST' && path === '/rest') {
      const b = await readJson(req);
      if (!validSubscription(b.subscription)) return send(res, 400, { error: 'suscripción no válida' }, allowed);
      if (!validDelay(b.inMs)) return send(res, 400, { error: 'tiempo no válido' }, allowed);
      if (pending.size >= MAX_PENDING) return send(res, 503, { error: 'ocupado' }, allowed);
      const id = crypto.randomUUID();
      pending.set(id, { subscription: { endpoint: b.subscription.endpoint, keys: { p256dh: b.subscription.keys.p256dh, auth: b.subscription.keys.auth } }, timer: null, at: 0 });
      schedule(id, b.inMs);
      return send(res, 201, { id }, allowed);
    }
    if (req.method === 'POST' && path === '/share') {
      const b = await readJson(req, Math.ceil(SHARE_MAX_BYTES * 1.4) + 1024);
      const data = typeof b.data === 'string' ? b.data : '';
      if (!data || data.length > Math.ceil(SHARE_MAX_BYTES * 1.37) || !B64URL.test(data)) return send(res, 400, { error: 'paquete no válido' }, allowed);
      if (shares.size >= SHARE_MAX || sharesBytes + data.length > SHARE_TOTAL_BYTES) return send(res, 503, { error: 'ocupado, prueba en un rato' }, allowed);
      const id = crypto.randomBytes(12).toString('base64url');
      const del = crypto.randomBytes(12).toString('base64url');
      const exp = Date.now() + SHARE_TTL_MS;
      shares.set(id, { data, del, exp, size: data.length }); sharesBytes += data.length; compartidos++;
      return send(res, 201, { id, del, exp }, allowed);
    }
    const sm = path.match(/^\/share\/([A-Za-z0-9_-]{16})$/);
    if (sm && req.method === 'GET') {
      const x = shares.get(sm[1]);
      if (!x || x.exp <= Date.now()) { dropShare(sm[1]); return send(res, 404, { error: 'caducado o ya abierto' }, allowed); }
      dropShare(sm[1]); abiertos++; // de un solo uso: al abrirlo desaparece
      return send(res, 200, { data: x.data }, allowed);
    }
    if (sm && req.method === 'DELETE') {
      const x = shares.get(sm[1]);
      if (x && x.del === url.searchParams.get('del')) dropShare(sm[1]);
      return send(res, 200, { ok: true }, allowed); // idempotente
    }
    const m = path.match(/^\/rest\/([0-9a-f-]{36})$/);
    if (m && req.method === 'PUT') {
      const b = await readJson(req);
      if (!pending.has(m[1])) return send(res, 404, { error: 'no existe' }, allowed);
      if (!validDelay(b.inMs)) return send(res, 400, { error: 'tiempo no válido' }, allowed);
      schedule(m[1], b.inMs);
      return send(res, 200, { ok: true }, allowed);
    }
    if (m && req.method === 'DELETE') {
      const p = pending.get(m[1]);
      if (p) { clearTimeout(p.timer); pending.delete(m[1]); }
      return send(res, 200, { ok: true }, allowed); // idempotente
    }
    return send(res, 404, { error: 'no encontrado' }, allowed);
  } catch (e) {
    return send(res, e.status || 500, { error: e.status ? 'petición no válida' : 'error' }, allowed);
  }
});

server.listen(PORT, HOST, () => console.log(`traindia-push escuchando en ${HOST}:${PORT} · orígenes: ${ORIGINS.join(', ')}`));
const stop = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
