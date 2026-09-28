const APP_VERSION = '20260928-26.23-camera-timeout-fallback';
const COSMOS_ENDPOINT = 'https://api.cosmoshub.tech/v1/chat/completions';
const FIREBASE_LOGIN_ENDPOINT = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';
const FIREBASE_RESET_ENDPOINT = 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode';
const MAX_REQUEST_BYTES = 28 * 1024 * 1024;
const MAX_AUTH_BODY_BYTES = 16 * 1024;
const MAX_METRICS_BODY_BYTES = 12 * 1024;
const MAX_BETA_IMAGE_BYTES = 4 * 1024 * 1024;
const CAMERA_BATCH_TTL_MS = 72 * 60 * 60 * 1000;
const MAX_CAMERA_CAPTURES = 100;
const MAX_CAMERA_MANIFEST_BYTES = 64 * 1024;
const MAX_BETA_BATCH_IMAGES = 8;
const MAX_BETA_BATCH_RAW_BYTES = 8 * 1024 * 1024;
const BETA_IMAGE_TOKEN_TTL_SECONDS = 60 * 60;
const BETA_IMAGE_REFERENCE_PREFIX = 'mile-r2:';
const METRICS_TIMEOUT_MS = 15000;
const AI_UPSTREAM_TIMEOUTS_MS = Object.freeze({
  camera: Object.freeze({ gemini: 20000, other: 35000 }),
  document: Object.freeze({ gemini: 60000, other: 180000 })
});
const MAX_AI_RESPONSE_BYTES = 2 * 1024 * 1024;
const VERSIONED_ASSET_CACHE = 'private, max-age=31536000, immutable';
const SESSION_COOKIE = '__Host-mile_session';
const DEFAULT_ALLOWED_EMAILS = ['ikhsan@posnew.com'];
const ALLOWED_MODELS = new Set([
  'claude-opus-5', 'claude-sonnet-4.5', 'claude-haiku-4.5',
  'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro',
  'deepseek-v4.1-flash', 'deepseek-v4-pro',
  'qwen-3.8-flash', 'qwen-3.7-plus', 'qwen-3.7-flash',
  'glm-5.3', 'glm-5.3-flashx', 'glm-5.3-flash'
]);
const PUBLIC_ASSETS = new Set([
  '/favicon.svg', '/favicon-32x32.png', '/apple-touch-icon.png',
  '/icon-192.png', '/icon-512.png', '/og-cover.png', '/site.webmanifest',
  '/robots.txt', '/404.html', '/assets/css/login-v16.css', '/assets/js/login-v16.js'
]);

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function securityHeaders(extra = {}) {
  return {
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'strict-origin-when-cross-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(), gyroscope=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "worker-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      'upgrade-insecure-requests'
    ].join('; '),
    ...extra
  };
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: securityHeaders({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'cloudflare-cdn-cache-control': 'no-store',
      ...extraHeaders
    })
  });
}

function redirect(location, status = 302) {
  return new Response(null, {
    status,
    headers: securityHeaders({
      location,
      'cache-control': 'no-store, max-age=0',
      'cloudflare-cdn-cache-control': 'no-store'
    })
  });
}

function parseCookies(header) {
  const cookies = {};
  String(header || '').split(';').forEach(part => {
    const index = part.indexOf('=');
    if (index < 0) return;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) cookies[key] = value;
  });
  return cookies;
}

