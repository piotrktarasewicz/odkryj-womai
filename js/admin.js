(function () {
  'use strict';

  const config = window.WOMAI_CONFIG || {};
  const api = window.WOMAI_API;
  const LEGACY_STORAGE_KEY = config.admin?.legacyStorageKey || 'womai_admin_v5_connection';
  const BASE_CATEGORIES = ['ciemność', 'światło', 'eksperymenty', 'womai', 'przewodnicy'];
  const MIN_PER_CATEGORY = config.guest?.categoryQuestionCounts || {};
  // Statusy, przy których serwer pokazuje pytanie gościom (buildGuestPayload_ w Apps Script).
  const GUEST_STATUSES = ['nowe', 'gotowe', 'aktywne'];
  const EDITABLE = ['kategoria', 'tresc_pytania', 'odpowiedz_1', 'odpowiedz_2', 'odpowiedz_3', 'poprawna_odpowiedz', 'wyjasnienie', 'uwagi', 'rdzen'];
  const TYPED = ['tresc_pytania', 'odpowiedz_1', 'odpowiedz_2', 'odpowiedz_3', 'wyjasnienie', 'uwagi'];

  const STATE_TEXT = {
    new: 'Nieopublikowane. Goście go nie widzą.',
    chk: 'Czeka na sprawdzenie. Goście go nie widzą.',
    pub: 'Opublikowane w quizie.',
    rej: 'Odrzucone. Goście go nie widzą.'
  };
  const BADGE = {
    new: ['Nieopublikowane', 'badge-new'],
    chk: ['Do sprawdzenia', 'badge-chk'],
    pub: ['W quizie', 'badge-pub'],
    rej: ['Odrzucone', 'badge-rej']
  };
  // Jak każda czynność zapisuje się w kolumnach arkusza.
  const FLAGS = {
    publish: { status: 'aktywne', gotowe_redakcyjnie: 'tak', aktywne: 'tak' },
    hold: { status: 'do-sprawdzenia', gotowe_redakcyjnie: 'nie', aktywne: 'nie' },
    reject: { status: 'odrzucone', gotowe_redakcyjnie: 'nie', aktywne: 'nie' },
    restore: { status: 'nowe', gotowe_redakcyjnie: 'nie', aktywne: 'nie' }
  };

  const state = {
    role: null, email: '', records: [], loaded: false,
    view: 'home', returnView: 'home', filter: 'all', search: '',
    current: null, draft: null, isNew: false, queue: null, queueIndex: 0,
    busy: false, sync: null, dedupe: null, preview: false
  };

  const view = document.getElementById('view');
  const notice = document.getElementById('notice');
  const account = document.getElementById('account');
  const toolsTab = document.getElementById('toolsTab');

  // ---------- Pomocnicze ----------

  function esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
  function low(v) { return String(v ?? '').trim().toLowerCase(); }
  function yes(v) { return low(v) === 'tak'; }
  function copy(v) { return JSON.parse(JSON.stringify(v)); }
  function isSuperadmin() { return state.role === 'superadmin'; }
  function plural(n, one, few, many) {
    if (n === 1) return one;
    const last = n % 10, lastTwo = n % 100;
    return (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) ? few : many;
  }
  function questions(n) { return n + ' ' + plural(n, 'pytanie', 'pytania', 'pytań'); }
  function formatDate(v) {
    const d = new Date(v);
    return v && !isNaN(d.getTime()) ? d.toLocaleString('pl-PL', { dateStyle: 'medium', timeStyle: 'short' }) : (v || '—');
  }

  // Treść wstawiana z opóźnieniem, żeby czytnik ekranu ogłosił ją ponownie.
  let noticeTimer = 0;
  function setNotice(text, kind) {
    window.clearTimeout(noticeTimer);
    notice.className = 'notice' + (text ? ' ' + (kind || 'ok') : '');
    notice.textContent = '';
    if (text) noticeTimer = window.setTimeout(() => { notice.textContent = text; }, 30);
  }

  function toRecordShape(raw) {
    return {
      id: String(raw.id || ''), data_dodania: String(raw.data_dodania || ''), data_aktualizacji: String(raw.data_aktualizacji || ''), autor: String(raw.autor || ''), zrodlo: String(raw.zrodlo || ''), wersja: String(raw.wersja || '1'), kategoria: String(raw.kategoria || ''), typ_pytania: String(raw.typ_pytania || 'jednokrotny-wybor'), tresc_pytania: String(raw.tresc_pytania || ''), odpowiedz_1: String(raw.odpowiedz_1 || ''), odpowiedz_2: String(raw.odpowiedz_2 || ''), odpowiedz_3: String(raw.odpowiedz_3 || ''), liczba_odpowiedzi: String(raw.liczba_odpowiedzi || (raw.odpowiedz_3 ? '3' : '2')), poprawna_odpowiedz: String(raw.poprawna_odpowiedz || '1'), wyjasnienie: String(raw.wyjasnienie || ''), uwagi: String(raw.uwagi || ''), status: String(raw.status || 'nowe'), gotowe_redakcyjnie: String(raw.gotowe_redakcyjnie || 'nie'), aktywne: String(raw.aktywne || 'nie'), rdzen: String(raw.rdzen || 'nie')
    };
  }

  function blankRecord() {
    const now = new Date().toISOString();
    return toRecordShape({ id: 'pytanie-' + Date.now().toString(36), data_dodania: now, data_aktualizacji: now, autor: isSuperadmin() ? state.email : '', zrodlo: 'panel', status: 'nowe', liczba_odpowiedzi: '2' });
  }

  // ---------- Stan pytania (te same reguły co serwer) ----------

  function stateOf(r) {
    const status = low(r.status);
    if (status === 'odrzucone') return 'rej';
    if (status === 'do-sprawdzenia') return 'chk';
    if (yes(r.aktywne) && yes(r.gotowe_redakcyjnie)) return 'pub';
    return 'new';
  }

  function answersOf(r) {
    return [r.odpowiedz_1, r.odpowiedz_2, r.odpowiedz_3].filter((a) => String(a || '').trim() !== '');
  }

  // Powody, dla których gość nie zobaczy pytania mimo publikacji.
  function problems(r) {
    const list = [];
    if (!String(r.tresc_pytania || '').trim()) list.push('brak treści pytania');
    const count = answersOf(r).length;
    if (count < 2) list.push('mniej niż dwie odpowiedzi');
    const correct = Number(r.poprawna_odpowiedz) - 1;
    if (count >= 2 && !(correct >= 0 && correct < count)) list.push('nie zaznaczono poprawnej odpowiedzi');
    if (!String(r.wyjasnienie || '').trim()) list.push('brak wyjaśnienia po odpowiedzi');
    if (!GUEST_STATUSES.includes(low(r.status)) && stateOf(r) === 'pub') list.push('nieprawidłowy status w arkuszu');
    return list;
  }

  function isVisible(r) {
    return stateOf(r) === 'pub' && problems(r).length === 0;
  }

  function categories() {
    const found = state.records.map((r) => r.kategoria).filter(Boolean);
    return Array.from(new Set(BASE_CATEGORIES.concat(found)));
  }

  function tasks() {
    const byDate = (a, b) => String(a.data_dodania).localeCompare(String(b.data_dodania));
    return [
      { key: 'new', title: 'Nowe, jeszcze nieopublikowane', text: 'Przeczytaj, popraw i zdecyduj: do quizu czy nie.', ids: state.records.filter((r) => stateOf(r) === 'new').sort(byDate).map((r) => r.id) },
      { key: 'chk', title: 'Czekają na sprawdzenie', text: 'Pytania odłożone wcześniej do ponownego przejrzenia.', ids: state.records.filter((r) => stateOf(r) === 'chk').sort(byDate).map((r) => r.id) },
      { key: 'fix', title: 'Opublikowane, ale goście ich nie widzą', text: 'Czegoś brakuje, np. wyjaśnienia po odpowiedzi.', ids: state.records.filter((r) => stateOf(r) === 'pub' && !isVisible(r)).map((r) => r.id) }
    ];
  }

  // ---------- Komunikacja z serwerem ----------

  async function requestJson(method, action, body) {
    return api.requestAdminJson(method, action, body);
  }

  async function loadRecords() {
    const json = await requestJson('GET', 'records');
    state.records = (json.records || []).map(toRecordShape);
    state.loaded = true;
  }

  async function loadSyncStatus() {
    if (!isSuperadmin()) return;
    try {
      const json = await requestJson('GET', 'syncStatus');
      state.sync = json.sync || null;
    } catch (error) {
      state.sync = { error: error.message };
    }
    if (state.view === 'home' || state.view === 'tools') render();
  }

  async function signIn() {
    // Panel nie przechowuje już adresu endpointu ani tokenu w przeglądarce.
    try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch (error) {}
    view.innerHTML = '<p class="loading">Wczytywanie pytań…</p>';
    try {
      const me = await requestJson('GET', 'me');
      state.email = me.email;
      state.role = me.role;
      account.textContent = me.email + ' · ' + (isSuperadmin() ? 'superadmin' : 'admin');
      toolsTab.hidden = !isSuperadmin();
      await loadRecords();
      render();
      loadSyncStatus();
    } catch (error) {
      account.textContent = 'Nie rozpoznano konta';
      view.innerHTML = '';
      setNotice(error.message, 'bad');
    }
  }

  // ---------- Widoki ----------

  function render(focusHeading) {
    document.querySelectorAll('.tab').forEach((tab) => {
      const active = tab.dataset.view === (state.view === 'edit' ? state.returnView : state.view);
      if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
    });
    if (!state.loaded) return;
    if (state.view === 'home') renderHome();
    else if (state.view === 'all') renderAll();
    else if (state.view === 'tools') renderTools();
    else renderEditor();
    if (focusHeading) {
      const heading = view.querySelector('h2');
      if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus(); }
    }
  }

  function renderHome() {
    const cats = categories().filter((c) => MIN_PER_CATEGORY[c] || state.records.some((r) => r.kategoria === c && isVisible(r)));
    const visible = state.records.filter(isVisible);
    const core = visible.filter((r) => yes(r.rdzen)).length;

    let html = '<h2>Do zrobienia</h2><div class="stats">';
    cats.forEach((c) => {
      const n = visible.filter((r) => r.kategoria === c).length;
      const min = Number(MIN_PER_CATEGORY[c] || 0);
      html += '<div class="stat"><div class="stat-label">W quizie · ' + esc(c) + '</div><div class="stat-value">' + questions(n) + '</div>' +
        (min && n < min ? '<div class="small hint-warn">Za mało: quiz potrzebuje co najmniej ' + min + '.</div>' : '') + '</div>';
    });
    html += '<div class="stat"><div class="stat-label">Pytania podstawowe</div><div class="stat-value">' + core + ' z ' + visible.length + '</div>' +
      '<div class="small muted">' + (visible.length && core === visible.length ? 'Wszystkie opublikowane są podstawowe.' : 'Quiz losuje najpierw z podstawowych.') + '</div></div>';
    html += '</div>';

    if (isSuperadmin()) html += importCard(true);

    tasks().forEach((t) => {
      html += '<div class="card task"><div><h3>' + esc(t.title) + ' <span class="muted">(' + t.ids.length + ')</span></h3><p class="muted small">' + (t.ids.length ? esc(t.text) : 'Nic do zrobienia.') + '</p></div>' +
        (t.ids.length ? '<button type="button" class="btn btn-primary" data-action="start" data-task="' + t.key + '">Przejrzyj po kolei</button>' : '<span class="task-done">Gotowe</span>') + '</div>';
    });
    view.innerHTML = html;
  }

  function importCard(compact) {
    const sync = state.sync;
    if (compact && sync && !sync.error && !sync.pendingResponses) return '';
    let body;
    if (!sync) body = '<p class="muted small">Sprawdzanie formularza…</p>';
    else if (sync.error) body = '<p class="small hint-warn">Nie udało się sprawdzić formularza: ' + esc(sync.error) + '</p>';
    else if (!sync.pendingResponses) body = '<p class="muted small">Brak nowych zgłoszeń. Przeniesiono już ' + questions(sync.importedResponses || 0) + '.</p>';
    else body = '<p class="small">Czeka ' + questions(sync.pendingResponses) + ' z formularza. Po przeniesieniu znajdziesz je w „Nowe, jeszcze nieopublikowane”. Powtórzone pytania zostaną pominięte.</p>';

    const button = sync && sync.pendingResponses
      ? '<button type="button" class="btn btn-primary" data-action="import">Przenieś do panelu</button>'
      : (compact ? '' : '<button type="button" class="btn" data-action="refresh-sync">Sprawdź ponownie</button>');
    return '<div class="card task"><div><h3>Nowe zgłoszenia z formularza</h3>' + body + '</div>' + button + '</div>';
  }

  function renderAll() {
    const counts = { all: state.records.length, new: 0, chk: 0, pub: 0, rej: 0 };
    state.records.forEach((r) => { counts[stateOf(r)] += 1; });
    const chips = [['all', 'Wszystkie'], ['new', 'Nieopublikowane'], ['chk', 'Do sprawdzenia'], ['pub', 'W quizie'], ['rej', 'Odrzucone']];
    view.innerHTML = '<h2>Wszystkie pytania</h2>' +
      '<div class="toolbar"><label class="visually-hidden" for="search">Szukaj w treści pytań</label><input id="search" type="search" placeholder="Szukaj w treści pytań" value="' + esc(state.search) + '" />' +
      '<button type="button" class="btn btn-primary" data-action="new">Dodaj pytanie</button></div>' +
      '<div class="chips" role="group" aria-label="Pokaż pytania">' + chips.map(([k, t]) => '<button type="button" class="chip" data-action="filter" data-filter="' + k + '" aria-pressed="' + (state.filter === k) + '">' + t + ' (' + counts[k] + ')</button>').join('') + '</div>' +
      '<div id="listArea"></div>';
    renderList();
  }

  function renderList() {
    const area = document.getElementById('listArea');
    if (!area) return;
    const search = low(state.search);
    const items = state.records.filter((r) => (state.filter === 'all' || stateOf(r) === state.filter) && (!search || low(r.tresc_pytania).includes(search)));
    if (!items.length) { area.innerHTML = '<p class="muted">Brak pytań do pokazania.</p>'; return; }
    area.innerHTML = '<ul class="list">' + items.map((r) => {
      const s = stateOf(r), issues = s === 'pub' ? problems(r) : [];
      return '<li><button type="button" class="list-item" data-action="open" data-id="' + esc(r.id) + '"><span><span class="list-title">' + esc(r.tresc_pytania || '(bez treści)') + '</span><br>' +
        '<span class="small muted">' + esc(r.kategoria || 'bez kategorii') + (yes(r.rdzen) ? ' · podstawowe' : '') + '</span>' +
        (issues.length ? '<br><span class="small hint-warn">Goście go nie widzą: ' + esc(issues.join(', ')) + '.</span>' : '') +
        '</span><span class="badge ' + BADGE[s][1] + '">' + BADGE[s][0] + '</span></button></li>';
    }).join('') + '</ul>';
  }

  function renderTools() {
    let html = '<h2>Narzędzia</h2>' + importCard(false);

    html += '<div class="card"><h3>Powtórzone pytania</h3><p class="small">Szuka pytań o tej samej treści. Z każdej grupy zostaje najlepsza wersja (opublikowana, z wyjaśnieniem), pozostałe są usuwane z arkusza.</p>';
    const d = state.dedupe;
    if (!d) html += '<button type="button" class="btn" data-action="dedupe-preview">Sprawdź, czy są powtórzenia</button>';
    else if (!d.duplicatesToRemove || !d.duplicatesToRemove.length) html += '<p class="task-done">Nie ma powtórzonych pytań.</p>';
    else {
      html += '<ul class="small">' + d.duplicateGroups.map((g) => '<li><strong>' + esc(g.question) + '</strong>: zostaje 1, do usunięcia ' + g.duplicateCount + '</li>').join('') + '</ul>' +
        '<button type="button" class="btn btn-danger" data-action="dedupe-run">Usuń powtórzenia (' + d.duplicatesToRemove.length + ')</button> <span class="small muted">Tego nie da się cofnąć.</span>';
    }
    html += '</div>';

    html += '<div class="card"><h3>Zapasowy zestaw pytań</h3><p class="small">Gdy serwer Google nie odpowiada, quiz korzysta z pliku <code>data/fallback-questions.json</code>. Ten przycisk pobiera aktualne pytania z quizu w tym formacie. Żeby zadziałały, plik trzeba podmienić w repozytorium.</p>' +
      '<button type="button" class="btn" data-action="export">Pobierz plik</button></div>';
    view.innerHTML = html;
  }

  function currentRecord() {
    return state.isNew ? null : state.records.find((r) => r.id === state.current) || null;
  }

  function isDirty() {
    if (!state.draft) return false;
    if (state.isNew) return TYPED.some((k) => String(state.draft[k] || '').trim() !== '') || yes(state.draft.rdzen);
    const original = currentRecord();
    return !!original && EDITABLE.some((k) => String(state.draft[k] ?? '') !== String(original[k] ?? ''));
  }

  function renderEditor() {
    const r = currentRecord() || state.draft;
    const d = state.draft;
    const s = state.isNew ? 'new' : stateOf(r);
    const issues = s === 'pub' ? problems(r) : [];
    const cats = categories();

    let html = '<div class="editor-top"><button type="button" class="btn" data-action="back">← Wróć</button>' +
      (state.queue ? '<span class="muted">Pytanie ' + (state.queueIndex + 1) + ' z ' + state.queue.length + '</span>' : '') + '</div>';

    html += '<div class="card"><h2>' + (state.isNew ? 'Nowe pytanie' : 'Pytanie') + '</h2>' +
      '<p class="muted">Teraz: <strong>' + (state.isNew ? 'Jeszcze niezapisane.' : STATE_TEXT[s]) + '</strong></p>' +
      (issues.length ? '<div class="box-warn">Goście go nie widzą: ' + esc(issues.join(', ')) + '.</div>' : '');

    html += '<div class="field"><label for="f-kategoria">Kategoria</label><select id="f-kategoria" data-field="kategoria"><option value="">Wybierz kategorię</option>' +
      cats.map((c) => '<option value="' + esc(c) + '"' + (d.kategoria === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div>';
    html += '<div class="field"><label for="f-tresc">Treść pytania</label><textarea id="f-tresc" data-field="tresc_pytania">' + esc(d.tresc_pytania) + '</textarea></div>';
    html += '<fieldset class="field fieldset"><legend class="label">Odpowiedzi</legend><p class="help">Zaznacz kółko przy poprawnej odpowiedzi. Trzecia odpowiedź jest nieobowiązkowa.</p><div class="answers">' +
      [1, 2, 3].map((n) => '<div class="answer"><input type="radio" name="correct" id="f-ok-' + n + '" value="' + n + '" data-field="poprawna_odpowiedz"' + (String(d.poprawna_odpowiedz) === String(n) ? ' checked' : '') + ' aria-label="Odpowiedź ' + n + ' jest poprawna" />' +
        '<input type="text" id="f-odp-' + n + '" data-field="odpowiedz_' + n + '" value="' + esc(d['odpowiedz_' + n]) + '" aria-label="Odpowiedź ' + n + '" placeholder="Odpowiedź ' + n + (n === 3 ? ' (nieobowiązkowa)' : '') + '" /></div>').join('') +
      '</div></fieldset>';
    html += '<div class="field"><label for="f-wyj">Wyjaśnienie po odpowiedzi</label><p class="help" id="h-wyj">Gość zobaczy je po udzieleniu odpowiedzi. Bez wyjaśnienia pytanie nie trafi do quizu.</p><textarea id="f-wyj" data-field="wyjasnienie" aria-describedby="h-wyj">' + esc(d.wyjasnienie) + '</textarea></div>';
    html += '<div class="field"><div class="check"><input type="checkbox" id="f-rdzen" data-field="rdzen"' + (yes(d.rdzen) ? ' checked' : '') + ' aria-describedby="h-rdzen" /><div><label for="f-rdzen">Pytanie podstawowe</label><p class="help" id="h-rdzen">Quiz losuje najpierw z pytań podstawowych. Pozostałe pojawiają się, gdy podstawowych zabraknie.</p></div></div></div>';
    html += '<div class="field"><label for="f-uwagi">Notatki wewnętrzne</label><p class="help" id="h-uwagi">Widzą je tylko osoby z dostępem do panelu.</p><textarea id="f-uwagi" data-field="uwagi" aria-describedby="h-uwagi">' + esc(d.uwagi) + '</textarea></div>';
    html += '<p><button type="button" class="btn-link" data-action="preview" aria-expanded="' + state.preview + '">' + (state.preview ? 'Ukryj podgląd' : 'Pokaż, jak zobaczy to gość') + '</button></p><div id="previewArea"></div>';
    html += '<div id="dirtyBar"></div>';
    if (!state.isNew) {
      html += '<details class="tech"><summary>Szczegóły techniczne</summary><dl>' +
        '<dt>ID</dt><dd>' + esc(r.id) + '</dd><dt>Autor</dt><dd>' + esc(r.autor || '—') + '</dd><dt>Źródło</dt><dd>' + esc(r.zrodlo || '—') + '</dd>' +
        '<dt>Dodano</dt><dd>' + esc(formatDate(r.data_dodania)) + '</dd><dt>Zmieniono</dt><dd>' + esc(formatDate(r.data_aktualizacji)) + '</dd>' +
        '<dt>W arkuszu</dt><dd>status: ' + esc(r.status || '—') + ', gotowe: ' + esc(r.gotowe_redakcyjnie || '—') + ', aktywne: ' + esc(r.aktywne || '—') + '</dd></dl></details>';
    }
    html += '</div>';

    html += '<div class="card"><h3>Co zrobić z tym pytaniem?</h3><div id="actionError" role="alert"></div><div class="actions">';
    const act = (name, label, text, cls) => '<div class="action"><button type="button" class="btn ' + (cls || '') + '" data-action="' + name + '">' + label + '</button><span class="small muted"' + (name === 'publish' ? ' id="publishText"' : '') + '>' + text + '</span></div>';
    if (s === 'pub' && !state.isNew) {
      html += act('unpublish', 'Wycofaj z quizu', 'Zniknie z quizu, ale nie zostanie usunięte. Trafi do „Czekają na sprawdzenie”.');
    } else if (s === 'rej') {
      html += act('restore', 'Przywróć', 'Wróci do nieopublikowanych. Potem możesz je opublikować.');
    } else {
      html += act('publish', 'Opublikuj w quizie', 'Goście zobaczą je od razu.', 'btn-primary');
      if (state.isNew) html += act('save', 'Zapisz bez publikowania', 'Pytanie trafi do „Nowe, jeszcze nieopublikowane”.');
      if (s === 'new' && !state.isNew) html += act('hold', 'Odłóż do sprawdzenia', 'Wróci w zadaniach jako „Czekają na sprawdzenie”.');
      if (!state.isNew) html += act('reject', 'Odrzuć', 'Nie trafi do quizu. Zostaje w arkuszu, można je przywrócić.');
    }
    html += '</div></div>';

    if (isSuperadmin() && !state.isNew) {
      html += '<div class="card"><h3>Usunięcie</h3><div class="action"><button type="button" class="btn btn-danger" data-action="delete">Usuń na zawsze</button><span class="small muted">Pytanie zniknie z arkusza. Tego nie da się cofnąć. Żeby tylko ukryć pytanie, użyj „Odrzuć”.</span></div></div>';
    }

    view.innerHTML = html;
    updateDirtyUi();
  }

  function updateDirtyUi() {
    const bar = document.getElementById('dirtyBar');
    if (!bar) return;
    const dirty = isDirty();
    const show = dirty && !state.isNew;
    if (show && !bar.firstChild) {
      bar.innerHTML = '<div class="dirty-bar"><span>Masz niezapisane zmiany.</span><span class="buttons"><button type="button" class="btn" data-action="undo">Cofnij</button><button type="button" class="btn btn-primary" data-action="save">Zapisz</button></span></div>';
    } else if (!show) {
      bar.innerHTML = '';
    }
    const publishText = document.getElementById('publishText');
    if (publishText) publishText.textContent = 'Goście zobaczą je od razu.' + (show ? ' Twoje zmiany zapiszą się razem z publikacją.' : '');
    if (state.preview) renderPreview();
  }

  function renderPreview() {
    const area = document.getElementById('previewArea');
    if (!area) return;
    if (!state.preview) { area.innerHTML = ''; return; }
    const r = compactAnswers(state.draft);
    const answers = answersOf(r);
    area.innerHTML = '<div class="preview" aria-label="Podgląd pytania dla gościa"><div class="p-q">' + esc(r.tresc_pytania || '(brak treści pytania)') + '</div>' +
      answers.map((a, i) => {
        const ok = String(i + 1) === String(r.poprawna_odpowiedz);
        return '<div class="p-c' + (ok ? ' ok' : '') + '">' + esc(a) + (ok ? ' <span class="small">(poprawna)</span>' : '') + '</div>';
      }).join('') +
      '<div class="p-e">' + esc(r.wyjasnienie || '(brak wyjaśnienia, gość nie zobaczy tego pytania)') + '</div></div>';
  }

  // ---------- Edycja i zapis ----------

  // Puste odpowiedzi przesuwa na koniec, żeby numer poprawnej odpowiedzi
  // zgadzał się z tym, jak liczy go serwer.
  function compactAnswers(d) {
    const r = copy(d);
    const slots = [1, 2, 3].map((n) => ({ n, text: String(r['odpowiedz_' + n] || '').trim() })).filter((a) => a.text);
    const correctIndex = slots.findIndex((a) => String(a.n) === String(r.poprawna_odpowiedz));
    [1, 2, 3].forEach((n, i) => { r['odpowiedz_' + n] = slots[i] ? slots[i].text : ''; });
    r.poprawna_odpowiedz = correctIndex >= 0 ? String(correctIndex + 1) : '';
    r.liczba_odpowiedzi = String(Math.max(2, slots.length));
    return r;
  }

  function openEditor(id, queue) {
    const r = state.records.find((x) => x.id === id);
    if (!r) return;
    if (state.view !== 'edit') state.returnView = queue ? 'home' : state.view;
    state.current = id;
    state.isNew = false;
    state.draft = copy(r);
    state.queue = queue || null;
    state.queueIndex = queue ? queue.indexOf(id) : 0;
    state.view = 'edit';
    render(true);
  }

  function openNew() {
    if (state.view !== 'edit') state.returnView = state.view;
    state.draft = blankRecord();
    state.current = state.draft.id;
    state.isNew = true;
    state.queue = null;
    state.view = 'edit';
    render(true);
  }

  function confirmLeave() {
    return state.view !== 'edit' || !isDirty() || window.confirm('Masz niezapisane zmiany w tym pytaniu. Wyjść bez zapisywania?');
  }

  function goTo(viewName, message, kind) {
    state.view = viewName;
    state.queue = null;
    state.draft = null;
    state.isNew = false;
    state.preview = false;
    setNotice(message || '', kind);
    render(true);
  }

  function showActionError(text) {
    const box = document.getElementById('actionError');
    if (!box) return setNotice(text, 'bad');
    box.innerHTML = '';
    setTimeout(() => { box.innerHTML = '<div class="box-bad">' + esc(text) + '</div>'; }, 30);
  }

  async function saveRecord(flags) {
    const base = state.isNew ? state.draft : (currentRecord() || {});
    const record = { ...base, ...compactAnswers(state.draft), ...(flags || {}), id: base.id };
    const json = await requestJson('POST', 'upsertRecord', { record });
    const saved = toRecordShape(json.record || record);
    const index = state.records.findIndex((r) => r.id === saved.id);
    if (index >= 0) state.records[index] = saved; else state.records.unshift(saved);
    state.current = saved.id;
    state.isNew = false;
    state.draft = copy(saved);
    return saved;
  }

  function nextInQueue(message) {
    if (state.queue && state.queueIndex + 1 < state.queue.length) {
      setNotice(message);
      openEditor(state.queue[state.queueIndex + 1], state.queue);
      return;
    }
    goTo(state.queue ? 'home' : state.returnView, message + (state.queue ? ' To było ostatnie pytanie w tej grupie.' : ''));
  }

  async function runAction(action) {
    if (state.busy || !state.draft) return;
    const wasDirty = isDirty() && !state.isNew;
    const done = (text) => (wasDirty ? 'Zapisano zmiany i ' + text : text.charAt(0).toUpperCase() + text.slice(1));
    state.busy = true;
    document.body.setAttribute('aria-busy', 'true');
    try {
      if (action === 'save') {
        const wasNew = state.isNew;
        if (!String(state.draft.tresc_pytania || '').trim()) return showActionError('Wpisz treść pytania, zanim zapiszesz.');
        await saveRecord();
        setNotice(wasNew ? 'Zapisano nowe pytanie. Goście go jeszcze nie widzą.' : 'Zapisano zmiany. Stan pytania się nie zmienił.');
        render();
      } else if (action === 'publish') {
        const check = problems({ ...compactAnswers(state.draft), ...FLAGS.publish });
        if (!String(state.draft.kategoria || '').trim()) check.unshift('nie wybrano kategorii');
        if (check.length) return showActionError('Nie można jeszcze opublikować: ' + check.join(', ') + '.');
        await saveRecord(FLAGS.publish);
        nextInQueue(done('opublikowano. Pytanie jest już w quizie.'));
      } else if (action === 'unpublish') {
        await saveRecord(FLAGS.hold);
        setNotice(done('wycofano z quizu. Pytanie czeka na sprawdzenie.'));
        render();
      } else if (action === 'hold') {
        await saveRecord(FLAGS.hold);
        nextInQueue(done('odłożono do sprawdzenia.'));
      } else if (action === 'reject') {
        await saveRecord(FLAGS.reject);
        nextInQueue(done('odrzucono. Pytanie zostaje w arkuszu, można je przywrócić.'));
      } else if (action === 'restore') {
        await saveRecord(FLAGS.restore);
        setNotice(done('przywrócono. Pytanie jest teraz nieopublikowane.'));
        render();
      } else if (action === 'delete') {
        if (!window.confirm('Usunąć to pytanie na zawsze? Tego nie da się cofnąć.')) return;
        await requestJson('POST', 'deleteRecord', { id: state.current });
        state.records = state.records.filter((r) => r.id !== state.current);
        goTo(state.returnView, 'Usunięto pytanie z arkusza.');
      }
    } catch (error) {
      showActionError('Nie zapisano. ' + error.message);
    } finally {
      state.busy = false;
      document.body.removeAttribute('aria-busy');
    }
  }

  async function runTool(action) {
    if (state.busy) return;
    state.busy = true;
    document.body.setAttribute('aria-busy', 'true');
    try {
      if (action === 'import') {
        const json = await requestJson('GET', 'syncFormResponses');
        const sync = json.sync || {};
        await loadRecords();
        state.sync = null;
        let text = 'Przeniesiono ' + questions(sync.imported || 0) + ' z formularza.';
        if (sync.duplicatesSkipped) text += ' Pominięto powtórzone: ' + sync.duplicatesSkipped + '.';
        if (sync.errors && sync.errors.length) text += ' Nie udało się przenieść ' + sync.errors.length + ' (wiersze formularza: ' + sync.errors.map((e) => e.row).join(', ') + ').';
        setNotice(text, sync.errors && sync.errors.length ? 'bad' : 'ok');
        render();
        loadSyncStatus();
      } else if (action === 'refresh-sync') {
        state.sync = null;
        render();
        await loadSyncStatus();
      } else if (action === 'dedupe-preview') {
        const json = await requestJson('GET', 'dedupePreview');
        state.dedupe = json.dedupe || {};
        render();
      } else if (action === 'dedupe-run') {
        if (!window.confirm('Usunąć powtórzone pytania? Tego nie da się cofnąć.')) return;
        const json = await requestJson('GET', 'dedupeRecords');
        await loadRecords();
        state.dedupe = null;
        setNotice('Usunięto powtórzenia: ' + ((json.dedupe && json.dedupe.removed) || 0) + '.');
        render();
      }
    } catch (error) {
      setNotice(error.message, 'bad');
    } finally {
      state.busy = false;
      document.body.removeAttribute('aria-busy');
    }
  }

  function guestExport() {
    const visible = state.records.filter(isVisible);
    return {
      settings: { corePoolSize: visible.filter((r) => yes(r.rdzen)).length, sessionQuestionCount: 4 },
      categories: Array.from(new Set(visible.map((r) => r.kategoria).filter(Boolean))).map((c) => ({ id: c, label: c, active: true })),
      questions: visible.map((r) => ({ id: r.id, categoryId: r.kategoria, prompt: r.tresc_pytania, choices: answersOf(r).map((text, i) => ({ id: ['a', 'b', 'c'][i], text })), correctChoiceId: ['a', 'b', 'c'][Math.max(0, Number(r.poprawna_odpowiedz) - 1)] || 'a', explanation: r.wyjasnienie, active: true, isCore: yes(r.rdzen) }))
    };
  }

  function downloadJson(filename, data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // ---------- Zdarzenia ----------

  document.addEventListener('click', function (event) {
    const tab = event.target.closest('.tab');
    if (tab) {
      if (!confirmLeave()) return;
      goTo(tab.dataset.view);
      return;
    }
    const el = event.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;

    if (action === 'start') {
      const task = tasks().find((t) => t.key === el.dataset.task);
      if (task && task.ids.length) { setNotice(''); openEditor(task.ids[0], task.ids.slice()); }
    } else if (action === 'open') {
      setNotice('');
      openEditor(el.dataset.id, null);
    } else if (action === 'new') {
      setNotice('');
      openNew();
    } else if (action === 'filter') {
      state.filter = el.dataset.filter;
      renderAll();
    } else if (action === 'back') {
      if (!confirmLeave()) return;
      goTo(state.returnView);
    } else if (action === 'undo') {
      state.draft = copy(currentRecord());
      setNotice('Cofnięto niezapisane zmiany.');
      renderEditor();
    } else if (action === 'preview') {
      state.preview = !state.preview;
      el.setAttribute('aria-expanded', String(state.preview));
      el.textContent = state.preview ? 'Ukryj podgląd' : 'Pokaż, jak zobaczy to gość';
      renderPreview();
    } else if (action === 'export') {
      downloadJson('fallback-questions.json', guestExport());
    } else if (['import', 'refresh-sync', 'dedupe-preview', 'dedupe-run'].includes(action)) {
      runTool(action);
    } else {
      runAction(action);
    }
  });

  function onFieldChange(event) {
    const field = event.target.dataset.field;
    if (field && state.draft) {
      if (event.target.type === 'checkbox') state.draft[field] = event.target.checked ? 'tak' : 'nie';
      else state.draft[field] = event.target.value;
      const box = document.getElementById('actionError');
      if (box) box.innerHTML = '';
      updateDirtyUi();
      return;
    }
    if (event.target.id === 'search') {
      state.search = event.target.value;
      renderList();
    }
  }
  document.addEventListener('input', onFieldChange);
  document.addEventListener('change', onFieldChange);

  window.addEventListener('beforeunload', function (event) {
    if (state.view === 'edit' && isDirty()) { event.preventDefault(); event.returnValue = ''; }
  });

  render();
  signIn();
}());
