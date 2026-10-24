// views/list.js – Rezeptübersicht als Kachelraster mit Suche, Favoriten-, Zeit- und Tag-Filter

import { getAll, getMeta, saveRecipe } from '../db.js';
import { getConfig, getStatus } from '../cloud.js';
import { fold } from '../aisles.js';
import { h, icon, glassBtn, largeTitle, recipeImage, formatMinutes } from '../ui.js';
import { state } from '../state.js';

const TIME_FILTERS = [20, 30, 45];
const BACKUP_REMINDER_DAYS = 7;

export async function render(root) {
  const f = state.list;
  const recipes = (await getAll('recipes')).sort((a, b) => a.title.localeCompare(b.title, 'de'));

  // Tags nach Häufigkeit sortieren; Filter für gelöschte Tags verwerfen
  const tagCount = new Map();
  recipes.forEach((r) => r.tags.forEach((t) => tagCount.set(t, (tagCount.get(t) || 0) + 1)));
  const allTags = [...tagCount.keys()].sort((a, b) => tagCount.get(b) - tagCount.get(a) || a.localeCompare(b, 'de'));
  for (const t of f.tags) if (!tagCount.has(t)) f.tags.delete(t);

  const pillsEl = h('div.pills');
  const tilesEl = h('div.tiles');
  const countEl = h('p.footnote.center');

  const searchInput = h('input', {
    type: 'search',
    placeholder: 'Suchen',
    value: f.q,
    enterkeyhint: 'search',
    autocomplete: 'off',
    'aria-label': 'Rezepte nach Titel, Zutat oder Tag durchsuchen',
    oninput: (e) => { f.q = e.target.value; updateList(); },
  });

  const [nav, head] = largeTitle('Rezepte', [
    glassBtn('clipboard', 'Rezepttext importieren', '#/import'),
    glassBtn('plus', 'Neues Rezept', '#/neu'),
  ]);
  head.append(...[await backupBanner(), h('label.search', null, icon('search'), searchInput), pillsEl, tilesEl, countEl].filter(Boolean));
  root.append(nav, head);

  /* --- Filter-Pills --- */
  function pill(label, on, toggle) {
    return h(`button.pill${on ? '.on' : ''}`, {
      type: 'button',
      'aria-pressed': String(on),
      onclick: () => { toggle(); renderPills(); updateList(); },
    }, label);
  }

  function renderPills() {
    pillsEl.replaceChildren(...[
      pill('Favoriten', f.fav, () => { f.fav = !f.fav; }),
      TIME_FILTERS.map((min) => pill(`≤ ${min} Min.`, f.maxTime === min, () => { f.maxTime = f.maxTime === min ? 0 : min; })),
      allTags.length ? h('span.pill-sep') : [],
      allTags.map((t) => pill(t, f.tags.has(t), () => { if (f.tags.has(t)) f.tags.delete(t); else f.tags.add(t); })),
    ].flat());
  }

  /* --- Filtern --- */
  function matches(r) {
    if (f.fav && !r.favorite) return false;
    if (f.maxTime && !(r.timeMin && r.timeMin <= f.maxTime)) return false;
    for (const t of f.tags) if (!r.tags.includes(t)) return false;
    // Jedes Suchwort muss irgendwo in Titel, Tags oder Zutaten vorkommen ("hähnchen paprika")
    const terms = fold(f.q).split(/\s+/).filter(Boolean);
    if (!terms.length) return true;
    const haystack = fold([r.title, ...r.tags, ...r.ingredients.map((i) => i.name)].join(' '));
    return terms.every((t) => haystack.includes(t));
  }

  function updateList() {
    const shown = recipes.filter(matches);
    countEl.textContent = shown.length !== recipes.length
      ? `${shown.length} von ${recipes.length} Rezepten`
      : `${recipes.length} Rezepte`;

    if (!recipes.length) {
      tilesEl.style.display = 'none';
      countEl.replaceChildren(h('div.empty', null,
        icon('book'),
        h('h3', null, 'Noch keine Rezepte'),
        h('p', null, 'Leg dein erstes Rezept an oder importiere einen Text.'),
        h('a.btn.btn-primary', { href: '#/neu' }, 'Rezept anlegen')));
      return;
    }
    if (!shown.length) {
      tilesEl.style.display = 'none';
      countEl.replaceChildren(h('div.empty', null,
        icon('search'),
        h('h3', null, 'Keine Treffer'),
        h('p', null, 'Probier einen anderen Suchbegriff oder Filter.'),
        h('button.btn.btn-tinted', { type: 'button', onclick: resetFilters }, 'Filter zurücksetzen')));
      return;
    }
    tilesEl.style.display = '';
    tilesEl.replaceChildren(...shown.map(tile));
  }

  function resetFilters() {
    Object.assign(f, { q: '', fav: false, maxTime: 0 });
    f.tags.clear();
    searchInput.value = '';
    renderPills();
    updateList();
  }

  function tile(r) {
    const heart = glassBtn(r.favorite ? 'heartFill' : 'heart', r.favorite ? 'Favorit entfernen' : 'Als Favorit markieren', async (e) => {
      e.preventDefault(); // Kachel ist ein Link – nicht navigieren
      r.favorite = !r.favorite;
      await saveRecipe(r, { touch: false });
      heart.classList.toggle('on', r.favorite);
      heart.replaceChildren(icon(r.favorite ? 'heartFill' : 'heart'));
      if (f.fav) updateList();
    }, r.favorite ? 'on' : '');

    const meta = [r.timeMin ? formatMinutes(r.timeMin) : null, r.nutrition?.protein ? `${r.nutrition.protein} g Protein` : null]
      .filter(Boolean).join(' · ');

    return h('a.tile', { href: `#/rezept/${r.id}` },
      h('div.tile-media', null, recipeImage(r), heart),
      h('h3.tile-title', null, r.title),
      meta ? h('p.tile-meta', null, meta) : null);
  }

  renderPills();
  updateList();

  return {
    mounted: () => window.scrollTo(0, f.scrollY),
    cleanup: () => { f.scrollY = window.scrollY; },
  };
}

/**
 * Hinweis oben in der Liste:
 *  - automatisches Backup an, aber seit über einem Tag fehlgeschlagen → Warnung
 *  - kein automatisches Backup und seit über einer Woche ungesicherte Änderungen → Empfehlung
 */
async function backupBanner() {
  const banner = (color, iconName, title, sub) => h('a.group', { href: '#/backup', style: 'display:block;margin-bottom:14px' },
    h('div.row', null,
      h('span.app-icon', { style: `--c:${color}` }, icon(iconName)),
      h('div.row-main', null, title, h('span.row-sub', null, sub)),
      h('span.chev', null, icon('chevron'))));

  if (await getConfig()) {
    const st = await getStatus();
    const failing = st.lastError && (!st.lastSuccess || st.lastErrorAt > st.lastSuccess);
    if (failing && Date.now() - (st.lastSuccess || 0) > 864e5) {
      return banner('var(--red)', 'info', 'Backup funktioniert nicht', st.lastError);
    }
    return null;
  }
  const since = await getMeta('pendingSince', 0);
  if (!since || Date.now() - since < BACKUP_REMINDER_DAYS * 864e5) return null;
  const days = Math.floor((Date.now() - since) / 864e5);
  return banner('var(--blue)', 'refresh', 'Automatisches Backup einrichten', `Ungesicherte Änderungen seit ${days} Tagen`);
}