function base64UrlEncode(input) {
  const bytes = typeof input === 'string' ? textEncoder.encode(input) : input;
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(input) {
  const normalized = String(input || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function sessionKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function createSessionToken(payload, secret) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const key = await sessionKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode(encodedPayload)));
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

async function verifySessionToken(token, secret) {
  try {
    const [encodedPayload, encodedSignature, extra] = String(token || '').split('.');
    if (!encodedPayload || !encodedSignature || extra) return null;
    const key = await sessionKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(encodedSignature),
      textEncoder.encode(encodedPayload)
    );
    if (!valid) return null;
    const payload = JSON.parse(textDecoder.decode(base64UrlDecode(encodedPayload)));
    const now = Math.floor(Date.now() / 1000);
    if (payload?.v !== 1 || !payload?.email || !payload?.uid || !payload?.exp || payload.exp <= now) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function betaImageBucket(env) {
  const bucket = env?.BETA_AI_IMAGES;
  return bucket && typeof bucket.put === 'function' && typeof bucket.get === 'function' ? bucket : null;
}

function betaOwnerKey(session) {
  return String(session?.uid || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
}

function validBetaJobId(value) {
  return /^[a-zA-Z0-9_-]{16,80}$/.test(String(value || ''));
}

async function createBetaImageToken(payload, secret) {
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const key = await sessionKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, textEncoder.encode(encodedPayload)));
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

async function verifyBetaImageToken(token, secret) {
  try {
    const [encodedPayload, encodedSignature, extra] = String(token || '').split('.');
    if (!encodedPayload || !encodedSignature || extra) return null;
    const key = await sessionKey(secret);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecode(encodedSignature),
      textEncoder.encode(encodedPayload)
    );
    if (!valid) return null;
    const payload = JSON.parse(textDecoder.decode(base64UrlDecode(encodedPayload)));
    const now = Math.floor(Date.now() / 1000);
    if (payload?.v !== 1 || payload?.kind !== 'beta-image' || !payload?.key || !payload?.exp || payload.exp <= now) return null;
    if (!String(payload.key).startsWith('beta/')) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function hydrateBetaImageReferences(body, env, session) {
  const references = [];
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  for (const message of messages) {
    if (!Array.isArray(message?.content)) continue;
    for (const part of message.content) {
      const imageUrl = part?.type === 'image_url' && part?.image_url && typeof part.image_url === 'object'
        ? part.image_url
        : null;
      const url = String(imageUrl?.url || '');
      if (url.startsWith(BETA_IMAGE_REFERENCE_PREFIX)) {
        references.push({ imageUrl, token: url.slice(BETA_IMAGE_REFERENCE_PREFIX.length) });
      }
    }
  }

  if (!references.length) return { count: 0, rawBytes: 0 };
  if (references.length > MAX_BETA_BATCH_IMAGES) {
    const error = new Error(`Kelompok Beta terlalu besar. Maksimal ${MAX_BETA_BATCH_IMAGES} gambar per permintaan.`);
    error.status = 413;
    throw error;
  }

  const bucket = betaImageBucket(env);
  const secret = configuredSessionSecret(env);
  const owner = betaOwnerKey(session);
  if (!bucket || !secret || !owner) {
    const error = new Error('Jembatan gambar R2 belum siap. Muat ulang halaman lalu coba lagi.');
    error.status = 503;
    throw error;
  }

  const ownerPrefix = `beta/${owner}/`;
  const loaded = await Promise.all(references.map(async reference => {
    const payload = await verifyBetaImageToken(reference.token, secret);
    if (!payload || !String(payload.key).startsWith(ownerPrefix)) {
      const error = new Error('Referensi gambar Beta tidak valid atau sudah kedaluwarsa.');
      error.status = 422;
      throw error;
    }
    const object = await bucket.get(payload.key);
    if (!object) {
      const error = new Error('Gambar sementara Beta sudah tidak tersedia. Silakan proses ulang PDF.');
      error.status = 410;
      throw error;
    }
    return { ...reference, object };
  }));

  const rawBytes = loaded.reduce((total, item) => total + Number(item.object.size || 0), 0);
  if (rawBytes > MAX_BETA_BATCH_RAW_BYTES) {
    const error = new Error('Total gambar dalam kelompok terlalu besar. Kurangi halaman per permintaan.');
    error.status = 413;
    throw error;
  }

  const buffers = await Promise.all(loaded.map(item => item.object.arrayBuffer()));
  loaded.forEach((item, index) => {
    const contentType = item.object.httpMetadata?.contentType || 'image/jpeg';
    item.imageUrl.url = `data:${contentType};base64,${arrayBufferToBase64(buffers[index])}`;
  });

  return { count: loaded.length, rawBytes };
}

function allowedEmails(env) {
  const configured = String(env?.MILE_ALLOWED_EMAILS || '').trim();
  const values = configured ? configured.split(/[\s,;]+/) : DEFAULT_ALLOWED_EMAILS;
  return new Set(values.map(value => String(value).trim().toLowerCase()).filter(Boolean));
}

function isAllowedEmail(email, env) {
  return allowedEmails(env).has(String(email || '').trim().toLowerCase());
}

function configuredSessionSecret(env) {
  const value = String(env?.MILE_SESSION_SECRET || '').trim();
  return value.length >= 32 ? value : '';
}

async function currentSession(request, env) {
  const secret = configuredSessionSecret(env);
  if (!secret) return null;
  const cookie = parseCookies(request.headers.get('cookie'))[SESSION_COOKIE];
  if (!cookie) return null;
  const session = await verifySessionToken(cookie, secret);
  if (!session || !isAllowedEmail(session.email, env)) return null;
  return session;
}

function sessionCookie(token, maxAge) {
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}

function sameOriginRequest(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') return false;
  if (origin && origin !== url.origin) return false;
  return true;
}

async function readJson(request, limit = MAX_AUTH_BODY_BYTES) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length && length > limit) throw new Error('PAYLOAD_TOO_LARGE');
  const text = await request.text();
  if (textEncoder.encode(text).byteLength > limit) throw new Error('PAYLOAD_TOO_LARGE');
  try {
    return JSON.parse(text || '{}');
  } catch (_) {
    throw new Error('INVALID_JSON');
  }
}

function firebaseErrorMessage(code) {
  const normalized = String(code || '').replace(/^auth\//, '').toUpperCase();
  if (normalized.includes('TOO_MANY_ATTEMPTS')) return { status: 429, message: 'Terlalu banyak percobaan login. Tunggu beberapa saat lalu coba kembali.' };
  if (normalized.includes('USER_DISABLED')) return { status: 403, message: 'Akun ini sedang dinonaktifkan.' };
  return { status: 401, message: 'Email atau password tidak benar.' };
}

async function handleLogin(request, env) {
  if (request.method !== 'POST') return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'POST' });
  if (!sameOriginRequest(request)) return json({ error: { message: 'Permintaan lintas situs ditolak.' } }, 403);

  const firebaseKey = String(env?.FIREBASE_WEB_API_KEY || '').trim();
  const secret = configuredSessionSecret(env);
  if (!firebaseKey || !secret) {
    return json({ error: { message: 'Konfigurasi autentikasi server belum lengkap.' } }, 503);
  }

  let input;
  try {
    input = await readJson(request);
  } catch (error) {
    const status = error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return json({ error: { message: status === 413 ? 'Payload login terlalu besar.' : 'Body harus berupa JSON valid.' } }, status);
  }

  const email = String(input?.email || '').trim().toLowerCase();
  const password = String(input?.password || '');
  const remember = Boolean(input?.remember);

  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8 || password.length > 256) {
    return json({ error: { message: 'Email atau password tidak benar.' } }, 401);
  }
  if (!isAllowedEmail(email, env)) {
    return json({ error: { message: 'Email atau password tidak benar.' } }, 401);
  }

  let upstream;
  try {
    upstream = await fetch(`${FIREBASE_LOGIN_ENDPOINT}?key=${encodeURIComponent(firebaseKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ email, password, returnSecureToken: true })
    });
  } catch (_) {
    return json({ error: { message: 'Firebase Authentication sedang tidak dapat dihubungi.' } }, 502);
  }

  let data = {};
  try { data = await upstream.json(); } catch (_) {}
  if (!upstream.ok) {
    const mapped = firebaseErrorMessage(data?.error?.message);
    return json({ error: { message: mapped.message } }, mapped.status);
  }

  const verifiedEmail = String(data?.email || '').trim().toLowerCase();
  const uid = String(data?.localId || '').trim();
  if (!uid || verifiedEmail !== email || !isAllowedEmail(verifiedEmail, env)) {
    return json({ error: { message: 'Akun tidak diizinkan menggunakan aplikasi ini.' } }, 403);
  }

  const now = Math.floor(Date.now() / 1000);
  const maxAge = remember ? 7 * 24 * 60 * 60 : 12 * 60 * 60;
  const token = await createSessionToken({ v: 1, uid, email: verifiedEmail, iat: now, exp: now + maxAge }, secret);

  return json({ ok: true, user: { email: verifiedEmail }, expiresIn: maxAge }, 200, {
    'set-cookie': sessionCookie(token, maxAge)
  });
}

async function handlePasswordReset(request, env) {
  if (request.method !== 'POST') return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'POST' });
  if (!sameOriginRequest(request)) return json({ error: { message: 'Permintaan lintas situs ditolak.' } }, 403);

  const firebaseKey = String(env?.FIREBASE_WEB_API_KEY || '').trim();
  if (!firebaseKey) return json({ error: { message: 'Firebase Authentication belum dikonfigurasi.' } }, 503);

  let input;
  try { input = await readJson(request); }
  catch (_) { return json({ error: { message: 'Body harus berupa JSON valid.' } }, 400); }

  const email = String(input?.email || '').trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || !isAllowedEmail(email, env)) {
    return json({ ok: true, message: 'Jika akun terdaftar, petunjuk reset password akan dikirim.' });
  }

  try {
    await fetch(`${FIREBASE_RESET_ENDPOINT}?key=${encodeURIComponent(firebaseKey)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ requestType: 'PASSWORD_RESET', email })
    });
  } catch (_) {
    return json({ error: { message: 'Layanan reset password sedang tidak dapat dihubungi.' } }, 502);
  }

  return json({ ok: true, message: 'Jika akun terdaftar, petunjuk reset password akan dikirim.' });
}

