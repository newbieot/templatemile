const COSMOS_ENDPOINT = 'https://api.cosmoshub.tech/v1/chat/completions';
const MAX_REQUEST_BYTES = 28 * 1024 * 1024;
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
      'x-content-type-options': 'nosniff',
      ...extraHeaders
    }
  });
}

function conciseHtmlError(text, status) {
  const title = String(text || '').match(/<title>([^<]+)<\/title>/i)?.[1]?.trim();
  if (title) return `${title} (HTTP ${status})`;
  return `Upstream mengembalikan HTML, bukan JSON (HTTP ${status}).`;
}

async function handleProxy(request) {
  if (request.method !== 'POST') {
    return json({ error: { message: 'Method tidak diizinkan.' } }, 405, { allow: 'POST' });
  }

  const length = Number(request.headers.get('content-length') || 0);
  if (length && length > MAX_REQUEST_BYTES) {
    return json({ error: { message: 'Payload terlalu besar. Kurangi halaman per permintaan menjadi 2–4.' } }, 413);
  }

  let input;
  try {
    input = await request.json();
  } catch (_) {
    return json({ error: { message: 'Body harus berupa JSON valid.' } }, 400);
  }

  const apiKey = String(input?.apiKey || '').trim();
  const body = input?.body;
  const model = String(body?.model || '').trim();

  if (!apiKey || apiKey.length < 8 || apiKey.length > 4096) {
    return json({ error: { message: 'API key CosmosHub tidak valid.' } }, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return json({ error: { message: 'Payload API tidak valid.' } }, 400);
  }
  if (!ALLOWED_MODELS.has(model)) {
    return json({ error: { message: `Model CosmosHub tidak diizinkan: ${model || '(kosong)'}.` } }, 400);
  }

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
    try {
      output = JSON.parse(responseText);
    } catch (_) {
      const message = responseText.trim().startsWith('<')
        ? conciseHtmlError(responseText, upstream.status)
        : (responseText.slice(0, 600) || `CosmosHub HTTP ${upstream.status}`);
      output = { error: { message } };
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
    return json({
      error: {
        message: `Cloudflare Worker tidak dapat menghubungi CosmosHub: ${error?.message || 'kesalahan jaringan'}`
      }
    }, 502, { 'x-mile-transport': 'cloudflare-worker' });
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.hostname === 'templatemile.pages.dev') {
      url.hostname = 'mile.posnew.com';
      return Response.redirect(url.toString(), 301);
    }

    if (url.pathname === '/api/health') {
      return json({ ok: true, service: 'mile-cosmos-proxy', version: '20260802-3' });
    }

    if (url.pathname === '/api/ai-proxy') {
      return handleProxy(request);
    }

    return env.ASSETS.fetch(request);
  }
};
