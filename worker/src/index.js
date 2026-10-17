// Pośrednik między stroną a Apps Script.
//
// 1. Panel administratora (/odkryj-womai/admin/api/…): rozpoznaje osobę po
//    logowaniu Cloudflare Access, ustala jej rolę z listy adresów e-mail
//    i dokłada do zapytania właściwy token. Tokeny nie trafiają do przeglądarki.
// 2. Pytania dla gości (/odkryj-womai/api/guest): publiczna kopia akcji guest,
//    trzymana kilka minut w pamięci Cloudflare, żeby duża grupa gości naraz
//    nie przekroczyła limitu jednoczesnych wywołań Apps Script.

const API_PREFIX = '/odkryj-womai/admin/api/';
const GUEST_PATH = '/odkryj-womai/api/guest';

// Jak długo kopia pytań jest uznawana za świeżą.
const GUEST_FRESH_SECONDS = 5 * 60;
// Jak długo trzymamy ostatnią dobrą kopię na wypadek awarii Apps Script.
const GUEST_STALE_SECONDS = 30 * 24 * 60 * 60;
const GUEST_UPSTREAM_TIMEOUT_MS = 8000;
// Akcje, po których kopia pytań w tym centrum danych jest od razu odświeżana.
const ACTIONS_CHANGING_QUESTIONS = ['upsertRecord', 'save', 'deleteRecord', 'dedupeRecords', 'syncFormResponses'];

// Zapasowa ostatnia dobra kopia w pamięci instancji.
let guestMemoryCopy = null;

// Akcja panelu -> najniższa rola, która może ją wykonać.
const ACTIONS = {
  health: 'admin',
  records: 'admin',
  stats: 'admin',
  upsertRecord: 'admin',
  save: 'superadmin',
  deleteRecord: 'superadmin',
  syncStatus: 'superadmin',
  syncFormResponses: 'superadmin',
  dedupePreview: 'superadmin',
  dedupeRecords: 'superadmin'
};

const CERTS_TTL_MS = 60 * 60 * 1000;
let certsCache = { domain: '', keys: null, fetchedAt: 0 };

function json(status, data) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function base64UrlToBytes(value) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJsonPart(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}

async function getAccessKeys(teamDomain, forceRefresh) {
  const fresh = certsCache.domain === teamDomain && Date.now() - certsCache.fetchedAt < CERTS_TTL_MS;
  if (certsCache.keys && fresh && !forceRefresh) return certsCache.keys;

  const response = await fetch('https://' + teamDomain + '/cdn-cgi/access/certs');
  if (!response.ok) throw new Error('Nie udało się pobrać kluczy Cloudflare Access.');
  const body = await response.json();
  certsCache = { domain: teamDomain, keys: body.keys || [], fetchedAt: Date.now() };
  return certsCache.keys;
}

// Zwraca adres e-mail z poprawnie podpisanego tokenu Access albo null.
export async function verifyAccessJwt(token, env) {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  let header;
  let payload;
  try {
    header = decodeJsonPart(parts[0]);
    payload = decodeJsonPart(parts[1]);
  } catch (error) {
    return null;
  }
  if (header.alg !== 'RS256' || !header.kid) return null;

  let keys = await getAccessKeys(env.ACCESS_TEAM_DOMAIN, false);
  let jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    // Cloudflare co jakiś czas wymienia klucze.
    keys = await getAccessKeys(env.ACCESS_TEAM_DOMAIN, true);
    jwk = keys.find((key) => key.kid === header.kid);
  }
  if (!jwk) return null;

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const signed = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, base64UrlToBytes(parts[2]), signed);
  if (!valid) return null;

  const now = Math.floor(Date.now() / 1000);
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(env.ACCESS_AUD)) return null;
  if (payload.iss !== 'https://' + env.ACCESS_TEAM_DOMAIN) return null;
  if (typeof payload.exp !== 'number' || payload.exp <= now) return null;
  if (typeof payload.nbf === 'number' && payload.nbf > now + 60) return null;
  if (!payload.email) return null;

  return String(payload.email).trim().toLowerCase();
}

