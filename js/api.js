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

  async function getGuestData() {
    try {
      const { response, json } = await fetchJsonWithTimeout(endpointUrl('guest').toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      }, timeoutMs(config.guest));

      if (!response.ok || !json.ok || !json.data) {
        throw new Error(json && json.error ? json.error : 'Nie udało się pobrać pytań.');
      }

      return json.data;
    } catch (error) {
      return getGuestFallbackData(error);
    }
  }

  async function getFactsData() {
    const factsDataUrl = config.guest?.factsDataUrl;
    if (!factsDataUrl) {
      return { facts: [] };
    }

    const factsUrl = new URL(factsDataUrl, window.location.href).toString();
    const { response, json } = await fetchJsonWithTimeout(factsUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    }, timeoutMs(config.guest));

    if (!response.ok || !json || !Array.isArray(json.facts)) {
      throw new Error('Nie udało się pobrać ciekawostek.');
    }

    return json;
  }

  async function requestAdminJson(endpoint, token, method, action, body) {
    if (!endpoint) throw new Error('Brak adresu endpointu.');
    if (!token) throw new Error('Brak tokenu.');

    const url = new URL(endpoint);
    url.searchParams.set('action', action);
    url.searchParams.set('token', token);

    const options = { method, headers: { 'Accept': 'application/json' } };
    if (method !== 'GET') {
      options.headers['Content-Type'] = 'text/plain;charset=utf-8';
      options.body = JSON.stringify(body || {});
    }

    const { response, json } = await fetchJsonWithTimeout(
      url.toString(),
      options,
      timeoutMs(config.admin)
    );

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
