window.WOMAI_CONFIG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbw4DT_QBC8em-TEXhP7BeAiiFZDrZqzSpLeOuy9HziSqlEVqwWiTbMql1qi0uSsuZ9v/exec',
  requestTimeoutMs: 10000,
  guest: {
    sessionQuestionCountFallback: 4,
    categoryQuestionCounts: {
      'ciemność': 2,
      'światło': 2
    },
    storageKey: 'womai_guest_progress_v2',
    fallbackDataUrl: '/odkryj-womai/data/fallback-questions.json',
    factsDataUrl: '/odkryj-womai/data/facts.json',
    requestTimeoutMs: 10000
  },
  admin: {
    storageKey: 'womai_admin_v5_connection',
    requestTimeoutMs: 15000
  }
};
