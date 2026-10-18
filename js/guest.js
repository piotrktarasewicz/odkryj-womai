(function () {
  'use strict';

  const config = window.WOMAI_CONFIG || {};
  const api = window.WOMAI_API || {};
  const positiveFeedbackLeads = ['Dobrze!', 'Brawo!', 'Świetnie!', 'Dokładnie tak!'];
  const negativeFeedbackLeads = ['Tym razem nie.', 'Nie do końca.', 'To jeszcze nie to.'];
  // Kolor akcentu według wytycznych WOMAI: żółty to ciemność, fiolet to światło.
  const CATEGORY_ACCENT = { 'ciemność': 'y', 'światło': 'v' };
  const PATH_ACCENT = { ciemnosc: 'y', swiatlo: 'v' };
  const SHARE_URL = 'https://ptprojects.app/odkryj-womai/';
  const DEFAULT_FACTS = [
    {
      id: 'default-womai-czym-jest',
      category: 'O WOMAI',
      title: 'Miejsce, które uruchamia zmysły',
      text: 'WOMAI to przestrzeń, w której nauka, doświadczenie i zmysły spotykają się w praktyce. Gość nie tylko czyta lub słucha o świecie, ale może go sprawdzać przez własne odczucia.',
      active: true
    },
    {
      id: 'default-ciemnosc-przewodnicy',
      category: 'W stronę ciemności',
      title: 'Ciemność prowadzona przez doświadczenie',
      text: 'Na ścieżce w ciemności bardzo ważną rolę pełnią przewodnicy. To oni pomagają gościom bezpiecznie wejść w sytuację, w której wzrok przestaje być głównym źródłem informacji.',
      active: true
    },
    {
      id: 'default-zmysly-sluch',
      category: 'Zmysły',
      title: 'Słuch potrafi zaskoczyć',
      text: 'Gdy nie korzystamy ze wzroku, zaczynamy wyraźniej zauważać dźwięki. Ich kierunek, odległość i charakter mogą powiedzieć o otoczeniu więcej, niż zwykle przypuszczamy.',
      active: true
    },
    {
      id: 'default-swiatlo-obserwacja',
      category: 'W stronę światła',
      title: 'Światło zmienia sposób patrzenia',
      text: 'To, co widzimy, zależy nie tylko od oczu, ale też od światła, kontrastu, tła i interpretacji mózgu. Dlatego proste doświadczenia optyczne potrafią być tak zaskakujące.',
      active: true
    },
    {
      id: 'default-dostepnosc-praktyka',
      category: 'Dostępność',
      title: 'Dostępność to praktyka, nie hasło',
      text: 'O dostępności najłatwiej mówić teoretycznie, ale najlepiej rozumie się ją przez doświadczenie. WOMAI pozwala zobaczyć, jak wiele zależy od sposobu komunikacji, przestrzeni i uważności na drugiego człowieka.',
      active: true
    },
    {
      id: 'default-eksperyment-pytanie',
      category: 'Eksperymenty',
      title: 'Dobre pytanie jest początkiem odkrycia',
      text: 'W centrum nauki pytanie często jest ważniejsze niż szybka odpowiedź. To ono uruchamia ciekawość i prowadzi do samodzielnego sprawdzania, porównywania i wyciągania wniosków.',
      active: true
    }
  ];

  const byId = (id) => document.getElementById(id);
  const views = { start: byId('startView'), quiz: byId('quizView'), summary: byId('summaryView'), about: byId('aboutView'), facts: byId('factsView') };
  const topbar = byId('topbar');
  const homeBtn = byId('homeBtn');
  const startTitle = byId('startTitle');
  const startBtn = byId('startBtn');
  const aboutBtn = byId('aboutBtn');
  const loadingBox = byId('loadingBox');
  const errorBox = byId('errorBox');
  const progressLabel = byId('progressLabel');
  const progressFill = byId('progressFill');
  const categoryBadge = byId('categoryBadge');
  const questionTitle = byId('questionTitle');
  const choicesWrap = byId('choicesWrap');
  const choiceError = byId('choiceError');
  const feedbackBox = byId('feedbackBox');
  const feedbackTitle = byId('feedbackTitle');
  const feedbackText = byId('feedbackText');
  const nextBtn = byId('nextBtn');
  const summaryHeading = byId('summaryHeading');
  const scoreBig = byId('scoreBig');
  const summaryText = byId('summaryText');
  const summaryAboutBtn = byId('summaryAboutBtn');
  const playAgainBtn = byId('playAgainBtn');
  const shareBtn = byId('shareBtn');
  const shareStatus = byId('shareStatus');
  const aboutHeading = byId('aboutHeading');
  const aboutBody = byId('aboutBody');
  const aboutQuizBtn = byId('aboutQuizBtn');
  const factsBadge = byId('factsBadge');
  const factsHeading = byId('factsHeading');
  const factsText = byId('factsText');
  const factsMeta = byId('factsMeta');
  const nextFactBtn = byId('nextFactBtn');
  const factsBackBtn = byId('factsBackBtn');
  const factsQuizBtn = byId('factsQuizBtn');

  const STORAGE_KEY = config.guest?.storageKey || 'womai_guest_progress_v2';
  const categoryQuestionCounts = config.guest?.categoryQuestionCounts || {
    'ciemność': 2,
    'światło': 2
  };

  let WOMAI_DATA = null;
  let WOMAI_FACTS = DEFAULT_FACTS.slice();
  let CONTENT = null;
  let sessionQuestions = [];
  let currentIndex = 0;
  let currentFactIndex = 0;
  let selectedChoiceId = null;
  let feedbackShown = false;
  let answers = {};
  let currentView = 'start';

  function defaultMemory() {
    return {
      sessionsCompleted: 0,
      totalCorrectAnswers: 0,
      totalQuestionsAnswered: 0,
      seenQuestionIds: [],
      lastPlayedAt: '',
      lastFirstQuestionId: ''
    };
  }

  function loadMemory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultMemory();
      const parsed = JSON.parse(raw);
      return {
        sessionsCompleted: Number(parsed.sessionsCompleted || 0),
        totalCorrectAnswers: Number(parsed.totalCorrectAnswers || 0),
        totalQuestionsAnswered: Number(parsed.totalQuestionsAnswered || 0),
        seenQuestionIds: Array.isArray(parsed.seenQuestionIds) ? parsed.seenQuestionIds : [],
        lastPlayedAt: String(parsed.lastPlayedAt || ''),
        lastFirstQuestionId: String(parsed.lastFirstQuestionId || '')
      };
    } catch (error) {
      return defaultMemory();
    }
  }

  let memory = loadMemory();

  function saveMemory() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
    } catch (error) {
      // Tryb prywatny albo zablokowana pamięć: quiz działa dalej bez zapamiętywania.
    }
  }

  function randomIndex(maxExclusive) {
    if (window.crypto && window.crypto.getRandomValues) {
      const arr = new Uint32Array(1);
      window.crypto.getRandomValues(arr);
      return arr[0] % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  }

  function shuffle(array) {
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i -= 1) {
      const j = randomIndex(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function categoryLabel(id) {
    if (!WOMAI_DATA || !Array.isArray(WOMAI_DATA.categories)) return id;
    const hit = WOMAI_DATA.categories.find(c => c.id === id);
    return hit ? hit.label : id;
  }

  function configuredCategoryCounts() {
    return Object.entries(categoryQuestionCounts)
      .map(([categoryId, count]) => ({
        categoryId,
        count: Math.max(0, Number(count) || 0)
      }))
      .filter(item => item.categoryId && item.count > 0);
  }

  function questionCandidates(categoryId, excludedIds, coreOnly) {
    if (!WOMAI_DATA || !Array.isArray(WOMAI_DATA.questions)) return [];

    return WOMAI_DATA.questions.filter(question => {
      if (!question || !question.active || excludedIds.has(question.id)) return false;
      if (categoryId && question.categoryId !== categoryId) return false;
      if (coreOnly && !question.isCore) return false;
      return true;
    });
  }

  function addRandomQuestions(chosen, excludedIds, candidates, count) {
    let added = 0;
    const randomized = shuffle(candidates);

    for (let index = 0; index < randomized.length && added < count; index += 1) {
      const question = randomized[index];
      if (!question || excludedIds.has(question.id)) continue;
      chosen.push(shuffledQuestion(question));
      excludedIds.add(question.id);
      added += 1;
    }

    return added;
  }

  function shuffledQuestion(question) {
    return {
      id: question.id,
      categoryId: question.categoryId,
      prompt: question.prompt,
      correctChoiceId: question.correctChoiceId,
      explanation: question.explanation,
      active: question.active,
      isCore: question.isCore,
      choices: shuffle(question.choices.map(choice => ({ id: choice.id, text: choice.text })))
    };
  }

  function avoidSameFirstQuestion(session) {
    if (!Array.isArray(session) || session.length < 2) return session;
    const lastFirst = memory.lastFirstQuestionId || '';
    if (!lastFirst || session[0].id !== lastFirst) return session;
    const swapIndex = 1 + randomIndex(session.length - 1);
    const copy = session.slice();
    const tmp = copy[0];
    copy[0] = copy[swapIndex];
    copy[swapIndex] = tmp;
    return copy;
  }

  function buildSessionQuestions() {
    const counts = configuredCategoryCounts();
    const configuredTargetCount = counts.reduce((sum, item) => sum + item.count, 0);
    const fallbackTargetCount = Number(WOMAI_DATA.settings?.sessionQuestionCount || config.guest?.sessionQuestionCountFallback || 4);
    const targetCount = configuredTargetCount || fallbackTargetCount;
    const chosen = [];
    const excluded = new Set();

    counts.forEach(item => {
      const coreCandidates = questionCandidates(item.categoryId, excluded, true);
      const addedCore = addRandomQuestions(chosen, excluded, coreCandidates, item.count);
      const missingInCategory = item.count - addedCore;

      if (missingInCategory > 0) {
        const sameCategoryCandidates = questionCandidates(item.categoryId, excluded, false);
        addRandomQuestions(chosen, excluded, sameCategoryCandidates, missingInCategory);
      }
    });

    const configuredCategoryIds = new Set(counts.map(item => item.categoryId));
    const fallbackPools = [
      WOMAI_DATA.questions.filter(q => q.active && q.isCore && configuredCategoryIds.has(q.categoryId) && !excluded.has(q.id)),
      WOMAI_DATA.questions.filter(q => q.active && configuredCategoryIds.has(q.categoryId) && !excluded.has(q.id)),
      WOMAI_DATA.questions.filter(q => q.active && q.isCore && !excluded.has(q.id)),
      WOMAI_DATA.questions.filter(q => q.active && !excluded.has(q.id))
    ];

    fallbackPools.forEach(pool => {
      if (chosen.length >= targetCount) return;
      addRandomQuestions(chosen, excluded, pool, targetCount - chosen.length);
    });

    const session = shuffle(chosen).slice(0, targetCount);
    return avoidSameFirstQuestion(session);
  }

  function currentQuestion() {
    return sessionQuestions[currentIndex];
  }

  function correctCount() {
    return sessionQuestions.reduce((sum, q) => sum + (answers[q.id] === q.correctChoiceId ? 1 : 0), 0);
  }

  function randomLead(ok) {
    const pool = ok ? positiveFeedbackLeads : negativeFeedbackLeads;
    return pool[randomIndex(pool.length)];
  }

  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  // Dodaje kropkę na końcu zdania tylko wtedy, gdy jej brakuje.
  function sentence(text) {
    const t = String(text || '').trim();
    return /[.!?…]$/.test(t) ? t : t + '.';
  }

  function accentFor(categoryId) {
    return CATEGORY_ACCENT[String(categoryId || '').trim().toLowerCase()] || 'none';
  }

  function factsCount(n) {
    if (n === 1) return '1 ciekawostka';
    const last = n % 10, lastTwo = n % 100;
    return n + (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14) ? ' ciekawostki' : ' ciekawostek');
  }

  function persistFinishedSession() {
    const correct = correctCount();
    memory.sessionsCompleted += 1;
    memory.totalCorrectAnswers += correct;
    memory.totalQuestionsAnswered += sessionQuestions.length;
    memory.lastPlayedAt = new Date().toISOString();
    const seen = new Set(memory.seenQuestionIds);
    sessionQuestions.forEach((question) => seen.add(question.id));
    memory.seenQuestionIds = Array.from(seen);
    saveMemory();
  }

  // Każdy ekran działa jak osobna strona: zmienia tytuł karty, przewija na
  // górę i przenosi fokus na swój nagłówek, żeby czytnik ekranu go odczytał.
  function showView(name, focusTarget, title) {
    currentView = name;
    Object.keys(views).forEach((key) => { views[key].hidden = key !== name; });
    topbar.hidden = name === 'start';
    if (name !== 'quiz') document.body.dataset.accent = 'none';
    document.title = (title ? title + ' – ' : '') + 'Odkryj WOMAI: quiz zmysłów';
    window.scrollTo(0, 0);
    if (focusTarget) window.setTimeout(() => focusTarget.focus(), 30);
  }

  // ---------- Quiz ----------

  function renderQuestion() {
    const q = currentQuestion();
    const total = sessionQuestions.length;
    const category = categoryLabel(q.categoryId);
    document.body.dataset.accent = accentFor(q.categoryId);
    progressLabel.textContent = `Pytanie ${currentIndex + 1} z ${total}`;
    progressFill.style.width = `${Math.round(((currentIndex + 1) / total) * 100)}%`;
    categoryBadge.textContent = 'Kategoria: ' + category;
    questionTitle.innerHTML = `<span class="sr">Pytanie ${currentIndex + 1} z ${total}, kategoria ${esc(category)}. </span>${esc(q.prompt)}`;
    choiceError.textContent = '';
    choicesWrap.innerHTML = '';

    q.choices.forEach((choice) => {
      const label = document.createElement('label');
      label.className = 'choice';
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = 'odpowiedz';
      input.value = choice.id;
      input.checked = selectedChoiceId === choice.id;
      input.disabled = feedbackShown;
      const text = document.createElement('span');
      text.textContent = choice.text;

      if (feedbackShown) {
        const isCorrect = choice.id === q.correctChoiceId;
        const isMine = choice.id === selectedChoiceId;
        label.classList.add(isCorrect ? 'is-correct' : isMine ? 'is-wrong' : 'is-other');
        if (isCorrect || isMine) {
          const result = document.createElement('span');
          result.className = 'choice-result';
          result.textContent = isCorrect ? (isMine ? 'Twoja odpowiedź: poprawna' : 'Poprawna odpowiedź') : 'Twoja odpowiedź';
          text.appendChild(result);
        }
      } else if (input.checked) {
        label.classList.add('is-selected');
      }

      label.append(input, text);
      choicesWrap.appendChild(label);
    });

    feedbackBox.hidden = !feedbackShown;
    if (feedbackShown) {
      const ok = selectedChoiceId === q.correctChoiceId;
      const correctText = (q.choices.find((c) => c.id === q.correctChoiceId) || {}).text || '';
      feedbackTitle.textContent = randomLead(ok);
      feedbackText.textContent = ok ? q.explanation : 'Poprawna odpowiedź: ' + sentence(correctText) + ' ' + q.explanation;
    }

    nextBtn.textContent = feedbackShown
      ? (currentIndex === total - 1 ? 'Zobacz wynik' : 'Następne pytanie')
      : 'Sprawdź odpowiedź';
  }

  function startSession() {
    if (!WOMAI_DATA) return;
    sessionQuestions = buildSessionQuestions();
    currentIndex = 0;
    selectedChoiceId = null;
    feedbackShown = false;
    answers = {};
    if (!sessionQuestions.length) return;
    memory.lastFirstQuestionId = sessionQuestions[0].id;
    saveMemory();
    renderQuestion();
    showView('quiz', questionTitle, `Pytanie 1 z ${sessionQuestions.length}`);
  }

  function showSummary() {
    const n = correctCount();
    const t = sessionQuestions.length;
    let message;
    if (n === t) message = 'Komplet! Masz wyczucie zmysłów.';
    else if (n === 0) message = 'Tym razem się nie udało, ale teraz wiesz więcej niż przed chwilą.';
    else if (n * 2 >= t) message = 'Nieźle! Część rzeczy na pewno Cię zaskoczyła.';
    else message = 'Coś już wiesz, a resztę możesz odkryć w WOMAI.';
    summaryHeading.textContent = `Twój wynik: ${n} z ${t}`;
    scoreBig.textContent = `${n} / ${t}`;
    summaryText.textContent = message;
    shareStatus.textContent = '';
    showView('summary', summaryHeading, 'Wynik');
  }

  function quizInProgress() {
    return currentView === 'quiz' && (currentIndex > 0 || selectedChoiceId || feedbackShown);
  }

  function goHome() {
    if (quizInProgress() && !window.confirm('Przerwać quiz? Odpowiedzi z tej rundy nie zostaną zapisane.')) return;
    sessionQuestions = [];
    showView('start', startTitle, '');
  }

  choicesWrap.addEventListener('change', (event) => {
    if (event.target.name !== 'odpowiedz' || feedbackShown) return;
    selectedChoiceId = event.target.value;
    choiceError.textContent = '';
    choicesWrap.querySelectorAll('.choice').forEach((label) => {
      label.classList.toggle('is-selected', label.querySelector('input').checked);
    });
  });

  nextBtn.addEventListener('click', () => {
    const q = currentQuestion();
    if (!feedbackShown) {
      if (!selectedChoiceId) {
        choiceError.textContent = 'Najpierw wybierz odpowiedź.';
        return;
      }
      answers[q.id] = selectedChoiceId;
      feedbackShown = true;
      renderQuestion();
      window.setTimeout(() => feedbackTitle.focus(), 30);
      return;
    }

    currentIndex += 1;
    selectedChoiceId = null;
    feedbackShown = false;
    if (currentIndex >= sessionQuestions.length) {
      persistFinishedSession();
      showSummary();
      return;
    }
    renderQuestion();
    showView('quiz', questionTitle, `Pytanie ${currentIndex + 1} z ${sessionQuestions.length}`);
  });

  async function shareResult() {
    const text = `Mój wynik w quizie Odkryj WOMAI: ${correctCount()} z ${sessionQuestions.length}. Sprawdź się!`;
    shareStatus.textContent = '';
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Odkryj WOMAI: quiz zmysłów', text, url: SHARE_URL });
        return;
      } catch (error) {
        if (error && error.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text + ' ' + SHARE_URL);
      shareStatus.textContent = 'Skopiowano wynik i link do schowka. Możesz je wkleić w wiadomości.';
    } catch (error) {
      shareStatus.textContent = text + ' ' + SHARE_URL;
    }
  }

  // ---------- O WOMAI i ciekawostki ----------

  function setFacts(facts) {
    const nextFacts = Array.isArray(facts) ? facts.filter((fact) => fact && fact.active !== false && fact.title && fact.text) : [];
    WOMAI_FACTS = nextFacts.length ? nextFacts : DEFAULT_FACTS.slice();
    currentFactIndex = Math.min(currentFactIndex, Math.max(WOMAI_FACTS.length - 1, 0));
  }

  const DEFAULT_ORDER = ['intro', 'path:ciemnosc', 'path:swiatlo', 'facts', 'visit'];

  // Bloki strony „O WOMAI” w kolejności ustawionej w panelu admina.
  // Puste bloki są pomijane.
  function aboutBlock(key, c) {
    if (key === 'intro') {
      const intro = c.about && String(c.about.intro || '').trim();
      return intro ? `<div class="about-block"><p>${esc(intro)}</p></div>` : '';
    }
    if (key === 'facts') {
      return `<section class="about-block" aria-labelledby="aboutFactsH"><h2 id="aboutFactsH">Ciekawostki</h2><p>${factsCount(WOMAI_FACTS.length)} o zmysłach, dostępności i doświadczeniach WOMAI.</p>` +
        '<button type="button" class="btn" id="openFactsBtn">Przeglądaj ciekawostki</button></section>';
    }
    if (key === 'visit') {
      const v = c.visit || {};
      const items = [['Adres', v.address], ['Godziny otwarcia', v.hours], ['Bilety', v.tickets]].filter(([, val]) => String(val || '').trim());
      const website = String(v.website || '').trim();
      const hasSite = /^https:\/\//i.test(website);
      if (!items.length && !hasSite) return '';
      return '<section class="about-block tile visit" aria-labelledby="aboutVisitH"><h2 id="aboutVisitH">Odwiedź nas</h2><dl>' +
        items.map(([label, val]) => `<dt>${label}</dt><dd>${esc(val)}</dd>`).join('') +
        (hasSite ? `<dt>Strona internetowa</dt><dd><a href="${esc(website)}" target="_blank" rel="noopener">Godziny, bilety i oferta na stronie WOMAI (otwiera się w nowej karcie)</a></dd>` : '') +
        '</dl></section>';
    }
    if (key.startsWith('path:')) {
      const id = key.slice(5);
      const p = (Array.isArray(c.paths) ? c.paths : []).find((x) => x && x.id === id);
      if (!p || !String(p.text || '').trim()) return '';
      return `<section class="about-block tile tile-${PATH_ACCENT[p.id] || 'n'}" aria-labelledby="aboutPath-${esc(p.id)}"><h2 id="aboutPath-${esc(p.id)}">${esc(p.title)}</h2><p>${esc(p.text)}</p></section>`;
    }
    if (key.startsWith('section:')) {
      const id = key.slice(8);
      const sec = (Array.isArray(c.sections) ? c.sections : []).find((x) => x && x.id === id);
      if (!sec || sec.active === false || !sec.title || !sec.text) return '';
      return `<section class="about-block" aria-labelledby="aboutSec-${esc(sec.id)}"><h2 id="aboutSec-${esc(sec.id)}">${esc(sec.title)}</h2><p>${esc(sec.text)}</p></section>`;
    }
    return '';
  }

  function renderAbout() {
    const c = CONTENT || {};
    const sectionKeys = (Array.isArray(c.sections) ? c.sections : []).map((x) => 'section:' + x.id);
    const order = Array.isArray(c.order) && c.order.length ? c.order.slice() : DEFAULT_ORDER.concat(sectionKeys);
    if (!order.includes('facts')) order.push('facts');
    aboutBody.innerHTML = order.map((key) => aboutBlock(key, c)).join('');
  }

  function openAbout(focusFactsButton) {
    renderAbout();
    showView('about', focusFactsButton ? byId('openFactsBtn') : aboutHeading, 'O WOMAI');
  }

  function renderFacts() {
    const fact = WOMAI_FACTS[currentFactIndex];
    if (!fact) return;
    factsBadge.textContent = fact.category || 'Ciekawostka';
    factsHeading.textContent = fact.title;
    factsText.textContent = fact.text;
    factsMeta.textContent = `Ciekawostka ${currentFactIndex + 1} z ${WOMAI_FACTS.length}`;
  }

  function openFacts() {
    renderFacts();
    showView('facts', factsHeading, 'Ciekawostki');
  }

  function nextFact() {
    currentFactIndex = (currentFactIndex + 1) % WOMAI_FACTS.length;
    renderFacts();
    window.setTimeout(() => factsHeading.focus(), 30);
  }

  // ---------- Wczytywanie danych ----------

  async function loadGuestData() {
    try {
      WOMAI_DATA = await api.getGuestData();
      if (!WOMAI_DATA.questions || WOMAI_DATA.questions.length < 4) {
        throw new Error('Za mało pytań do rozpoczęcia quizu.');
      }
      loadingBox.textContent = '';
      errorBox.hidden = true;
      startBtn.disabled = false;
    } catch (error) {
      loadingBox.textContent = '';
      errorBox.textContent = 'Nie udało się wczytać pytań. Sprawdź połączenie z internetem i odśwież stronę.';
      errorBox.hidden = false;
      startBtn.disabled = true;
    }
  }

  async function loadContent() {
    try {
      if (typeof api.getFactsData !== 'function') throw new Error('Brak funkcji pobierania treści.');
      CONTENT = await api.getFactsData();
      setFacts(CONTENT.facts);
    } catch (error) {
      CONTENT = null;
      setFacts(DEFAULT_FACTS);
    }
    if (currentView === 'about') renderAbout();
  }

  startBtn.addEventListener('click', startSession);
  aboutBtn.addEventListener('click', () => openAbout(false));
  homeBtn.addEventListener('click', goHome);
  summaryAboutBtn.addEventListener('click', () => openAbout(false));
  playAgainBtn.addEventListener('click', startSession);
  shareBtn.addEventListener('click', shareResult);
  aboutQuizBtn.addEventListener('click', startSession);
  aboutBody.addEventListener('click', (event) => { if (event.target.closest('#openFactsBtn')) openFacts(); });
  nextFactBtn.addEventListener('click', nextFact);
  factsBackBtn.addEventListener('click', () => openAbout(true));
  factsQuizBtn.addEventListener('click', startSession);

  setFacts(DEFAULT_FACTS);
  loadGuestData();
  loadContent();
}());