async function handleLogout(request) {
  if (request.method !== 'POST') return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'POST' });
  if (!sameOriginRequest(request)) return json({ error: { message: 'Permintaan lintas situs ditolak.' } }, 403);
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}


function configuredMetrics(env) {
  const webhookUrl = String(env?.GOOGLE_SHEETS_WEBHOOK_URL || '').trim();
  const webhookSecret = String(env?.GOOGLE_SHEETS_WEBHOOK_SECRET || '').trim();
  let validUrl = false;
  try {
    const url = new URL(webhookUrl);
    validUrl = url.protocol === 'https:' &&
      (url.hostname === 'script.google.com' || url.hostname.endsWith('.googleusercontent.com')) &&
      /\/exec(?:$|[?#])/.test(url.pathname + url.search + url.hash);
  } catch (_) {}
  return {
    webhookUrl: validUrl ? webhookUrl : '',
    webhookSecret: webhookSecret.length >= 24 ? webhookSecret : ''
  };
}

function clampMetricNumber(value, min, max, decimals = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  const bounded = Math.min(max, Math.max(min, number));
  const factor = 10 ** decimals;
  return Math.round(bounded * factor) / factor;
}

function safeMetricText(value, maxLength = 240) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function sanitizeCameraChunkTimings(value) {
  return (Array.isArray(value) ? value : []).slice(0, 60).map((item, index) => ({
    group: clampMetricNumber(item?.group || index + 1, 1, 60),
    start: clampMetricNumber(item?.start, 1, 300),
    end: clampMetricNumber(item?.end, 1, 300),
    inputBytes: clampMetricNumber(item?.inputBytes, 0, MAX_REQUEST_BYTES),
    encodedBytes: clampMetricNumber(item?.encodedBytes, 0, MAX_REQUEST_BYTES),
    prepareMs: clampMetricNumber(item?.prepareMs, 0, 86400000),
    encodeMs: clampMetricNumber(item?.encodeMs, 0, 86400000),
    uploadMs: clampMetricNumber(item?.uploadMs, 0, 86400000),
    waitMs: clampMetricNumber(item?.waitMs, 0, 86400000),
    totalMs: clampMetricNumber(item?.totalMs, 0, 86400000),
    auditMs: clampMetricNumber(item?.auditMs, 0, 86400000),
    auditPages: clampMetricNumber(item?.auditPages, 0, 15),
    rows: clampMetricNumber(item?.rows, 0, 1000),
    attempts: clampMetricNumber(item?.attempts, 0, 20),
    retries: clampMetricNumber(item?.retries, 0, 20),
    model: safeMetricText(item?.model, 80),
    fallbackFrom: safeMetricText(item?.fallbackFrom, 80),
    errorStatus: clampMetricNumber(item?.errorStatus, 0, 599),
    upstreamMs: clampMetricNumber(item?.upstreamMs, 0, 86400000),
    requestId: safeMetricText(item?.requestId, 128),
    status: safeMetricText(item?.status, 24)
  }));
}

async function handleMetrics(request, env, session) {
  if (!session) return json({ error: { message: 'Sesi login berakhir. Silakan masuk kembali.' } }, 401);
  if (request.method !== 'POST') return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'POST' });
  if (!sameOriginRequest(request)) return json({ error: { message: 'Permintaan lintas situs ditolak.' } }, 403);

  const metricsConfig = configuredMetrics(env);
  if (!metricsConfig.webhookUrl || !metricsConfig.webhookSecret) {
    return json({ error: { message: 'Pencatatan Google Sheets belum dikonfigurasi.' } }, 503);
  }

  let input;
  try {
    input = await readJson(request, MAX_METRICS_BODY_BYTES);
  } catch (error) {
    const status = error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400;
    return json({ error: { message: status === 413 ? 'Payload statistik terlalu besar.' : 'Body statistik harus berupa JSON valid.' } }, status);
  }

  const status = safeMetricText(input?.status, 24).toUpperCase();
  const allowedStatuses = new Set(['SUCCESS', 'FAILED', 'CANCELLED', 'PARTIAL']);
  if (!allowedStatuses.has(status)) {
    return json({ error: { message: 'Status statistik tidak valid.' } }, 400);
  }

  const payload = {
    token: metricsConfig.webhookSecret,
    userEmail: session.email,
    appVersion: APP_VERSION,
    status,
    fileCount: clampMetricNumber(input?.fileCount, 1, 20),
    pageCount: clampMetricNumber(input?.pageCount, 0, 3000),
    model: safeMetricText(input?.model, 80),
    chunkSize: clampMetricNumber(input?.chunkSize, 1, 20),
    concurrency: clampMetricNumber(input?.concurrency, 1, 12),
    durationSeconds: clampMetricNumber(input?.durationSeconds, 0, 86400, 3),
    totalRows: clampMetricNumber(input?.totalRows, 0, 100000),
    reviewCount: clampMetricNumber(input?.reviewCount, 0, 100000),
    outsideBatamCount: clampMetricNumber(input?.outsideBatamCount, 0, 100000),
    message: safeMetricText(input?.message, 400)
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('metrics-timeout'), METRICS_TIMEOUT_MS);
  try {
    const upstream = await fetch(metricsConfig.webhookUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        accept: 'application/json'
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
      signal: controller.signal
    });
    const responseText = await upstream.text();
    let output = {};
    try { output = JSON.parse(responseText || '{}'); } catch (_) {}

    if (!upstream.ok || output?.ok !== true) {
      const message = safeMetricText(output?.error || output?.message || `Google Sheets HTTP ${upstream.status}`, 240);
      return json({ error: { message: `Statistik belum tersimpan: ${message}` } }, 502);
    }

    return json({
      ok: true,
      logged: true,
      secondsPerRow: Number.isFinite(Number(output?.secondsPerRow)) ? Number(output.secondsPerRow) : null
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'Google Sheets tidak merespons dalam batas waktu.'
      : 'Cloudflare Pages tidak dapat menghubungi Google Sheets.';
    return json({ error: { message } }, 502);
  } finally {
    clearTimeout(timeout);
  }
}

function conciseHtmlError(text, status) {
  const title = String(text || '').match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  if (title) return `${title} (HTTP ${status})`;
  return `Upstream mengembalikan HTML, bukan JSON (HTTP ${status}).`;
}

async function handleBetaImageUpload(request, env, session, url) {
  if (!session) return json({ error: { message: 'Sesi login berakhir. Silakan masuk kembali.' } }, 401);
  if (request.method !== 'POST') return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'POST' });
  if (!sameOriginRequest(request)) return json({ error: { message: 'Permintaan lintas situs ditolak.' } }, 403);

  const bucket = betaImageBucket(env);
  const secret = configuredSessionSecret(env);
  if (!bucket || !secret) {
    return json({ error: { message: 'Penyimpanan gambar beta belum dikonfigurasi.' } }, 503);
  }

  const match = url.pathname.match(/^\/api\/beta\/images\/([a-zA-Z0-9_-]{16,80})\/(\d{1,3})\/(first|audit|probe)$/);
  if (!match || !validBetaJobId(match[1])) {
    return json({ error: { message: 'Alamat unggahan gambar beta tidak valid.' } }, 400);
  }

  const [, jobId, rawPage, variant] = match;
  const page = Number(rawPage);
  const validPage = variant === 'probe' ? page === 0 : page >= 1 && page <= 300;
  if (!validPage || request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'image/jpeg') {
    return json({ error: { message: 'Gambar beta harus berupa JPEG dengan nomor halaman valid.' } }, 400);
  }

  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (declaredLength > MAX_BETA_IMAGE_BYTES) {
    return json({ error: { message: 'Gambar beta terlalu besar (maksimal 4 MB).' } }, 413);
  }

  let bytes;
  try {
    bytes = await request.arrayBuffer();
  } catch (_) {
    return json({ error: { message: 'Isi gambar beta tidak dapat dibaca.' } }, 400);
  }
  if (!bytes.byteLength || bytes.byteLength > MAX_BETA_IMAGE_BYTES) {
    return json({ error: { message: bytes.byteLength ? 'Gambar beta terlalu besar (maksimal 4 MB).' : 'Gambar beta kosong.' } }, bytes.byteLength ? 413 : 400);
  }

  const owner = betaOwnerKey(session);
  if (!owner) return json({ error: { message: 'Identitas sesi tidak valid.' } }, 401);
  const key = `beta/${owner}/${jobId}/${page}-${variant}.jpg`;
  await bucket.put(key, bytes, {
    httpMetadata: { contentType: 'image/jpeg', cacheControl: 'private, no-store, max-age=0' },
    customMetadata: { createdAt: new Date().toISOString() }
  });

  const token = await createBetaImageToken({
    v: 1,
    kind: 'beta-image',
    key,
    exp: Math.floor(Date.now() / 1000) + BETA_IMAGE_TOKEN_TTL_SECONDS
  }, secret);

  return json({
    ok: true,
    ref: `${BETA_IMAGE_REFERENCE_PREFIX}${token}`,
    url: `${url.origin}/api/beta/image?t=${encodeURIComponent(token)}`,
    expiresIn: BETA_IMAGE_TOKEN_TTL_SECONDS
  });
}

