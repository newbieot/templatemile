const APP_VERSION = '20260803-16.7';
const COSMOS_ENDPOINT = 'https://api.cosmoshub.tech/v1/chat/completions';
const FIREBASE_LOGIN_ENDPOINT = 'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';
const FIREBASE_RESET_ENDPOINT = 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode';
const MAX_REQUEST_BYTES = 28 * 1024 * 1024;
const MAX_AUTH_BODY_BYTES = 16 * 1024;
const MAX_METRICS_BODY_BYTES = 12 * 1024;
const METRICS_TIMEOUT_MS = 15000;
const SESSION_COOKIE = '__Host-mile_session';
const DEFAULT_ALLOWED_EMAILS = ['ikhsan@posnew.com'];
const ALLOWED_MODELS = new Set([
  'claude-opus-5', 'claude-sonnet-4.5', 'claude-haiku-4.5',
  'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-3.1-pro'
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
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    'cross-origin-opener-policy': 'same-origin',
    'cross-origin-resource-policy': 'same-origin',
    'content-security-policy': [
      "default-src 'self'",
      "script-src 'self' https://cdn.sheetjs.com https://cdnjs.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "worker-src 'self' blob: https://cdnjs.cloudflare.com",
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
      ...extraHeaders
    })
  });
}

function redirect(location, status = 302) {
  return new Response(null, {
    status,
    headers: securityHeaders({
      location,
      'cache-control': 'no-store, max-age=0'
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

  try {
    const upstream = await fetch(COSMOS_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body: JSON.stringify(body),
      redirect: 'follow'
    });

    const responseText = await upstream.text();
    let output;
    try { output = JSON.parse(responseText); }
    catch (_) {
      const message = responseText.trim().startsWith('<')
        ? conciseHtmlError(responseText, upstream.status)
        : (responseText.slice(0, 600) || `CosmosHub HTTP ${upstream.status}`);
      output = { error: { message } };
    }

    if (upstream.status === 401 || upstream.status === 403) {
      return json({ error: { message: 'Kredensial layanan AI ditolak oleh provider. Administrator perlu memeriksa COSMOS_API_KEY.' } }, 502, {
        'x-mile-transport': 'cloudflare-worker',
        'x-mile-upstream-status': String(upstream.status)
      });
    }
    if (!upstream.ok && !output?.error?.message) {
      output = { error: { message: output?.message || `CosmosHub HTTP ${upstream.status}` } };
    }

    return json(output, upstream.status, {
      'x-mile-transport': 'cloudflare-worker',
      'x-mile-upstream-status': String(upstream.status),
      'x-mile-request-id': upstream.headers.get('x-request-id') || upstream.headers.get('request-id') || ''
    });
  } catch (error) {
    return json({ error: { message: `Cloudflare Pages Function tidak dapat menghubungi CosmosHub: ${error?.message || 'kesalahan jaringan'}` } }, 502);
  }
}

async function assetResponse(request, env, path, cacheControl = 'no-store, max-age=0') {
  const url = new URL(request.url);
  url.pathname = path;
  const assetRequest = new Request(url.toString(), request);
  const response = await env.ASSETS.fetch(assetRequest);
  const headers = new Headers(response.headers);
  Object.entries(securityHeaders()).forEach(([key, value]) => headers.set(key, value));
  headers.set('cache-control', cacheControl);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function isProtectedAsset(pathname) {
  if (pathname === '/app' || pathname === '/app.html' || pathname === '/beta' || pathname === '/beta.html') return true;
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
        serverSideGate: true
      });
    }

    if (url.pathname === '/api/auth/login') return handleLogin(request, env);
    if (url.pathname === '/api/auth/reset-password') return handlePasswordReset(request, env);
    if (url.pathname === '/api/auth/logout') return handleLogout(request);

    const session = await currentSession(request, env);

    if (url.pathname === '/api/auth/me') {
      if (!session) return json({ authenticated: false }, 401);
      return json({ authenticated: true, user: { email: session.email }, expiresAt: session.exp });
    }

    if (url.pathname === '/api/ai-proxy') return handleProxy(request, env, session);
    if (url.pathname === '/api/metrics/ai') return handleMetrics(request, env, session);

    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/login' || url.pathname === '/login.html') {
      // Fetch extensionless asset routes. Cloudflare Pages redirects /index.html to /
      // and /app.html to /app. Fetching the .html paths from ASSETS here would
      // return those redirects to the browser and can create a redirect loop.
      if (session) return assetResponse(request, env, '/app');
      return assetResponse(request, env, '/');
    }

    if (PUBLIC_ASSETS.has(url.pathname)) {
      return assetResponse(request, env, url.pathname, 'public, max-age=3600');
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

    if (isProtectedAsset(url.pathname)) {
      if (!session) {
        const acceptsHtml = request.headers.get('accept')?.includes('text/html');
        return acceptsHtml ? redirect('/') : json({ error: { message: 'Autentikasi diperlukan.' } }, 401);
      }
      return assetResponse(request, env, url.pathname);
    }

    if (!session) return redirect('/');
    return assetResponse(request, env, url.pathname);
  }
};
