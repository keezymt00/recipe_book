// state.js – flüchtiger App-Zustand im Speicher (überlebt Ansichtswechsel, nicht Neuladen)

export const state = {
  // Filter der Rezeptliste bleiben erhalten, wenn man ins Detail und zurück geht
  list: { q: '', tags: new Set(), fav: false, maxTime: 0, scrollY: 0 },
  // Vom Import erkanntes Rezept, das das Formular vorbefüllt
  draft: null,
  // Aktuelle und vorige Route (für "Zurück" per history.back())
  curPath: null,
  prevPath: null,
};