async function handleBetaImageRead(request, env, url) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'GET, HEAD' });
  }

  const bucket = betaImageBucket(env);
  const secret = configuredSessionSecret(env);
  if (!bucket || !secret) return json({ error: { message: 'Penyimpanan gambar beta belum dikonfigurasi.' } }, 503);

  const payload = await verifyBetaImageToken(url.searchParams.get('t'), secret);
  if (!payload) return json({ error: { message: 'Tautan gambar tidak valid atau sudah kedaluwarsa.' } }, 403);

  const object = await bucket.get(payload.key);
  if (!object) return json({ error: { message: 'Gambar beta sudah tidak tersedia.' } }, 404);

  const headers = new Headers(securityHeaders({
    'content-type': object.httpMetadata?.contentType || 'image/jpeg',
    'content-length': String(object.size),
    'cache-control': 'private, no-store, max-age=0',
    'cloudflare-cdn-cache-control': 'no-store',
    'cross-origin-resource-policy': 'cross-origin',
    'content-disposition': 'inline',
    etag: object.httpEtag || object.etag || ''
  }));
  if (!headers.get('etag')) headers.delete('etag');
  return new Response(request.method === 'HEAD' ? null : object.body, { status: 200, headers });
}

async function handleBetaImageCleanup(request, env, session) {
  if (!session) return json({ error: { message: 'Sesi login berakhir. Silakan masuk kembali.' } }, 401);
  if (request.method !== 'POST') return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'POST' });
  if (!sameOriginRequest(request)) return json({ error: { message: 'Permintaan lintas situs ditolak.' } }, 403);

  const bucket = betaImageBucket(env);
  if (!bucket) return json({ error: { message: 'Penyimpanan gambar beta belum dikonfigurasi.' } }, 503);

  let input;
  try {
    input = await readJson(request, 2048);
  } catch (_) {
    return json({ error: { message: 'Permintaan pembersihan gambar tidak valid.' } }, 400);
  }
  if (!validBetaJobId(input?.jobId)) return json({ error: { message: 'ID pekerjaan beta tidak valid.' } }, 400);

  const owner = betaOwnerKey(session);
  if (!owner) return json({ error: { message: 'Identitas sesi tidak valid.' } }, 401);
  const prefix = `beta/${owner}/${input.jobId}/`;
  let cursor;
  let deleted = 0;
  do {
    const page = await bucket.list({ prefix, cursor, limit: 1000 });
    const keys = page.objects.map(object => object.key);
    if (keys.length) {
      await bucket.delete(keys);
      deleted += keys.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  return json({ ok: true, deleted });
}

function validCameraBatchId(value) {
  return /^CAM-[a-zA-Z0-9_-]{8,80}$/.test(String(value || ''));
}

const MAX_CAMERA_RESULT_BYTES = 2 * 1024 * 1024;

async function handleCameraBatchSave(request, env, session, url) {
  if (!session) return json({ error: { message: 'Sesi login berakhir. Silakan masuk kembali.' } }, 401);
  if (request.method !== 'POST') return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'POST' });
  if (!sameOriginRequest(request)) return json({ error: { message: 'Permintaan lintas situs ditolak.' } }, 403);

  const bucket = betaImageBucket(env);
  if (!bucket) return json({ error: { message: 'Penyimpanan belum dikonfigurasi.' } }, 503);

  const match = url.pathname.match(/^\/api\/camera\/batch\/([a-zA-Z0-9_-]{8,80})$/);
  if (!match || !validCameraBatchId(match[1])) {
    return json({ error: { message: 'ID batch kamera tidak valid.' } }, 400);
  }

  let body;
  try {
    body = await readJson(request, MAX_CAMERA_RESULT_BYTES);
  } catch (_) {
    return json({ error: { message: 'Data batch kamera tidak valid.' } }, 400);
  }

  if (!body || typeof body !== 'object' || body.id !== match[1]) {
    return json({ error: { message: 'Data batch kamera tidak cocok.' } }, 400);
  }
  if (!Array.isArray(body.rows) || body.rows.length < 1) {
    return json({ error: { message: 'Batch harus berisi minimal 1 baris data.' } }, 400);
  }

  const owner = betaOwnerKey(session);
  if (!owner) return json({ error: { message: 'Identitas sesi tidak valid.' } }, 401);

  const now = Date.now();
  let reviewCount = 0;
  let reviewFieldCount = 0;
  let outsideBatamCount = 0;
  let cleanCount = 0;
  body.rows.forEach(row => {
    const reviewFields = Array.isArray(row?.aiReviewFields)
      ? row.aiReviewFields
      : (Array.isArray(row?.reviewFields) ? row.reviewFields : []);
    const needsReview = reviewFields.length > 0 || Boolean(row?.needsVerification);
    const outsideBatam = Boolean(row?.outsideBatam || row?.outOfTown);
    if (needsReview) reviewCount++;
    reviewFieldCount += reviewFields.length ? new Set(reviewFields.map(value => String(value || '').trim()).filter(Boolean)).size : (needsReview ? 1 : 0);
    if (outsideBatam) outsideBatamCount++;
    if (!needsReview && !outsideBatam) cleanCount++;
  });
  const record = {
    id: body.id,
    createdAt: Number(body.createdAt) || now,
    savedAt: now,
    startedAt: safeMetricText(body.startedAt, 40),
    captureFinishedAt: safeMetricText(body.captureFinishedAt, 40),
    finishedAt: safeMetricText(body.finishedAt, 40) || new Date().toISOString(),
    captureCount: Number(body.captureCount) || 0,
    rowCount: body.rows.length,
    deviceName: body.deviceName ? String(body.deviceName).substring(0, 50) : '',
    templateName: body.templateName ? String(body.templateName).substring(0, 50) : safeMetricText(body.form?.corporateTemplate, 50),
    durationSeconds: clampMetricNumber(body.processingDurationSeconds || body.durationSeconds, 0, 86400, 3),
    captureDurationSeconds: clampMetricNumber(body.captureDurationSeconds, 0, 86400, 3),
    totalDurationSeconds: clampMetricNumber(body.totalDurationSeconds, 0, 86400, 3),
    model: safeMetricText(body.model, 80),
    chunkSize: clampMetricNumber(body.chunkSize, 1, 15),
    concurrency: clampMetricNumber(body.concurrency, 1, 5),
    chunkTimings: sanitizeCameraChunkTimings(body.chunkTimings),
    reviewCount,
    reviewFieldCount,
    outsideBatamCount,
    cleanCount,
    expiresAt: (Number(body.createdAt) || now) + CAMERA_BATCH_TTL_MS,
    status: 'complete',
    form: body.form || {},
    rows: body.rows
  };

  const key = `camera/${owner}/${match[1]}/result.json`;
  await bucket.put(key, JSON.stringify(record), {
    httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store, max-age=0' },
    customMetadata: { createdAt: new Date().toISOString() }
  });

  return json({ ok: true, batchId: match[1], rowCount: record.rowCount, expiresAt: record.expiresAt });
}

