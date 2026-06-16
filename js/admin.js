(function () {
  'use strict';

  const config = window.WOMAI_CONFIG || {};
  const api = window.WOMAI_API;
  const STORAGE_KEY = config.admin?.storageKey || 'womai_admin_v5_connection';
  const state = { records: [], selectedId: null };

  const el = {
    endpointUrl: document.getElementById('endpointUrl'), roleSelect: document.getElementById('roleSelect'), tokenInput: document.getElementById('tokenInput'),
    saveConnectionBtn: document.getElementById('saveConnectionBtn'), clearConnectionBtn: document.getElementById('clearConnectionBtn'), healthBtn: document.getElementById('healthBtn'), loadBtn: document.getElementById('loadBtn'), saveBtn: document.getElementById('saveBtn'),
    activeRole: document.getElementById('activeRole'), roleHint: document.getElementById('roleHint'), connectionLive: document.getElementById('connectionLive'), connectionError: document.getElementById('connectionError'), statsBox: document.getElementById('statsBox'),
    searchInput: document.getElementById('searchInput'), categoryFilter: document.getElementById('categoryFilter'), statusFilter: document.getElementById('statusFilter'), readyFilter: document.getElementById('readyFilter'),
    newBtn: document.getElementById('newBtn'), bulkReadyYesBtn: document.getElementById('bulkReadyYesBtn'), bulkReadyNoBtn: document.getElementById('bulkReadyNoBtn'),
    showGuestExportBtn: document.getElementById('showGuestExportBtn'), downloadGuestExportBtn: document.getElementById('downloadGuestExportBtn'), recordsBody: document.getElementById('recordsBody'), editorHeading: document.getElementById('editorHeading'), emptyState: document.getElementById('emptyState'), editorForm: document.getElementById('editorForm'),
    recId: document.getElementById('recId'), recStatus: document.getElementById('recStatus'), recSource: document.getElementById('recSource'), recAuthor: document.getElementById('recAuthor'), recVersion: document.getElementById('recVersion'), recCategory: document.getElementById('recCategory'), recType: document.getElementById('recType'), recChoiceCount: document.getElementById('recChoiceCount'), recCorrect: document.getElementById('recCorrect'), recPrompt: document.getElementById('recPrompt'), recChoice1: document.getElementById('recChoice1'), recChoice2: document.getElementById('recChoice2'), recChoice3: document.getElementById('recChoice3'), recExplanation: document.getElementById('recExplanation'), recNotes: document.getElementById('recNotes'), recReady: document.getElementById('recReady'), recActive: document.getElementById('recActive'), recCore: document.getElementById('recCore'), recCreated: document.getElementById('recCreated'), recUpdated: document.getElementById('recUpdated'), duplicateBtn: document.getElementById('duplicateBtn'), deleteBtn: document.getElementById('deleteBtn'), closeEditorBtn: document.getElementById('closeEditorBtn'), editorLive: document.getElementById('editorLive'), editorError: document.getElementById('editorError'), previewArea: document.getElementById('previewArea')
  };

  function nowIso() { return new Date().toISOString(); }
  function esc(v) { return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;').replace(/'/g, '&#039;'); }
  function slug(v) { return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pytanie'; }
  function say(text) { el.connectionError.textContent = ''; el.connectionLive.textContent = ''; requestAnimationFrame(() => { el.connectionLive.textContent = text; }); }
  function sayError(text) { el.connectionLive.textContent = ''; el.connectionError.textContent = ''; requestAnimationFrame(() => { el.connectionError.textContent = text; }); }
  function sayEditor(text) { el.editorError.textContent = ''; el.editorLive.textContent = ''; requestAnimationFrame(() => { el.editorLive.textContent = text; }); }
  function sayEditorError(text) { el.editorLive.textContent = ''; el.editorError.textContent = ''; requestAnimationFrame(() => { el.editorError.textContent = text; }); }
  function currentRole() { return el.roleSelect.value; }
  function isSuperadmin() { return currentRole() === 'superadmin'; }

  function updateRoleUi() {
    el.activeRole.textContent = currentRole();
    el.roleHint.textContent = isSuperadmin()
      ? 'Superadmin może czytać, edytować wszystko, usuwać rekordy i nadpisywać bazę.'
      : 'Admin może czytać, porządkować i publikować pytania, ale nie usuwa rekordów i nie zmienia pełnej struktury bazy.';
    el.deleteBtn.disabled = !isSuperadmin();
    el.recId.readOnly = !isSuperadmin();
    el.recSource.readOnly = !isSuperadmin();
    el.recCreated.readOnly = !isSuperadmin();
    el.recVersion.readOnly = !isSuperadmin();
  }

  function saveConnection() {
    const payload = { endpointUrl: el.endpointUrl.value.trim(), role: el.roleSelect.value, token: el.tokenInput.value };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    updateRoleUi();
    say('Zapamiętano połączenie.');
  }

  function loadConnection() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      el.endpointUrl.value = parsed.endpointUrl || config.apiUrl || '';
      el.roleSelect.value = parsed.role || 'admin';
      el.tokenInput.value = parsed.token || '';
    } catch (error) {}
    if (!el.endpointUrl.value && config.apiUrl) el.endpointUrl.value = config.apiUrl;
    updateRoleUi();
  }

  function clearConnection() {
    localStorage.removeItem(STORAGE_KEY);
    el.endpointUrl.value = config.apiUrl || '';
    el.roleSelect.value = 'admin';
    el.tokenInput.value = '';
    updateRoleUi();
    say('Wyczyszczono zapisane połączenie.');
  }

  async function requestJson(method, action, body) {
    return api.requestAdminJson(el.endpointUrl.value.trim(), el.tokenInput.value, method, action, body);
  }

  function toRecordShape(raw) {
    return {
      id: String(raw.id || ''), data_dodania: String(raw.data_dodania || ''), data_aktualizacji: String(raw.data_aktualizacji || ''), autor: String(raw.autor || ''), zrodlo: String(raw.zrodlo || ''), wersja: String(raw.wersja || '1'), kategoria: String(raw.kategoria || ''), typ_pytania: String(raw.typ_pytania || 'jednokrotny-wybor'), tresc_pytania: String(raw.tresc_pytania || ''), odpowiedz_1: String(raw.odpowiedz_1 || ''), odpowiedz_2: String(raw.odpowiedz_2 || ''), odpowiedz_3: String(raw.odpowiedz_3 || ''), liczba_odpowiedzi: String(raw.liczba_odpowiedzi || (raw.odpowiedz_3 ? '3' : '2')), poprawna_odpowiedz: String(raw.poprawna_odpowiedz || '1'), wyjasnienie: String(raw.wyjasnienie || ''), uwagi: String(raw.uwagi || ''), status: String(raw.status || 'nowe'), gotowe_redakcyjnie: String(raw.gotowe_redakcyjnie || 'nie'), aktywne: String(raw.aktywne || 'nie'), rdzen: String(raw.rdzen || 'nie')
    };
  }

  function blankRecord() {
    const now = nowIso();
    return { id: 'pytanie-' + Date.now().toString(36), data_dodania: now, data_aktualizacji: now, autor: '', zrodlo: 'ręczne', wersja: '1', kategoria: '', typ_pytania: 'jednokrotny-wybor', tresc_pytania: '', odpowiedz_1: '', odpowiedz_2: '', odpowiedz_3: '', liczba_odpowiedzi: '3', poprawna_odpowiedz: '1', wyjasnienie: '', uwagi: '', status: 'nowe', gotowe_redakcyjnie: 'nie', aktywne: 'nie', rdzen: 'nie' };
  }

  function filteredRecords() {
    const search = el.searchInput.value.trim().toLowerCase();
    const category = el.categoryFilter.value;
    const status = el.statusFilter.value;
    const ready = el.readyFilter.value;
    return state.records.filter((record) => {
      if (category !== 'all' && record.kategoria !== category) return false;
      if (status !== 'all' && record.status !== status) return false;
      if (ready !== 'all' && record.gotowe_redakcyjnie !== ready) return false;
      if (search && !record.tresc_pytania.toLowerCase().includes(search)) return false;
      return true;
    });
  }

  function renderStats() {
    const total = state.records.length;
    const active = state.records.filter(r => r.aktywne === 'tak').length;
    const core = state.records.filter(r => r.rdzen === 'tak').length;
    const ready = state.records.filter(r => r.gotowe_redakcyjnie === 'tak').length;
    el.statsBox.innerHTML = '<p><strong>Rekordy:</strong> ' + total + ' &nbsp; <strong>Gotowe red.:</strong> ' + ready + ' &nbsp; <strong>Aktywne:</strong> ' + active + ' &nbsp; <strong>Rdzeń:</strong> ' + core + '</p>';
  }

  function refreshCategoryFilter() {
    const current = el.categoryFilter.value;
    const categories = Array.from(new Set(state.records.map(r => r.kategoria).filter(Boolean))).sort();
    el.categoryFilter.innerHTML = '<option value="all">Wszystkie</option>';
    categories.forEach((category) => {
      const option = document.createElement('option');
      option.value = category;
      option.textContent = category;
      el.categoryFilter.appendChild(option);
    });
    el.categoryFilter.value = categories.includes(current) ? current : 'all';
  }

  function renderTable() {
    refreshCategoryFilter();
    renderStats();
    const records = filteredRecords();
    el.recordsBody.innerHTML = '';
    if (!records.length) {
      el.recordsBody.innerHTML = '<tr><td colspan="10">Brak rekordów.</td></tr>';
      return;
    }
    records.forEach((record) => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + esc(record.id) + '</td>' + '<td><span class="pill">' + esc(record.status) + '</span></td>' + '<td>' + esc(record.gotowe_redakcyjnie) + '</td>' + '<td>' + esc(record.aktywne) + '</td>' + '<td>' + esc(record.rdzen) + '</td>' + '<td>' + esc(record.kategoria || '—') + '</td>' + '<td>' + esc(record.tresc_pytania || '—') + '</td>' + '<td>' + esc(record.autor || '—') + '</td>' + '<td>' + esc(record.zrodlo || '—') + '</td>' + '<td class="actions-col"><button type="button" data-edit="' + esc(record.id) + '">Edytuj</button><button type="button" data-toggle-ready="' + esc(record.id) + '">' + (record.gotowe_redakcyjnie === 'tak' ? 'Ustaw niegotowe' : 'Ustaw gotowe') + '</button><button type="button" data-toggle-active="' + esc(record.id) + '">' + (record.aktywne === 'tak' ? 'Dezaktywuj' : 'Aktywuj') + '</button><button type="button" data-toggle-core="' + esc(record.id) + '">' + (record.rdzen === 'tak' ? 'Wyłącz rdzeń' : 'Włącz rdzeń') + '</button></td>';
      el.recordsBody.appendChild(tr);
    });
  }

  function openEditor(id) {
    const record = state.records.find((item) => item.id === id);
    if (!record) return;
    state.selectedId = id;
    el.emptyState.classList.add('hidden');
    el.editorForm.classList.remove('hidden');
    el.recId.value = record.id; el.recStatus.value = record.status; el.recSource.value = record.zrodlo; el.recAuthor.value = record.autor; el.recVersion.value = record.wersja; el.recCategory.value = record.kategoria; el.recType.value = record.typ_pytania; el.recChoiceCount.value = record.liczba_odpowiedzi; el.recCorrect.value = record.poprawna_odpowiedz; el.recPrompt.value = record.tresc_pytania; el.recChoice1.value = record.odpowiedz_1; el.recChoice2.value = record.odpowiedz_2; el.recChoice3.value = record.odpowiedz_3; el.recExplanation.value = record.wyjasnienie; el.recNotes.value = record.uwagi; el.recReady.value = record.gotowe_redakcyjnie; el.recActive.value = record.aktywne; el.recCore.value = record.rdzen; el.recCreated.value = record.data_dodania; el.recUpdated.value = record.data_aktualizacji;
    updateRoleUi();
    requestAnimationFrame(() => el.editorHeading.focus());
  }

  function closeEditor() {
    state.selectedId = null;
    el.editorForm.classList.add('hidden');
    el.emptyState.classList.remove('hidden');
  }

  function collectEditorRecord() {
    const existing = state.records.find((item) => item.id === state.selectedId) || blankRecord();
    const now = nowIso();
    return { ...existing, id: el.recId.value.trim() || existing.id, data_dodania: el.recCreated.value.trim() || existing.data_dodania || now, data_aktualizacji: now, autor: el.recAuthor.value.trim(), zrodlo: el.recSource.value.trim() || 'ręczne', wersja: el.recVersion.value.trim() || '1', kategoria: el.recCategory.value.trim(), typ_pytania: el.recType.value.trim() || 'jednokrotny-wybor', tresc_pytania: el.recPrompt.value.trim(), odpowiedz_1: el.recChoice1.value.trim(), odpowiedz_2: el.recChoice2.value.trim(), odpowiedz_3: el.recChoiceCount.value === '2' ? '' : el.recChoice3.value.trim(), liczba_odpowiedzi: el.recChoiceCount.value, poprawna_odpowiedz: el.recCorrect.value, wyjasnienie: el.recExplanation.value.trim(), uwagi: el.recNotes.value.trim(), status: el.recStatus.value, gotowe_redakcyjnie: el.recReady.value, aktywne: el.recActive.value, rdzen: el.recCore.value };
  }

  async function loadRecords() {
    try {
      const json = await requestJson('GET', 'records');
      state.records = (json.records || []).map(toRecordShape);
      renderTable();
      closeEditor();
      say('Pobrano rekordy z endpointu.');
    } catch (error) { sayError(error.message); }
  }

  async function saveAllRecords() {
    try {
      if (!isSuperadmin()) return sayError('Pełny zapis całej bazy jest dostępny tylko dla superadmina.');
      await requestJson('POST', 'save', { records: state.records });
      say('Zapisano wszystkie rekordy.');
    } catch (error) { sayError(error.message); }
  }

  async function saveCurrentRecord(event) {
    event.preventDefault();
    try {
      const record = collectEditorRecord();
      const json = await requestJson('POST', 'upsertRecord', { record });
      const saved = toRecordShape(json.record || record);
      const index = state.records.findIndex((item) => item.id === saved.id);
      if (index >= 0) state.records[index] = saved;
      else state.records.unshift(saved);
      state.selectedId = saved.id;
      renderTable();
      openEditor(saved.id);
      sayEditor('Zapisano rekord.');
    } catch (error) { sayEditorError(error.message); }
  }

  async function deleteCurrentRecord() {
    try {
      if (!isSuperadmin()) return sayEditorError('Usuwanie rekordów jest dostępne tylko dla superadmina.');
      const id = state.selectedId;
      if (!id) return sayEditorError('Nie wybrano rekordu.');
      await requestJson('POST', 'deleteRecord', { id });
      state.records = state.records.filter((item) => item.id !== id);
      renderTable();
      closeEditor();
      sayEditor('Usunięto rekord.');
    } catch (error) { sayEditorError(error.message); }
  }

  async function healthCheck() {
    try {
      const json = await requestJson('GET', 'health');
      say('Endpoint działa. Rola: ' + json.role + '.');
    } catch (error) { sayError(error.message); }
  }

  function createNewRecord() {
    const record = blankRecord();
    state.records.unshift(record);
    renderTable();
    openEditor(record.id);
    say('Dodano nowy rekord lokalnie.');
  }

  function duplicateCurrentRecord() {
    const current = state.records.find((item) => item.id === state.selectedId);
    if (!current) return sayEditorError('Nie wybrano rekordu.');
    const copy = { ...current, id: slug(current.kategoria || 'pytanie') + '-' + Date.now().toString(36), data_dodania: nowIso(), data_aktualizacji: nowIso(), aktywne: 'nie', rdzen: 'nie', status: 'nowe' };
    state.records.unshift(copy);
    renderTable();
    openEditor(copy.id);
    sayEditor('Utworzono duplikat rekordu.');
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

  function guestExport() {
    const active = state.records.filter((record) => record.aktywne === 'tak' && record.gotowe_redakcyjnie === 'tak' && record.tresc_pytania.trim() !== '' && record.wyjasnienie.trim() !== '' && [record.odpowiedz_1, record.odpowiedz_2, record.odpowiedz_3].filter(Boolean).length >= 2);
    const categories = Array.from(new Set(active.map((record) => record.kategoria).filter(Boolean)));
    return {
      settings: { corePoolSize: active.filter((record) => record.rdzen === 'tak').length, sessionQuestionCount: 4 },
      categories: categories.map((category) => ({ id: category, label: category, active: true })),
      questions: active.map((record) => ({ id: record.id, categoryId: record.kategoria, prompt: record.tresc_pytania, choices: [record.odpowiedz_1, record.odpowiedz_2, record.odpowiedz_3].filter(Boolean).map((text, index) => ({ id: ['a','b','c'][index], text })), correctChoiceId: ['a','b','c'][Math.max(0, Number(record.poprawna_odpowiedz) - 1)] || 'a', explanation: record.wyjasnienie, active: true, isCore: record.rdzen === 'tak' }))
    };
  }

  function showGuestExport() { el.previewArea.value = JSON.stringify(guestExport(), null, 2); }

  function wireEvents() {
    el.roleSelect.addEventListener('change', updateRoleUi);
    el.saveConnectionBtn.addEventListener('click', saveConnection);
    el.clearConnectionBtn.addEventListener('click', clearConnection);
    el.healthBtn.addEventListener('click', healthCheck);
    el.loadBtn.addEventListener('click', loadRecords);
    el.saveBtn.addEventListener('click', saveAllRecords);
    el.searchInput.addEventListener('input', renderTable);
    el.categoryFilter.addEventListener('change', renderTable);
    el.statusFilter.addEventListener('change', renderTable);
    el.readyFilter.addEventListener('change', renderTable);
    el.newBtn.addEventListener('click', createNewRecord);
    el.bulkReadyYesBtn.addEventListener('click', function () { filteredRecords().forEach((record) => { record.gotowe_redakcyjnie = 'tak'; }); renderTable(); say('Ustawiono gotowe redakcyjnie = tak dla rekordów po filtrach.'); });
    el.bulkReadyNoBtn.addEventListener('click', function () { filteredRecords().forEach((record) => { record.gotowe_redakcyjnie = 'nie'; record.aktywne = 'nie'; record.rdzen = 'nie'; }); renderTable(); say('Ustawiono gotowe redakcyjnie = nie dla rekordów po filtrach.'); });
    el.showGuestExportBtn.addEventListener('click', showGuestExport);
    el.downloadGuestExportBtn.addEventListener('click', function () { downloadJson('odkryj-womai-dane-goscia.json', guestExport()); });
    el.recordsBody.addEventListener('click', function (event) {
      const editId = event.target.getAttribute('data-edit');
      const toggleReadyId = event.target.getAttribute('data-toggle-ready');
      const toggleActiveId = event.target.getAttribute('data-toggle-active');
      const toggleCoreId = event.target.getAttribute('data-toggle-core');
      const recordId = editId || toggleReadyId || toggleActiveId || toggleCoreId;
      const record = state.records.find((item) => item.id === recordId);
      if (editId) return openEditor(editId);
      if (!record) return;
      if (toggleReadyId) {
        record.gotowe_redakcyjnie = record.gotowe_redakcyjnie === 'tak' ? 'nie' : 'tak';
        if (record.gotowe_redakcyjnie === 'nie') { record.aktywne = 'nie'; record.rdzen = 'nie'; }
      }
      if (toggleActiveId) {
        record.aktywne = record.aktywne === 'tak' ? 'nie' : 'tak';
        if (record.aktywne === 'tak') record.gotowe_redakcyjnie = 'tak';
        if (record.aktywne === 'nie') record.rdzen = 'nie';
      }
      if (toggleCoreId) {
        record.rdzen = record.rdzen === 'tak' ? 'nie' : 'tak';
        if (record.rdzen === 'tak') { record.aktywne = 'tak'; record.gotowe_redakcyjnie = 'tak'; }
      }
      renderTable();
    });
    el.editorForm.addEventListener('submit', saveCurrentRecord);
    el.duplicateBtn.addEventListener('click', duplicateCurrentRecord);
    el.deleteBtn.addEventListener('click', deleteCurrentRecord);
    el.closeEditorBtn.addEventListener('click', closeEditor);
    el.recChoiceCount.addEventListener('change', function () {
      el.recChoice3.disabled = el.recChoiceCount.value === '2';
      if (el.recChoiceCount.value === '2') el.recChoice3.value = '';
    });
  }

  loadConnection();
  wireEvents();
  renderTable();
}());
