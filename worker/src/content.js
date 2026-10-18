// Treści dla gości (O WOMAI, ścieżki, odwiedziny, ciekawostki, dodatkowe
// sekcje). Edytuje je panel administratora, a przechowuje baza KV Cloudflare
// (binding CONTENT), więc zmiana treści nie wymaga zmian w Apps Script.

export const CONTENT_PUBLIC_PATH = '/odkryj-womai/api/content';

const KEY = 'content';
const HISTORY_KEY = 'content-history';
const HISTORY_LIMIT = 20;
const MAX_BYTES = 200000;
// Jak długo goście mogą dostawać starszą kopię po zapisie w panelu.
const PUBLIC_CACHE_SECONDS = 60;

const LIMITS = { short: 120, url: 300, medium: 1000, long: 4000, facts: 100, sections: 30 };

export function emptyContent() {
  return {
    about: { intro: '' },
    paths: [
      { id: 'ciemnosc', title: 'W stronę ciemności', text: '' },
      { id: 'swiatlo', title: 'W stronę światła', text: '' }
    ],
    visit: { address: '', hours: '', tickets: '', website: '' },
    facts: [],
    sections: []
  };
}

function text(value, max, label) {
  const result = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (result.length > max) throw new Error('Pole „' + label + '” jest za długie (najwyżej ' + max + ' znaków).');
  return result;
}

function id(value, prefix, index) {
  const clean = String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);
  return clean || prefix + '-' + (index + 1);
}

// Sprawdza i porządkuje treść przysłaną z panelu. Rzuca błąd z opisem dla ludzi.
export function normalizeContent(input) {
  const src = input && typeof input === 'object' ? input : {};
  const base = emptyContent();

  const about = { intro: text(src.about && src.about.intro, LIMITS.long, 'O WOMAI: wstęp') };

  const paths = base.paths.map((path) => {
    const given = Array.isArray(src.paths) ? src.paths.find((p) => p && p.id === path.id) : null;
    return {
      id: path.id,
      title: text(given && given.title, LIMITS.short, 'Nazwa ścieżki') || path.title,
      text: text(given && given.text, LIMITS.long, path.title)
    };
  });

  const v = src.visit || {};
  const website = text(v.website, LIMITS.url, 'Strona internetowa');
  if (website && !/^https:\/\/[^\s]+$/i.test(website)) {
    throw new Error('Adres strony internetowej musi zaczynać się od https://');
  }
  const visit = {
    address: text(v.address, LIMITS.medium, 'Adres'),
    hours: text(v.hours, LIMITS.medium, 'Godziny otwarcia'),
    tickets: text(v.tickets, LIMITS.medium, 'Bilety'),
    website
  };

  const factsIn = Array.isArray(src.facts) ? src.facts : [];
  if (factsIn.length > LIMITS.facts) throw new Error('Za dużo ciekawostek (najwyżej ' + LIMITS.facts + ').');
  const facts = factsIn.map((f, i) => ({
    id: id(f && f.id, 'ciekawostka', i),
    category: text(f && f.category, LIMITS.short, 'Kategoria ciekawostki ' + (i + 1)),
    title: text(f && f.title, LIMITS.short, 'Tytuł ciekawostki ' + (i + 1)),
    text: text(f && f.text, LIMITS.medium, 'Treść ciekawostki ' + (i + 1)),
    active: !(f && f.active === false)
  }));
  facts.forEach((f, i) => {
    if (f.active && (!f.title || !f.text)) throw new Error('Ciekawostka ' + (i + 1) + ' jest widoczna dla gości, ale nie ma tytułu albo treści.');
  });

  const sectionsIn = Array.isArray(src.sections) ? src.sections : [];
  if (sectionsIn.length > LIMITS.sections) throw new Error('Za dużo dodatkowych sekcji (najwyżej ' + LIMITS.sections + ').');
  const sections = sectionsIn.map((s, i) => ({
    id: id(s && s.id, 'sekcja', i),
    title: text(s && s.title, LIMITS.short, 'Tytuł sekcji ' + (i + 1)),
    text: text(s && s.text, LIMITS.long, 'Treść sekcji ' + (i + 1)),
    active: !(s && s.active === false)
  }));
  sections.forEach((s, i) => {
    if (s.active && (!s.title || !s.text)) throw new Error('Sekcja ' + (i + 1) + ' jest widoczna dla gości, ale nie ma tytułu albo treści.');
  });

  const content = { about, paths, visit, facts, sections };
  if (JSON.stringify(content).length > MAX_BYTES) throw new Error('Treści są za długie, skróć je.');
  return content;
}