async function handleCameraBatchList(request, env, session) {
  if (!session) return json({ error: { message: 'Sesi login berakhir. Silakan masuk kembali.' } }, 401);
  if (request.method !== 'GET') return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'GET' });

  const bucket = betaImageBucket(env);
  if (!bucket) return json({ error: { message: 'Penyimpanan belum dikonfigurasi.' } }, 503);

  const owner = betaOwnerKey(session);
  if (!owner) return json({ error: { message: 'Identitas sesi tidak valid.' } }, 401);

  const prefix = `camera/${owner}/`;
  const batches = [];
  const now = Date.now();
  let cursor;

  do {
    const page = await bucket.list({ prefix, cursor, limit: 500 });
    for (const obj of page.objects) {
      if (obj.key.endsWith('/result.json')) {
        try {
          const resultObj = await bucket.get(obj.key);
          if (resultObj) {
            const result = await resultObj.json();
            if (result && (result.expiresAt || 0) > now) {
              const resultRows = Array.isArray(result.rows) ? result.rows : [];
              let derivedReviewCount = 0;
              let derivedReviewFieldCount = 0;
              let derivedOutsideBatamCount = 0;
              let derivedCleanCount = 0;
              resultRows.forEach(row => {
                const reviewFields = Array.isArray(row?.aiReviewFields)
                  ? row.aiReviewFields
                  : (Array.isArray(row?.reviewFields) ? row.reviewFields : []);
                const needsReview = reviewFields.length > 0 || Boolean(row?.needsVerification);
                const outsideBatam = Boolean(row?.outsideBatam || row?.outOfTown);
                if (needsReview) derivedReviewCount++;
                derivedReviewFieldCount += reviewFields.length ? new Set(reviewFields.map(value => String(value || '').trim()).filter(Boolean)).size : (needsReview ? 1 : 0);
                if (outsideBatam) derivedOutsideBatamCount++;
                if (!needsReview && !outsideBatam) derivedCleanCount++;
              });
              batches.push({
                id: result.id,
                createdAt: result.createdAt,
                savedAt: result.savedAt,
                startedAt: result.startedAt || '',
                captureFinishedAt: result.captureFinishedAt || '',
                finishedAt: result.finishedAt,
                captureCount: result.captureCount,
                rowCount: result.rowCount,
                expiresAt: result.expiresAt,
                status: result.status,
                deviceName: result.deviceName || '',
                templateName: result.form?.corporateTemplate || result.templateName || 'MANUAL',
                customerId: result.form?.customerId || '',
                clientMode: result.form?.clientMode || '',
                serviceCode: result.form?.serviceCode || '',
                tariffCode: result.form?.tariffCode || '',
                itemType: result.form?.itemType || '',
                useInsurance: Boolean(result.form?.useInsurance),
                model: result.model || '',
                chunkSize: Number(result.chunkSize) || 0,
                concurrency: Number(result.concurrency) || 0,
                chunkTimings: sanitizeCameraChunkTimings(result.chunkTimings),
                durationSeconds: Number(result.durationSeconds) || 0,
                captureDurationSeconds: Number(result.captureDurationSeconds) || 0,
                totalDurationSeconds: Number(result.totalDurationSeconds) || 0,
                reviewCount: Number.isFinite(Number(result.reviewCount)) ? Number(result.reviewCount) : derivedReviewCount,
                reviewFieldCount: Number.isFinite(Number(result.reviewFieldCount)) ? Number(result.reviewFieldCount) : derivedReviewFieldCount,
                outsideBatamCount: Number.isFinite(Number(result.outsideBatamCount)) ? Number(result.outsideBatamCount) : derivedOutsideBatamCount,
                cleanCount: Number.isFinite(Number(result.cleanCount)) ? Number(result.cleanCount) : derivedCleanCount
              });
            }
          }
        } catch (_) {}
      }
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  batches.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return json({ ok: true, batches });
}

async function handleCameraBatchGet(request, env, session, url) {
  if (!session) return json({ error: { message: 'Sesi login berakhir. Silakan masuk kembali.' } }, 401);
  if (request.method !== 'GET') return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'GET' });

  const bucket = betaImageBucket(env);
  if (!bucket) return json({ error: { message: 'Penyimpanan belum dikonfigurasi.' } }, 503);

  const match = url.pathname.match(/^\/api\/camera\/batch\/([a-zA-Z0-9_-]{8,80})$/);
  if (!match || !validCameraBatchId(match[1])) {
    return json({ error: { message: 'ID batch kamera tidak valid.' } }, 400);
  }

  const owner = betaOwnerKey(session);
  if (!owner) return json({ error: { message: 'Identitas sesi tidak valid.' } }, 401);

  const key = `camera/${owner}/${match[1]}/result.json`;
  const object = await bucket.get(key);
  if (!object) return json({ error: { message: 'Batch kamera tidak ditemukan.' } }, 404);

  const result = await object.json();
  if (!result || (result.expiresAt || 0) <= Date.now()) {
    return json({ error: { message: 'Batch kamera sudah kedaluwarsa.' } }, 410);
  }

  return json({ ok: true, batch: result });
}

