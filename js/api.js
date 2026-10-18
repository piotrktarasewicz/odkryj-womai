(function () {
  'use strict';

  const config = window.WOMAI_CONFIG || {};

  function getApiUrl() {
    if (!config.apiUrl || config.apiUrl === 'WSTAW_TUTAJ_ADRES_ENDPOINTU') {
      throw new Error('Najpierw ustaw adres endpointu w js/config.js.');
    }
    return config.apiUrl;
  }

  function endpointUrl(action) {
    const url = new URL(getApiUrl());
    url.searchParams.set('action', action);
    return url;
  }

  function timeoutMs(scope) {
    const value = Number(scope?.requestTimeoutMs || config.requestTimeoutMs || 10000);
    return Number.isFinite(value) && value > 0 ? value : 10000;
  }

  async function fetchJsonWithTimeout(url, options, ms) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), ms);

    try {
      const response = await fetch(url, {
        ...(options || {}),
        signal: controller.signal
      });

      let json;
      try {
        json = await response.json();
      } catch (error) {
        throw new Error('Odpowiedź serwera nie jest poprawnym JSON-em.');
      }

      return { response, json };
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('Przekroczono czas oczekiwania na odpowiedź.');
      }
      throw error;
    } finally {
      window.clearTimeout(timer);
    }
  }

  function normalizeGuestData(json) {
    if (json && json.ok && json.data) return json.data;
    if (json && Array.isArray(json.questions)) return json;
    if (json && json.data && Array.isArray(json.data.questions)) return json.data;
    return null;
  }

  async function getGuestFallbackData(originalError) {
    const fallbackDataUrl = config.guest?.fallbackDataUrl;
    if (!fallbackDataUrl) throw originalError;

    try {
      const fallbackUrl = new URL(fallbackDataUrl, window.location.href).toString();
      const { response, json } = await fetchJsonWithTimeout(fallbackUrl, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }, timeoutMs(config.guest));

      const data = normalizeGuestData(json);
      if (!response.ok || !data) {
        throw new Error('Nie udało się pobrać zapasowego zestawu pytań.');
      }

      return data;
    } catch (fallbackError) {
      throw originalError;
    }
  }

  async function fetchGuestFrom(url) {
    const { response, json } = await fetchJsonWithTimeout(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, timeoutMs(config.guest));

    if (!response.ok || !json || !json.ok || !json.data) {
      throw new Error(json && json.error ? json.error : 'Nie udało się pobrać pytań.');
    }

    return json.data;
  }

  // Kolejność: kopia w Cloudflare, Apps Script bezpośrednio, plik zapasowy.
  async function getGuestData() {
    const cachedDataUrl = config.guest?.cachedDataUrl;
    if (cachedDataUrl) {
      try {
        return await fetchGuestFrom(new URL(cachedDataUrl, window.location.href).toString());
      } catch (error) {
        // Przechodzimy do Apps Script.
      }
    }

    try {
      return await fetchGuestFrom(endpointUrl('guest').toString());
    } catch (error) {
      return getGuestFallbackData(error);
    }
  }

  async function fetchFacts(path) {
    const factsUrl = new URL(path, window.location.href).toString();
    const { response, json } = await fetchJsonWithTimeout(factsUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, timeoutMs(config.guest));

    if (!response.ok || !json || !Array.isArray(json.facts)) {
      throw new Error('Nie udało się pobrać ciekawostek.');
    }
    return json;
  }

  // Ciekawostki edytowane w panelu admina; gdy brak odpowiedzi albo lista
  // jest pusta, zapasowo plik data/facts.json.
  async function getFactsData() {
    const factsDataUrl = config.guest?.factsDataUrl;
    const fallbackUrl = config.guest?.factsFallbackUrl;
    if (!factsDataUrl) {
      return { facts: [] };
    }

    try {
      const json = await fetchFacts(factsDataUrl);
      if (json.facts.length || !fallbackUrl) return json;
    } catch (error) {
      if (!fallbackUrl) throw error;
    }
    return fetchFacts(fallbackUrl);
  }

  // Zapytania idą do Workera pod adresem panelu. Worker rozpoznaje osobę
  // po logowaniu Cloudflare Access i sam dokłada token do Apps Script.
  async function requestAdminJson(method, action, body) {
    const base = config.admin?.apiBaseUrl || '/odkryj-womai/admin/api/';
    const url = new URL(action, new URL(base, window.location.href));

    const options = {
      method,
      credentials: 'same-origin',
      redirect: 'manual',
      headers: { 'Accept': 'application/json' }
    };
    if (method !== 'GET') {
      options.headers['Content-Type'] = 'text/plain;charset=utf-8';
      options.body = JSON.stringify(body || {});
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs(config.admin));
    let response;
    try {
      response = await fetch(url.toString(), { ...options, signal: controller.signal });
    } catch (error) {
      if (error && error.name === 'AbortError') {
        throw new Error('Przekroczono czas oczekiwania na odpowiedź.');
      }
      throw new Error('Brak połączenia z serwerem panelu.');
    } finally {
      window.clearTimeout(timer);
    }

    // Cloudflare Access przekierowuje na stronę logowania, gdy sesja wygaśnie.
    if (response.type === 'opaqueredirect' || response.status === 401) {
      throw new Error('Sesja logowania wygasła. Odśwież stronę, aby zalogować się ponownie.');
    }

    let json;
    try {
      json = await response.json();
    } catch (error) {
      throw new Error('Odpowiedź serwera nie jest poprawnym JSON-em.');
    }

    if (!response.ok || !json.ok) {
      throw new Error(json && json.error ? json.error : ('Błąd HTTP ' + response.status));
    }
    return json;
  }

  window.WOMAI_API = {
    getGuestData,
    getFactsData,
    requestAdminJson
  };
}());
