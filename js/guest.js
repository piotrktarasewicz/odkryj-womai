(function () {
  'use strict';

  const config = window.WOMAI_CONFIG || {};
  const api = window.WOMAI_API || {};
  const positiveFeedbackLeads = ['Brawo.', 'Super.', 'Świetnie.', 'Bardzo dobrze.', 'Dokładnie tak.'];
  const negativeFeedbackLeads = ['Nie do końca.', 'Tym razem nie.', 'To jeszcze nie to.', 'Spójrzmy na to inaczej.'];
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

  const startView = document.getElementById('startView');
  const quizView = document.getElementById('quizView');
  const summaryView = document.getElementById('summaryView');
  const factsView = document.getElementById('factsView');
  const startBtn = document.getElementById('startBtn');
  const factsBtn = document.getElementById('factsBtn');
  const restartBtn = document.getElementById('restartBtn');
  const playAgainBtn = document.getElementById('playAgainBtn');
  const summaryFactsBtn = document.getElementById('summaryFactsBtn');
  const helpBtn = document.getElementById('helpBtn');
  const helpBox = document.getElementById('helpBox');
  const loadingBox = document.getElementById('loadingBox');
  const errorBox = document.getElementById('errorBox');
  const progressLabel = document.getElementById('progressLabel');
  const progressFill = document.getElementById('progressFill');
  const progressBar = progressFill.closest('[role="progressbar"]');
  const sessionMeta = document.getElementById('sessionMeta');
  const categoryBadge = document.getElementById('categoryBadge');
  const questionTitle = document.getElementById('questionTitle');
  const choicesWrap = document.getElementById('choicesWrap');
  const feedbackBox = document.getElementById('feedbackBox');
  const feedbackTitle = document.getElementById('feedbackTitle');
  const feedbackText = document.getElementById('feedbackText');
  const selectionState = document.getElementById('selectionState');
  const nextBtn = document.getElementById('nextBtn');
  const scoreText = document.getElementById('scoreText');
  const summaryHeading = document.getElementById('summaryHeading');
  const factsBadge = document.getElementById('factsBadge');
  const factsHeading = document.getElementById('factsHeading');
  const factsText = document.getElementById('factsText');
  const factsMeta = document.getElementById('factsMeta');
  const nextFactBtn = document.getElementById('nextFactBtn');
  const factsBackBtn = document.getElementById('factsBackBtn');
  const factsQuizBtn = document.getElementById('factsQuizBtn');

  const STORAGE_KEY = config.guest?.storageKey || 'womai_guest_progress_v2';
  const categoryQuestionCounts = config.guest?.categoryQuestionCounts || {
    'ciemność': 2,
    'światło': 2
  };

  let WOMAI_DATA = null;
  let WOMAI_FACTS = DEFAULT_FACTS.slice();
  let sessionQuestions = [];
  let currentIndex = 0;
  let currentFactIndex = 0;
  let selectedChoiceId = null;
  let feedbackShown = false;
  let answers = {};
  let factsOpen = false;

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
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

  function currentFact() {
    return WOMAI_FACTS[currentFactIndex];
  }

  function randomLead(ok) {
    const pool = ok ? positiveFeedbackLeads : negativeFeedbackLeads;
    return pool[randomIndex(pool.length)];
  }

  function correctCount() {
    return sessionQuestions.reduce((sum, q) => sum + (answers[q.id] === q.correctChoiceId ? 1 : 0), 0);
  }

  function focusQuestionHeading() {
    requestAnimationFrame(() => questionTitle.focus());
  }

  function focusSelectedChoice() {
    requestAnimationFrame(() => {
      const selectedButton = Array.from(choicesWrap.querySelectorAll('.choice')).find(
        button => button.dataset.choiceId === selectedChoiceId
      );
      if (selectedButton) selectedButton.focus();
    });
  }

  function focusFeedback() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => feedbackTitle.focus());
    });
  }

  function focusSummary() {
    requestAnimationFrame(() => summaryHeading.focus());
  }

  function focusFactHeading() {
    requestAnimationFrame(() => factsHeading.focus());
  }

  function persistFinishedSession() {
    const correct = correctCount();
    memory.sessionsCompleted += 1;
    memory.totalCorrectAnswers += correct;
    memory.totalQuestionsAnswered += sessionQuestions.length;
    memory.lastPlayedAt = new Date().toISOString();
    const seen = new Set(memory.seenQuestionIds);
    sessionQuestions.forEach(question => seen.add(question.id));
    memory.seenQuestionIds = Array.from(seen);
    saveMemory();
  }

  function showError(text) {
    errorBox.textContent = text;
    errorBox.classList.remove('hidden');
  }

  function hideError() {
    errorBox.textContent = '';
    errorBox.classList.add('hidden');
  }

  function setFacts(facts) {
    const nextFacts = Array.isArray(facts) ? facts.filter(fact => fact && fact.active !== false) : [];
    WOMAI_FACTS = nextFacts.length ? nextFacts : DEFAULT_FACTS.slice();
    currentFactIndex = Math.min(currentFactIndex, Math.max(WOMAI_FACTS.length - 1, 0));
    factsBtn.disabled = WOMAI_FACTS.length === 0;
    if (summaryFactsBtn) summaryFactsBtn.disabled = WOMAI_FACTS.length === 0;
  }

  function renderFacts() {
    const fact = currentFact();
    if (!fact) return;

    factsBadge.textContent = fact.category || 'Ciekawostka';
    factsHeading.textContent = fact.title;
    factsText.textContent = fact.text;
    factsMeta.textContent = `Ciekawostka ${currentFactIndex + 1} z ${WOMAI_FACTS.length}`;
  }

  function render() {
    const showSummary = sessionQuestions.length > 0 && currentIndex >= sessionQuestions.length;
    startView.classList.toggle('hidden', factsOpen || sessionQuestions.length > 0);
    quizView.classList.toggle('hidden', factsOpen || sessionQuestions.length === 0 || showSummary);
    summaryView.classList.toggle('hidden', factsOpen || !showSummary);
    factsView.classList.toggle('hidden', !factsOpen);

    if (factsOpen) {
      renderFacts();
      return;
    }

    if (showSummary) {
      scoreText.textContent = `${correctCount()} / ${sessionQuestions.length}`;
      focusSummary();
      return;
    }

    if (!sessionQuestions.length) return;

    const question = currentQuestion();
    const progress = Math.round(((currentIndex + 1) / sessionQuestions.length) * 100);

    progressLabel.textContent = `Pytanie ${currentIndex + 1} z ${sessionQuestions.length}`;
    progressFill.style.width = `${progress}%`;
    progressBar.setAttribute('aria-valuenow', String(progress));
    sessionMeta.textContent = 'Nowa sesja, nowe pytania';
    categoryBadge.textContent = categoryLabel(question.categoryId);
    questionTitle.textContent = question.prompt;
    choicesWrap.innerHTML = '';
    feedbackBox.classList.add('hidden');

    question.choices.forEach(choice => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'choice';
      btn.dataset.choiceId = choice.id;
      btn.textContent = choice.text;

      const isSelected = selectedChoiceId === choice.id;
      btn.setAttribute('aria-pressed', String(isSelected));
      if (isSelected) btn.classList.add('selected');

      if (feedbackShown) {
        if (choice.id === question.correctChoiceId) btn.classList.add('correct');
        if (isSelected && choice.id !== question.correctChoiceId) btn.classList.add('wrong');
      }

      btn.addEventListener('click', () => {
        if (feedbackShown) return;
        selectedChoiceId = choice.id;
        selectionState.textContent = `Wybrano odpowiedź: ${choice.text}`;
        nextBtn.disabled = false;
        render();
        focusSelectedChoice();
      });

      choicesWrap.appendChild(btn);
    });

    if (feedbackShown) {
      const ok = selectedChoiceId === question.correctChoiceId;
      const correctText = question.choices.find(c => c.id === question.correctChoiceId)?.text || '';
      feedbackTitle.textContent = randomLead(ok);
      feedbackText.textContent = ok
        ? question.explanation
        : `Poprawna odpowiedź: ${correctText}. ${question.explanation}`;
      feedbackBox.classList.remove('hidden');
    }

    nextBtn.textContent = feedbackShown
      ? (currentIndex === sessionQuestions.length - 1 ? 'Zobacz podsumowanie' : 'Dalej')
      : 'Sprawdź odpowiedź';
    nextBtn.disabled = !selectedChoiceId;
  }

  function startSession() {
    factsOpen = false;
    sessionQuestions = buildSessionQuestions();
    currentIndex = 0;
    selectedChoiceId = null;
    feedbackShown = false;
    answers = {};
    if (sessionQuestions.length > 0) {
      memory.lastFirstQuestionId = sessionQuestions[0].id;
      saveMemory();
    }
    render();
    focusQuestionHeading();
  }

  function openFacts() {
    if (!WOMAI_FACTS.length) {
      showError('Nie udało się załadować ciekawostek. Spróbuj ponownie za chwilę.');
      return;
    }
    factsOpen = true;
    render();
    focusFactHeading();
  }

  function closeFacts() {
    factsOpen = false;
    render();
    if (!sessionQuestions.length) {
      requestAnimationFrame(() => factsBtn.focus());
    } else if (currentIndex >= sessionQuestions.length) {
      requestAnimationFrame(() => summaryFactsBtn.focus());
    }
  }

  function nextFact() {
    if (!WOMAI_FACTS.length) return;
    currentFactIndex = (currentFactIndex + 1) % WOMAI_FACTS.length;
    renderFacts();
    focusFactHeading();
  }

  async function loadGuestData() {
    try {
      WOMAI_DATA = await api.getGuestData();
      if (!WOMAI_DATA.questions || WOMAI_DATA.questions.length < 4) {
        throw new Error('Za mało aktywnych pytań do uruchomienia sesji.');
      }
      loadingBox.textContent = 'Quiz jest gotowy.';
      startBtn.disabled = false;
      hideError();
    } catch (error) {
      loadingBox.textContent = 'Nie udało się pobrać pytań.';
      showError(error.message || 'Nie udało się pobrać pytań.');
      startBtn.disabled = true;
    }
  }

  async function loadFactsData() {
    try {
      if (typeof api.getFactsData !== 'function') {
        throw new Error('Brak funkcji pobierania ciekawostek.');
      }
      const data = await api.getFactsData();
      setFacts(data.facts);
    } catch (error) {
      setFacts(DEFAULT_FACTS);
    }
  }

  nextBtn.addEventListener('click', () => {
    const question = currentQuestion();
    if (!selectedChoiceId) return;

    if (!feedbackShown) {
      answers[question.id] = selectedChoiceId;
      feedbackShown = true;
      nextBtn.blur();
      render();
      focusFeedback();
      return;
    }

    currentIndex += 1;
    selectedChoiceId = null;
    feedbackShown = false;
    selectionState.textContent = '';

    if (currentIndex >= sessionQuestions.length) {
      persistFinishedSession();
    }

    render();
    if (currentIndex < sessionQuestions.length) {
      focusQuestionHeading();
    }
  });

  startBtn.addEventListener('click', startSession);
  factsBtn.addEventListener('click', openFacts);
  restartBtn.addEventListener('click', startSession);
  playAgainBtn.addEventListener('click', startSession);
  if (summaryFactsBtn) summaryFactsBtn.addEventListener('click', openFacts);
  nextFactBtn.addEventListener('click', nextFact);
  factsBackBtn.addEventListener('click', closeFacts);
  factsQuizBtn.addEventListener('click', startSession);

  helpBtn.addEventListener('click', () => {
    const willShow = helpBox.hidden;
    helpBox.hidden = !willShow;
    helpBox.classList.toggle('hidden', !willShow);
    helpBtn.setAttribute('aria-expanded', String(willShow));
  });

  setFacts(DEFAULT_FACTS);
  loadGuestData();
  loadFactsData();
}());