async function handleCameraBatchDelete(request, env, session, url) {
  if (!session) return json({ error: { message: 'Sesi login berakhir. Silakan masuk kembali.' } }, 401);
  if (request.method !== 'DELETE') return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'DELETE' });

  const bucket = betaImageBucket(env);
  if (!bucket) return json({ error: { message: 'Penyimpanan belum dikonfigurasi.' } }, 503);

  const match = url.pathname.match(/^\/api\/camera\/batch\/([a-zA-Z0-9_-]{8,80})$/);
  if (!match || !validCameraBatchId(match[1])) {
    return json({ error: { message: 'ID batch kamera tidak valid.' } }, 400);
  }

  const owner = betaOwnerKey(session);
  if (!owner) return json({ error: { message: 'Identitas sesi tidak valid.' } }, 401);

  const key = `camera/${owner}/${match[1]}/result.json`;
  await bucket.delete(key);

  return json({ ok: true, deleted: 1 });
}

function aiUpstreamTimeoutMs(model, requestProfile) {
  const profile = requestProfile === 'camera' ? 'camera' : 'document';
  return AI_UPSTREAM_TIMEOUTS_MS[profile][model.startsWith('gemini-') ? 'gemini' : 'other'];
}

function safeAiDiagnostic(value, apiKey, maxLength = 600) {
  let text = String(value || '');
  if (apiKey) text = text.split(apiKey).join('[redacted]');
  return text
    .replace(/Bearer\s+[^\s"'<>]+/gi, 'Bearer [redacted]')
    .replace(/\bsk-[a-zA-Z0-9_-]+/g, '[redacted]')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim().slice(0, maxLength);
}

async function readAiResponseText(upstream, signal) {
  if (Number(upstream.headers.get('content-length') || 0) > MAX_AI_RESPONSE_BYTES) {
    if (upstream.body) void upstream.body.cancel().catch(() => {});
    const error = new Error('Respons CosmosHub terlalu besar.');
    error.code = 'UPSTREAM_INVALID_RESPONSE';
    throw error;
  }
  if (!upstream.body) return '';
  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let result = '';
  let complete = false;
  const abortRead = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abortRead, { once: true });
  try {
    while (true) {
      if (signal.aborted) throw new DOMException('Upstream request aborted.', 'AbortError');
      const { done, value } = await reader.read();
      if (signal.aborted) throw new DOMException('Upstream request aborted.', 'AbortError');
      if (done) {
        complete = true;
        return result + decoder.decode();
      }
      bytes += value.byteLength;
      if (bytes > MAX_AI_RESPONSE_BYTES) {
        const error = new Error('Respons CosmosHub terlalu besar.');
        error.code = 'UPSTREAM_INVALID_RESPONSE';
        throw error;
      }
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    signal.removeEventListener('abort', abortRead);
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function handleProxy(request, env, session) {
  if (!session) return json({ error: { message: 'Sesi login berakhir. Silakan masuk kembali.' } }, 401);
  if (request.method !== 'POST') return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'POST' });
  if (!sameOriginRequest(request)) return json({ error: { message: 'Permintaan lintas situs ditolak.' } }, 403);

  const length = Number(request.headers.get('content-length') || 0);
  if (length && length > MAX_REQUEST_BYTES) {
    return json({ error: { message: 'Payload terlalu besar. Turunkan halaman per permintaan atau gunakan preset Sedang.' } }, 413);
  }

  let input;
  try { input = await request.json(); }
  catch (_) { return json({ error: { message: 'Body harus berupa JSON valid.' } }, 400); }

  const apiKey = String(env?.COSMOS_API_KEY || '').trim();
  const body = input?.body;
  const model = String(body?.model || '').trim();

  if (!apiKey) return json({ error: { message: 'COSMOS_API_KEY belum tersedia pada Cloudflare Pages.' } }, 503);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: { message: 'Payload API tidak valid.' } }, 400);
  if (!ALLOWED_MODELS.has(model)) return json({ error: { message: `Model CosmosHub tidak diizinkan: ${model || '(kosong)'}.` } }, 400);
  // requestProfile controls this gateway only, never the provider payload.
  delete body.requestProfile;
  const upstreamTimeoutMs = aiUpstreamTimeoutMs(model, input?.requestProfile);

  let hydratedImages = 0;
  try {
    const hydrated = await hydrateBetaImageReferences(body, env, session);
    hydratedImages = hydrated.count;
  } catch (error) {
    return json({ error: { message: error?.message || 'Gambar sementara Beta tidak dapat dipersiapkan.', source: 'r2-bridge' } }, Number(error?.status || 500), {
      'x-mile-transport': 'cloudflare-r2-bridge'
    });
  }

  const transport = hydratedImages ? 'cloudflare-r2-bridge' : 'cloudflare-worker';
  const upstreamBody = JSON.stringify(body);
  // Payload ini didominasi base64 ASCII; gunakan panjang string agar tidak
  // membuat salinan Uint8Array besar dan membuang jatah CPU Worker Free.
  if (upstreamBody.length > MAX_REQUEST_BYTES - 64 * 1024) {
    return json({ error: { message: 'Payload AI setelah gambar dipersiapkan terlalu besar. Kurangi halaman per permintaan.' } }, 413, {
      'x-mile-transport': transport
    });
  }

  const upstreamController = new AbortController();
  const upstreamStartedAt = Date.now();
  let upstreamTimedOut = false;
  let upstream;
  const upstreamHeaders = () => {
    const elapsedMs = Math.max(0, Date.now() - upstreamStartedAt);
    const headers = {
      'x-mile-transport': transport,
      'x-mile-upstream-ms': String(elapsedMs),
      'x-mile-upstream-timeout-ms': String(upstreamTimeoutMs),
      'server-timing': `cosmos;dur=${elapsedMs}`
    };
    if (upstream) {
      headers['x-mile-upstream-status'] = String(upstream.status);
      const requestId = safeAiDiagnostic(upstream.headers.get('x-request-id') || upstream.headers.get('request-id') || upstream.headers.get('cf-ray'), apiKey, 128)
        .replace(/[^a-zA-Z0-9_.:-]/g, '');
      if (requestId) headers['x-mile-request-id'] = requestId;
    }
    return headers;
  };
  const abortUpstream = () => upstreamController.abort();
  const upstreamTimeout = setTimeout(() => {
    upstreamTimedOut = true;
    upstreamController.abort();
  }, upstreamTimeoutMs);
  request.signal?.addEventListener?.('abort', abortUpstream, { once: true });

  try {
    if (request.signal?.aborted) abortUpstream();
    if (upstreamController.signal.aborted) throw new DOMException('Upstream request aborted.', 'AbortError');
    upstream = await fetch(COSMOS_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: upstreamBody,
      signal: upstreamController.signal,
      redirect: 'follow'
    });

    if (upstream.status === 401 || upstream.status === 403) {
      if (upstream.body) void upstream.body.cancel().catch(() => {});
      return json({ error: { message: 'Kredensial layanan AI ditolak oleh provider. Administrator perlu memeriksa COSMOS_API_KEY.', source: 'cosmos', code: 'UPSTREAM_AUTH_ERROR', upstreamStatus: upstream.status } }, 502, upstreamHeaders());
    }
    const responseText = await readAiResponseText(upstream, upstreamController.signal);
    let output;
    try { output = JSON.parse(responseText); }
    catch (_) {
      const message = responseText.trim().startsWith('<')
        ? conciseHtmlError(responseText, upstream.status)
        : (responseText.trim() || 'CosmosHub mengirim respons kosong.');
      return json({ error: { message: safeAiDiagnostic(message, apiKey), source: 'cosmos', code: 'UPSTREAM_INVALID_RESPONSE', upstreamStatus: upstream.status } }, upstream.ok ? 502 : upstream.status, upstreamHeaders());
    }
    if (!upstream.ok || output?.error) {
      const providerError = output?.error;
      const error = {
        message: safeAiDiagnostic(providerError?.message || (typeof providerError === 'string' ? providerError : '') || output?.message || `CosmosHub HTTP ${upstream.status}`, apiKey),
        source: 'cosmos',
        code: safeAiDiagnostic(providerError?.code || 'UPSTREAM_ERROR', apiKey, 80),
        upstreamStatus: upstream.status
      };
      if (providerError?.type) error.type = safeAiDiagnostic(providerError.type, apiKey, 80);
      return json({ error }, upstream.ok ? 502 : upstream.status, upstreamHeaders());
    }
    if (!output || typeof output !== 'object' || Array.isArray(output)) {
      return json({ error: { message: 'CosmosHub mengirim respons JSON yang tidak valid.', source: 'cosmos', code: 'UPSTREAM_INVALID_RESPONSE', upstreamStatus: upstream.status } }, 502, upstreamHeaders());
    }
    return json(output, upstream.status, upstreamHeaders());
  } catch (error) {
    const timedOut = upstreamTimedOut && !request.signal?.aborted;
    const cancelled = Boolean(request.signal?.aborted);
    return json({
      error: {
        message: timedOut
          ? `CosmosHub tidak memberi respons lengkap dalam ${upstreamTimeoutMs / 1000} detik. Permintaan dihentikan agar proses dapat lanjut ke model cadangan.`
          : cancelled
            ? 'Permintaan AI dibatalkan.'
            : `Cloudflare Pages Function tidak dapat menghubungi CosmosHub: ${safeAiDiagnostic(error?.message || 'kesalahan jaringan', apiKey)}`,
        source: 'cosmos',
        code: timedOut ? 'UPSTREAM_TIMEOUT' : cancelled ? 'REQUEST_ABORTED' : safeAiDiagnostic(error?.code || 'UPSTREAM_NETWORK_ERROR', apiKey, 80),
        ...(upstream ? { upstreamStatus: upstream.status } : {})
      }
    }, timedOut ? 504 : cancelled ? 499 : 502, upstreamHeaders());
  } finally {
    clearTimeout(upstreamTimeout);
    request.signal?.removeEventListener?.('abort', abortUpstream);
  }
}