// Wersja dla gości: tylko widoczne ciekawostki i sekcje. Pole facts ma ten
// sam kształt co dawny plik data/facts.json.
export function publicView(content) {
  return {
    ok: true,
    about: content.about,
    paths: content.paths,
    visit: content.visit,
    facts: content.facts.filter((f) => f.active),
    sections: content.sections.filter((s) => s.active)
  };
}

async function readDoc(env, cacheTtl) {
  const options = cacheTtl ? { type: 'json', cacheTtl } : { type: 'json' };
  const doc = await env.CONTENT.get(KEY, options);
  if (doc && doc.content) return doc;
  return { content: emptyContent(), version: 0, updatedAt: '', updatedBy: '' };
}

function json(status, data, extraHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...(extraHeaders || {}) }
  });
}

export async function handlePublicContent(request, env) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return json(405, { ok: false, error: 'Niedozwolona metoda.' });
  if (!env.CONTENT) return json(503, { ok: false, error: 'Brak bazy treści.' });
  const doc = await readDoc(env, PUBLIC_CACHE_SECONDS);
  return json(200, publicView(doc.content), { 'Cache-Control': 'public, max-age=' + PUBLIC_CACHE_SECONDS });
}

// Akcje panelu: content (odczyt i zapis), contentHistory, contentRestore.
// Zwraca null, gdy akcja nie dotyczy treści.
export async function handleContentAction(action, request, env, email, role) {
  if (!['content', 'contentHistory', 'contentRestore'].includes(action)) return null;
  if (!env.CONTENT) return json(503, { ok: false, error: 'Brak bazy treści w konfiguracji Workera.' });

  if (action === 'content' && request.method === 'GET') {
    return json(200, { ok: true, ...(await readDoc(env)) });
  }

  if (action === 'content' && request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch (error) { return json(400, { ok: false, error: 'Niepoprawne dane.' }); }
    let content;
    try { content = normalizeContent(body && body.content); } catch (error) { return json(400, { ok: false, error: error.message }); }
    const current = await readDoc(env);
    if (Number(body.baseVersion) !== current.version) {
      return json(409, { ok: false, error: 'W międzyczasie ktoś inny zapisał treści (' + (current.updatedBy || 'nieznana osoba') + '). Twoje zmiany nie zostały zapisane. Skopiuj je, odśwież stronę i wprowadź ponownie.' });
    }
    return json(200, { ok: true, ...(await writeDoc(env, current, content, email)) });
  }

  if (action === 'contentHistory' && request.method === 'GET') {
    const history = (await env.CONTENT.get(HISTORY_KEY, { type: 'json' })) || [];
    return json(200, { ok: true, versions: history.map((h) => ({ version: h.version, updatedAt: h.updatedAt, updatedBy: h.updatedBy })) });
  }

  if (action === 'contentRestore' && request.method === 'POST') {
    if (role !== 'superadmin') return json(403, { ok: false, error: 'Przywracanie wersji wymaga roli superadmin.' });
    let body;
    try { body = await request.json(); } catch (error) { return json(400, { ok: false, error: 'Niepoprawne dane.' }); }
    const history = (await env.CONTENT.get(HISTORY_KEY, { type: 'json' })) || [];
    const old = history.find((h) => h.version === Number(body && body.version));
    if (!old) return json(404, { ok: false, error: 'Nie ma takiej wersji.' });
    const current = await readDoc(env);
    return json(200, { ok: true, ...(await writeDoc(env, current, normalizeContent(old.content), email)) });
  }

  return json(405, { ok: false, error: 'Niedozwolona metoda.' });
}

async function writeDoc(env, current, content, email) {
  const doc = { content, version: current.version + 1, updatedAt: new Date().toISOString(), updatedBy: email };
  if (current.version > 0) {
    const history = (await env.CONTENT.get(HISTORY_KEY, { type: 'json' })) || [];
    history.unshift(current);
    await env.CONTENT.put(HISTORY_KEY, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
  }
  await env.CONTENT.put(KEY, JSON.stringify(doc));
  return doc;
}
