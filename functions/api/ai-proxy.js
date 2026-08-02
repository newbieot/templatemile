const MAX_REQUEST_BYTES = 28 * 1024 * 1024;
const COSMOS_ENDPOINT = 'https://api.cosmoshub.tech/v1/chat/completions';
const ALLOWED_MODELS = new Set([
  'qwen-3.7-max','gemini-3.5-flash','gemini-3.1-pro','mimo-v2.5','mimo-v2.5-pro',
  'kimi-k2.7-code','glm-5.2','deepseek-v4-pro','deepseek-v4-flash','gpt-5.5',
  'gpt-5.6-luna','gpt-5.6-sol','gpt-5.6-terra','muse-spark-1.1','claude-haiku-4.5',
  'claude-sonnet-4.5','nemotron-3-super','kimi-k3','minimax-m3','minimax-m2.5',
  'deepseek-3.2','gemini-3.6-flash','claude-opus-5','glm-5','qwen-3.8-max-preview',
  'deepseek-v4-flash-0731'
]);

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

function upstreamErrorMessage(payload, status) {
  const raw = payload?.error?.message || payload?.message || payload?.detail || '';
  if (raw) return String(raw);
  if (status === 401 || status === 403) return 'API key CosmosHub ditolak.';
  if (status === 404) return 'Endpoint atau model CosmosHub tidak ditemukan.';
  if (status === 429) return 'Rate limit CosmosHub tercapai.';
  return `CosmosHub HTTP ${status}`;
}

export async function onRequestPost(context) {
  const length = Number(context.request.headers.get('content-length') || 0);
  if (length && length > MAX_REQUEST_BYTES) {
    return json({ error: { message: 'Payload terlalu besar. Kurangi halaman per permintaan menjadi 2–4.' } }, 413);
  }

  let input;
  try {
    input = await context.request.json();
  } catch (_) {
    return json({ error: { message: 'Body harus berupa JSON valid.' } }, 400);
  }

  if (input?.provider !== 'cosmoshub') {
    return json({ error: { message: 'Provider API tidak valid.' } }, 400);
  }

  const apiKey = String(input?.apiKey || '').trim();
  if (!apiKey || apiKey.length < 8 || apiKey.length > 4096) {
    return json({ error: { message: 'API key CosmosHub tidak valid.' } }, 400);
  }

  const body = input?.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: { message: 'Payload API tidak valid.' } }, 400);
  }

  const model = String(body.model || '').trim();
  if (!ALLOWED_MODELS.has(model)) {
    return json({ error: { message: `Model CosmosHub tidak diizinkan: ${model || '(kosong)'}.` } }, 400);
  }

  const headers = {
    authorization: `Bearer ${apiKey}`,
    'content-type': 'application/json',
    accept: 'application/json'
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 115000);
  try {
    const upstream = await fetch(COSMOS_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
      redirect: 'error'
    });

    const responseText = await upstream.text();
    let output;
    try {
      output = JSON.parse(responseText);
    } catch (_) {
      output = upstream.ok
        ? { choices: [{ message: { role: 'assistant', content: responseText } }] }
        : { error: { message: responseText || `CosmosHub HTTP ${upstream.status}` } };
    }

    if (!upstream.ok && (!output.error || !output.error.message)) {
      output = { error: { message: upstreamErrorMessage(output, upstream.status) } };
    }

    return json(output, upstream.status, {
      'x-mile-upstream-status': String(upstream.status),
      'x-mile-request-id': upstream.headers.get('x-request-id') || upstream.headers.get('request-id') || '',
      'x-mile-provider': 'cosmoshub'
    });
  } catch (error) {
    const message = error?.name === 'AbortError'
      ? 'CosmosHub tidak merespons dalam 115 detik.'
      : `Tidak dapat menghubungi CosmosHub: ${error.message}`;
    return json({ error: { message } }, 502);
  } finally {
    clearTimeout(timeout);
  }
}

export function onRequest(context) {
  if (context.request.method !== 'POST') {
    return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'POST' });
  }
  return onRequestPost(context);
}
