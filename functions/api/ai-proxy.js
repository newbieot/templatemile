const MAX_REQUEST_BYTES = 28 * 1024 * 1024;

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...extraHeaders
    }
  });
}

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::1') return true;
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return true;
  const match = host.match(/^172\.(\d+)\./);
  if (match && Number(match[1]) >= 16 && Number(match[1]) <= 31) return true;
  if (/^(fc|fd|fe80):/i.test(host)) return true;
  return false;
}

function validateEndpoint(value, protocol) {
  const url = new URL(String(value || ''));
  if (url.protocol !== 'https:') throw new Error('Endpoint wajib menggunakan HTTPS.');
  if (url.username || url.password) throw new Error('Endpoint tidak boleh memuat username atau password.');
  if (isPrivateHost(url.hostname)) throw new Error('Endpoint lokal atau private network tidak diizinkan.');
  const path = url.pathname.replace(/\/+$/, '');
  if (protocol === 'anthropic' && !/\/messages$/i.test(path)) throw new Error('Endpoint Anthropic harus berakhir dengan /messages.');
  if (protocol === 'openai' && !/\/chat\/completions$/i.test(path)) throw new Error('Endpoint OpenAI-compatible harus berakhir dengan /chat/completions.');
  return url.toString();
}

export async function onRequestPost(context) {
  const length = Number(context.request.headers.get('content-length') || 0);
  if (length && length > MAX_REQUEST_BYTES) return json({ error: { message: 'Payload terlalu besar.' } }, 413);

  let input;
  try {
    input = await context.request.json();
  } catch (_) {
    return json({ error: { message: 'Body harus berupa JSON valid.' } }, 400);
  }

  const protocol = input?.protocol === 'anthropic' ? 'anthropic' : input?.protocol === 'openai' ? 'openai' : null;
  if (!protocol) return json({ error: { message: 'Format API tidak valid.' } }, 400);
  const apiKey = String(input?.apiKey || '').trim();
  if (!apiKey || apiKey.length < 8 || apiKey.length > 4096) return json({ error: { message: 'API key tidak valid.' } }, 400);
  if (!input?.body || typeof input.body !== 'object' || Array.isArray(input.body)) return json({ error: { message: 'Payload API tidak valid.' } }, 400);

  let endpoint;
  try {
    endpoint = validateEndpoint(input.endpoint, protocol);
  } catch (error) {
    return json({ error: { message: error.message } }, 400);
  }

  const headers = { 'content-type': 'application/json', 'accept': 'application/json' };
  if (protocol === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else {
    headers.authorization = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 115000);
  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(input.body),
      signal: controller.signal,
      redirect: 'error'
    });
    const responseText = await upstream.text();
    const responseHeaders = {
      'x-mile-upstream-status': String(upstream.status),
      'x-mile-request-id': upstream.headers.get('request-id') || upstream.headers.get('x-request-id') || ''
    };
    let output;
    try { output = JSON.parse(responseText); }
    catch (_) { output = upstream.ok ? { content: responseText } : { error: { message: responseText || `Upstream HTTP ${upstream.status}` } }; }
    return json(output, upstream.status, responseHeaders);
  } catch (error) {
    const message = error?.name === 'AbortError' ? 'Provider AI tidak merespons dalam 115 detik.' : `Tidak dapat menghubungi provider AI: ${error.message}`;
    return json({ error: { message } }, 502);
  } finally {
    clearTimeout(timeout);
  }
}

export function onRequest(context) {
  if (context.request.method !== 'POST') return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'POST' });
  return onRequestPost(context);
}