function emailList(value) {
  return String(value || '')
    .split(/[,;\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function roleFor(email, env) {
  if (emailList(env.SUPERADMINS).includes(email)) return 'superadmin';
  if (emailList(env.ADMINS).includes(email)) return 'admin';
  return null;
}

function roleAllows(role, required) {
  return role === 'superadmin' || required === 'admin';
}

async function forwardToAppsScript(request, env, action, role) {
  const token = role === 'superadmin' ? env.SUPERADMIN_TOKEN : env.ADMIN_TOKEN;
  if (!token) return json(500, { ok: false, error: 'Brak tokenu roli ' + role + ' w konfiguracji Workera.' });

  const url = new URL(env.APPS_SCRIPT_URL);
  url.searchParams.set('action', action);
  url.searchParams.set('token', token);

  const init = { method: request.method, headers: { 'Accept': 'application/json' } };
  if (request.method === 'POST') {
    init.headers['Content-Type'] = 'text/plain;charset=utf-8';
    init.body = await request.text();
  }

  let upstream;
  try {
    upstream = await fetch(url.toString(), init);
  } catch (error) {
    return json(502, { ok: false, error: 'Brak połączenia z Apps Script.' });
  }

  const text = await upstream.text();
  try {
    JSON.parse(text);
  } catch (error) {
    return json(502, { ok: false, error: 'Apps Script zwrócił niepoprawną odpowiedź.' });
  }
  return new Response(text, {
    status: upstream.ok ? 200 : 502,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

function guestCacheKeys(requestUrl) {
  const base = new URL(GUEST_PATH, requestUrl.origin).toString();
  return {
    fresh: new Request(base + '?copy=fresh', { method: 'GET' }),
    stale: new Request(base + '?copy=last-good', { method: 'GET' })
  };
}

function guestResponse(body, source, fetchedAt, method) {
  return new Response(method === 'HEAD' ? null : body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Womai-Source': source,
      'X-Womai-Fetched-At': fetchedAt
    }
  });
}

function cacheEntry(body, fetchedAt, maxAge) {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=' + maxAge,
      'X-Womai-Fetched-At': fetchedAt
    }
  });
}

// Pobiera akcję guest z Apps Script. Zwraca tekst JSON albo null, gdy
// odpowiedź nie nadaje się do pokazania gościom.
async function fetchGuestFromAppsScript(env) {
  const url = new URL(env.APPS_SCRIPT_URL);
  url.searchParams.set('action', 'guest');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GUEST_UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: controller.signal
    });
    if (!upstream.ok) return null;
    const text = await upstream.text();
    const parsed = JSON.parse(text);
    if (!parsed || parsed.ok !== true || !parsed.data || !Array.isArray(parsed.data.questions)) return null;
    if (parsed.data.questions.length === 0) return null;
    return text;
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function handleGuest(request, env, ctx, cache) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json(405, { ok: false, error: 'Niedozwolona metoda.' });
  }

  const keys = guestCacheKeys(new URL(request.url));

  const cached = await cache.match(keys.fresh);
  if (cached) {
    return guestResponse(await cached.text(), 'cache', cached.headers.get('X-Womai-Fetched-At') || '', request.method);
  }

  const body = await fetchGuestFromAppsScript(env);
  if (body) {
    const fetchedAt = new Date().toISOString();
    guestMemoryCopy = { body, fetchedAt };
    ctx.waitUntil(Promise.all([
      cache.put(keys.fresh, cacheEntry(body, fetchedAt, GUEST_FRESH_SECONDS)),
      cache.put(keys.stale, cacheEntry(body, fetchedAt, GUEST_STALE_SECONDS))
    ]).catch(() => {}));
    return guestResponse(body, 'apps-script', fetchedAt, request.method);
  }

  // Apps Script nie odpowiedział poprawnie: oddajemy ostatnią dobrą kopię.
  const stale = await cache.match(keys.stale);
  if (stale) {
    return guestResponse(await stale.text(), 'last-good', stale.headers.get('X-Womai-Fetched-At') || '', request.method);
  }
  if (guestMemoryCopy) {
    return guestResponse(guestMemoryCopy.body, 'last-good', guestMemoryCopy.fetchedAt, request.method);
  }

  return json(502, { ok: false, error: 'Nie udało się pobrać pytań z Apps Script.' });
}

// Po zmianie pytań w panelu kasuje świeżą kopię w tym centrum danych, żeby
// osoba sprawdzająca quiz od razu zobaczyła zmianę. Ostatnia dobra kopia zostaje.
async function forgetFreshGuestCopy(requestUrl, cache) {
  try {
    await cache.delete(guestCacheKeys(requestUrl).fresh);
  } catch (error) {
    // Bez znaczenia: kopia i tak wygaśnie po kilku minutach.
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cache = globalThis.caches && caches.default;

    if (url.pathname.replace(/\/+$/, '') === GUEST_PATH) {
      return handleGuest(request, env, ctx, cache);
    }

    if (!url.pathname.startsWith(API_PREFIX)) return json(404, { ok: false, error: 'Nie znaleziono.' });
    const action = url.pathname.slice(API_PREFIX.length).replace(/\/+$/, '');

    if (request.method !== 'GET' && request.method !== 'POST') {
      return json(405, { ok: false, error: 'Niedozwolona metoda.' });
    }

    let email;
    try {
      email = await verifyAccessJwt(request.headers.get('Cf-Access-Jwt-Assertion'), env);
    } catch (error) {
      return json(503, { ok: false, error: 'Nie udało się sprawdzić logowania. Spróbuj ponownie.' });
    }
    if (!email) return json(401, { ok: false, error: 'Brak ważnego logowania. Odśwież stronę.' });

    const role = roleFor(email, env);
    if (!role) {
      return json(403, { ok: false, email, error: 'Adres ' + email + ' nie ma dostępu do panelu.' });
    }

    if (action === 'me') return json(200, { ok: true, email, role });

    const required = ACTIONS[action];
    if (!required) return json(404, { ok: false, error: 'Nieznana akcja.' });
    if (!roleAllows(role, required)) {
      return json(403, { ok: false, error: 'Ta operacja wymaga roli superadmin.' });
    }

    const response = await forwardToAppsScript(request, env, action, role);
    if (response.ok && ACTIONS_CHANGING_QUESTIONS.includes(action)) {
      ctx.waitUntil(forgetFreshGuestCopy(url, cache));
    }
    return response;
  }
};