async function assetResponse(request, env, path, cacheControl = 'no-store, max-age=0') {
  const url = new URL(request.url);
  url.pathname = path;
  const assetRequest = new Request(url.toString(), request);
  const response = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(response.headers);
  Object.entries(securityHeaders()).forEach(([key, value]) => headers.set(key, value));
  if (path === '/camera' || path === '/camera.html') {
    headers.set('permissions-policy', 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), accelerometer=(self), gyroscope=(self)');
  }
  headers.set('cache-control', cacheControl);
  headers.set('x-mile-app-version', APP_VERSION);
  if (/\bno-store\b/i.test(cacheControl)) {
    headers.set('cloudflare-cdn-cache-control', 'no-store');
  } else {
    headers.delete('cloudflare-cdn-cache-control');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isProtectedAsset(pathname) {
  if (pathname === '/app' || pathname === '/app.html' || pathname === '/beta' || pathname === '/beta.html' || pathname === '/camera' || pathname === '/camera.html' || pathname === '/review' || pathname === '/review.html') return true;
  if (!pathname.startsWith('/assets/')) return false;
  return !PUBLIC_ASSETS.has(pathname);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === 'templatemile.pages.dev') {
      url.hostname = 'mile.posnew.com';
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === '/api/health') {
      return json({
        ok: true,
        service: 'mile-posnew-secure-gateway',
        version: APP_VERSION,
        cosmosConfigured: Boolean(String(env?.COSMOS_API_KEY || '').trim()),
        firebaseConfigured: Boolean(String(env?.FIREBASE_WEB_API_KEY || '').trim()),
        sessionConfigured: Boolean(configuredSessionSecret(env)),
        metricsConfigured: Boolean(configuredMetrics(env).webhookUrl && configuredMetrics(env).webhookSecret),
        betaImagesConfigured: Boolean(betaImageBucket(env)),
        serverSideGate: true
      });
    }

    if (url.pathname === '/api/auth/login') return handleLogin(request, env);
    if (url.pathname === '/api/auth/reset-password') return handlePasswordReset(request, env);
    if (url.pathname === '/api/auth/logout') return handleLogout(request);
    if (url.pathname === '/api/beta/image') return handleBetaImageRead(request, env, url);

    const session = await currentSession(request, env);

    if (url.pathname === '/api/auth/me') {
      if (!session) return json({ authenticated: false }, 401);
      return json({ authenticated: true, user: { email: session.email }, expiresAt: session.exp });
    }

    if (url.pathname === '/api/ai-proxy') return handleProxy(request, env, session);
    if (url.pathname === '/api/metrics/ai') return handleMetrics(request, env, session);
    if (url.pathname === '/api/beta/images/cleanup') return handleBetaImageCleanup(request, env, session);
    if (url.pathname.startsWith('/api/beta/images/')) return handleBetaImageUpload(request, env, session, url);
    if (url.pathname === '/api/camera/batches') return handleCameraBatchList(request, env, session);
    if (url.pathname.match(/^\/api\/camera\/batch\/[a-zA-Z0-9_-]+$/) && request.method === 'GET') return handleCameraBatchGet(request, env, session, url);
    if (url.pathname.match(/^\/api\/camera\/batch\/[a-zA-Z0-9_-]+$/) && request.method === 'POST') return handleCameraBatchSave(request, env, session, url);
    if (url.pathname.match(/^\/api\/camera\/batch\/[a-zA-Z0-9_-]+$/) && request.method === 'DELETE') return handleCameraBatchDelete(request, env, session, url);

    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/login' || url.pathname === '/login.html') {
      // Fetch extensionless asset routes. Cloudflare Pages redirects /index.html to /
      // and /app.html to /app. Fetching the .html paths from ASSETS here would
      // return those redirects to the browser and can create a redirect loop.
      if (session) return assetResponse(request, env, '/app');
      return assetResponse(request, env, '/');
    }

    if (PUBLIC_ASSETS.has(url.pathname)) {
      const cacheControl = url.pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'public, max-age=3600';
      return assetResponse(request, env, url.pathname, cacheControl);
    }

    // Canonicalize protected HTML internally instead of returning Pages' automatic
    // .html redirect to the browser.
    if (url.pathname === '/app' || url.pathname === '/app.html') {
      if (!session) return redirect('/');
      return assetResponse(request, env, '/app');
    }
    if (url.pathname === '/beta' || url.pathname === '/beta.html') {
      if (!session) return redirect('/');
      return assetResponse(request, env, '/beta');
    }
    if (url.pathname === '/camera' || url.pathname === '/camera.html') {
      if (!session) return redirect('/');
      return assetResponse(request, env, '/camera');
    }
    if (url.pathname === '/review' || url.pathname === '/review.html') {
      if (!session) return redirect('/');
      return assetResponse(request, env, '/review');
    }

    if (isProtectedAsset(url.pathname)) {
      if (!session) {
        const acceptsHtml = request.headers.get('accept')?.includes('text/html');
        return acceptsHtml ? redirect('/') : json({ error: { message: 'Autentikasi diperlukan.' } }, 401);
      }
      const cacheControl = url.pathname.startsWith('/assets/') ? VERSIONED_ASSET_CACHE : 'no-store, max-age=0';
      return assetResponse(request, env, url.pathname, cacheControl);
    }

    if (!session) return redirect('/');
    return assetResponse(request, env, url.pathname);
  }
};
