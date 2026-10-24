// views/detail.js – Rezeptansicht mit Titelbild, Info-Leiste und Portionsrechner

import { get, saveRecipe } from '../db.js';
import { formatQty } from '../units.js';
import { upcomingDays, addToDay, dayLabel } from '../plan.js';
import { h, icon, glassBtn, navbar, recipeImage, posInt, toast } from '../ui.js';
import { pickDay } from './sheets.js';

export async function render(root, [id], query) {
  const r = await get('recipes', id);
  if (!r) {
    root.append(navbar({ back: '#/' }),
      h('div.empty', null, icon('book'), h('h3', null, 'Nicht gefunden'), h('p', null, 'Dieses Rezept gibt es nicht (mehr).')));
    return;
  }

  let servings = posInt(query.get('p')) || r.servings;

  /* --- Navigationsleiste über dem Titelbild --- */
  const heart = glassBtn(r.favorite ? 'heartFill' : 'heart', 'Favorit', async () => {
    r.favorite = !r.favorite;
    await saveRecipe(r, { touch: false });
    heart.classList.toggle('on', r.favorite);
    heart.replaceChildren(icon(r.favorite ? 'heartFill' : 'heart'));
  }, r.favorite ? 'on' : '');
  // Mit der aktuell eingestellten Portionszahl in den Planer übernehmen
  async function planIt() {
    const iso = await pickDay({ title: `${servings} Portionen einplanen`, existingDays: await upcomingDays(), includeExisting: true });
    if (!iso) return;
    try {
      await addToDay(iso, r.id, servings);
      toast(`Für ${dayLabel(iso)} eingeplant`);
    } catch (err) {
      toast(err.message);
    }
  }
  const nav = navbar({
    title: r.title,
    back: '#/',
    overlay: true,
    actions: [heart, glassBtn('calendarPlus', 'Einplanen', planIt), glassBtn('edit', 'Bearbeiten', `#/bearbeiten/${r.id}`)],
  });

  /* --- Portionsrechner --- */
  const servingsEl = h('span.row-value.rounded');
  const minus = h('button', { type: 'button', 'aria-label': 'Weniger Portionen', onclick: () => setServings(servings - 1) }, icon('minus'));
  const plus = h('button', { type: 'button', 'aria-label': 'Mehr Portionen', onclick: () => setServings(servings + 1) }, icon('plus'));
  const ingGroup = h('div.group');
  const cookBtn = h('a.btn.btn-primary.fab', null, icon('playFill'), 'Kochmodus starten');

  function setServings(n) {
    servings = Math.min(99, Math.max(1, n));
    servingsEl.textContent = String(servings);
    minus.disabled = servings <= 1;
    cookBtn.href = `#/kochen/${r.id}?p=${servings}`;
    // Portionen in der URL merken (ohne neuen Verlaufseintrag), damit "Zurück" aus dem Kochmodus passt
    history.replaceState(null, '', `#/rezept/${r.id}?p=${servings}`);
    renderIngredients();
  }

  function renderIngredients() {
    const factor = servings / r.servings;
    ingGroup.replaceChildren(
      h('div.row', null, h('span.row-main', null, 'Portionen'), servingsEl, h('div.stepper', null, minus, plus)),
      ...r.ingredients.map((ing) =>
        // Antippen hakt ab – praktisch beim Bereitstellen der Zutaten
        h('div.row.ing-row', { onclick: (e) => e.currentTarget.classList.toggle('done') },
          h('span.check', null, icon('check')),
          h('span.ing-name', null, ing.name),
          h('span.ing-qty', null, ing.amount != null ? formatQty(ing.amount * factor, ing.unit) : ''))));
  }

  /* --- Info-Leiste (nur vorhandene Werte) --- */
  const n = r.nutrition || {};
  const stats = [
    r.timeMin ? ['Zeit', r.timeMin, 'Min.'] : null,
    n.protein ? ['Protein', n.protein, 'g / Portion'] : null,
    n.kcal ? ['Energie', n.kcal, 'kcal / Portion'] : null,
  ].filter(Boolean);

  const heroWrap = h('div.hero-wrap', null, recipeImage(r, 'hero'));

  root.append(
    nav,
    heroWrap,
    h('div.content', null,
      h('h1.recipe-title', null, r.title),
      r.tags.length ? h('p.recipe-sub', null, r.tags.join(' · ')) : null,
      stats.length ? h('div.stats', null, stats.map(([label, value, unit]) =>
        h('div.stat', null,
          h('div.stat-label', null, label),
          h('div.stat-value', null, String(value)),
          h('div.stat-unit', null, unit)))) : null,

      h('div.section-header', null, h('h2', null, 'Zutaten')),
      ingGroup,

      h('div.section-header', null, h('h2', null, 'Zubereitung'), r.steps.length ? h('span.aside', null, `${r.steps.length} Schritte`) : null),
      r.steps.length
        ? h('div.group', null, r.steps.map((s, i) =>
          h('div.row.step', null,
            h('span.num', null, String(i + 1)),
            h('div.row-main', null,
              h('div.step-text', null, s.text),
              s.timerMin ? h('span.badge', null, icon('timer'), `${s.timerMin} Min.`) : null))))
        : h('p.footnote', null, 'Keine Schritte eingetragen.'),

      r.notes ? [h('div.section-header', null, h('h2', null, 'Notizen')), h('div.group', null, h('div.row.notes', null, r.notes))] : null,
      // Platz, damit der schwebende Button nichts verdeckt
      r.steps.length ? h('div', { style: 'height:80px' }) : null,
    ),
    ...(r.steps.length ? [cookBtn] : []),
  );

  setServings(servings);

  return {
    // Material der Leiste erst, wenn das Titelbild weggescrollt ist
    mounted: () => { nav.dataset.threshold = Math.max(2, heroWrap.offsetHeight - nav.offsetHeight - 20); },
  };
}
