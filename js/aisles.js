// aisles.js – Supermarktbereiche und automatische Zuordnung von Zutaten

export const AISLES = [
  { id: 'obst', label: 'Obst & Gemüse', emoji: '🥦' },
  { id: 'fleisch', label: 'Fleisch & Fisch', emoji: '🥩' },
  { id: 'milch', label: 'Milchprodukte & Eier', emoji: '🧀' },
  { id: 'trocken', label: 'Trockenware & Konserven', emoji: '🍝' },
  { id: 'gewuerze', label: 'Gewürze, Öle & Saucen', emoji: '🧂' },
  { id: 'sonstiges', label: 'Sonstiges', emoji: '🛒' },
];

/** Kleinschreibung ohne Akzente/Umlaute ("Hähnchen" → "hahnchen"), für robuste Vergleiche */
export function fold(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss');
}

// Stichwort → Bereich. Gewinnt das LÄNGSTE passende Stichwort, damit z. B.
// "Paprikapulver" (Gewürz) vor "Paprika" (Gemüse) und "Kokosmilch" vor "Milch" greift.
const KEYWORDS = {
  obst: [
    'tomate', 'kirschtomate', 'cherrytomate', 'zwiebel', 'frühlingszwiebel', 'schalotte', 'knoblauch', 'kartoffel',
    'süßkartoffel', 'paprika', 'zucchini', 'aubergine', 'karotte', 'möhre', 'brokkoli', 'blumenkohl', 'spinat',
    'salat', 'rucola', 'gurke', 'avocado', 'zitrone', 'limette', 'orange', 'apfel', 'banane', 'mango', 'beeren',
    'ingwer', 'petersilie', 'koriander', 'schnittlauch', 'basilikum', 'minze', 'lauch', 'porree', 'champignon',
    'pilz', 'kürbis', 'sellerie', 'kohl', 'grüne bohnen', 'erbsen', 'chilischote', 'jalapeño', 'mais frisch',
  ],
  fleisch: [
    'hähnchen', 'huhn', 'pollo', 'pute', 'truthahn', 'rind', 'schwein', 'hack', 'gulasch', 'steak', 'filet',
    'speck', 'bacon', 'schinken', 'serrano', 'chorizo', 'wurst', 'garnele', 'gambas', 'shrimp', 'lachs', 'fisch',
    'thunfisch', 'kabeljau', 'dorade', 'muschel', 'tintenfisch', 'calamar', 'lomo',
  ],
  milch: [
    'milch', 'joghurt', 'sahne', 'butter', 'käse', 'quark', 'frischkäse', 'mozzarella', 'parmesan', 'feta',
    'schmand', 'crème fraîche', 'creme fraiche', 'skyr', 'queso', 'ei', 'eier', 'eigelb', 'eiweiß',
  ],
  trocken: [
    'reis', 'basmati', 'nudel', 'pasta', 'spaghetti', 'penne', 'mehl', 'zucker', 'linsen', 'kichererbsen',
    'bohnen', 'kidneybohnen', 'mais', 'kokosmilch', 'tomatenmark', 'tomaten gehackt', 'gehackte tomaten',
    'passierte tomaten', 'stückige tomaten', 'tomate frito', 'paniermehl', 'semmelbrösel', 'haferflocken',
    'tortilla', 'wraps', 'brot', 'toast', 'nüsse', 'mandeln', 'sesam', 'stärke', 'couscous', 'quinoa', 'oliven',
  ],
  gewuerze: [
    'salz', 'pfeffer', 'paprikapulver', 'pimentón', 'kreuzkümmel', 'kümmel', 'oregano', 'thymian', 'rosmarin',
    'lorbeer', 'zimt', 'curry', 'currypulver', 'chiliflocken', 'chilipulver', 'cayenne', 'muskat', 'safran',
    'kurkuma', 'garam masala', 'knoblauchpulver', 'zwiebelpulver', 'gewürz', 'brühe', 'fond', 'sojasauce',
    'sojasoße', 'essig', 'apfelessig', 'reisessig', 'honig', 'senf', 'ketchup', 'mayonnaise', 'sriracha',
    'tabasco', 'worcester', 'austernsauce', 'fischsauce', 'teriyaki', 'öl', 'olivenöl', 'sonnenblumenöl',
    'sesamöl', 'rapsöl', 'pflanzenöl',
  ],
};

const RULES = Object.entries(KEYWORDS)
  .flatMap(([aisle, words]) => words.map((w) => ({ aisle, word: fold(w) })))
  .sort((a, b) => b.word.length - a.word.length);

/** Zutatenname → Bereichs-ID (Fallback "sonstiges") */
export function guessAisle(name) {
  const n = fold(name);
  for (const { aisle, word } of RULES) {
    // Sehr kurze Stichwörter ("ei", "öl") nur als ganzes Wort, sonst trifft "ei" auch "Weißwein"
    const hit = word.length <= 3
      ? new RegExp(`(^|[^a-z])${word}([^a-z]|$)`).test(n)
      : n.includes(word);
    if (hit) return aisle;
  }
  return 'sonstiges';
}
