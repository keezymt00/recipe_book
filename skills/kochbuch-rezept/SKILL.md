---
name: kochbuch-rezept
description: Wandelt Rezepte aus beliebigen Quellen (Link zu einer Rezeptseite, Screenshot, Foto einer Kochbuchseite, Instagram/TikTok-Beschreibung, eingefügter Text oder nur eine Idee wie "High-Protein Meal Prep mit Hähnchen") in einen sauberen deutschen Rezepttext um, der sich 1:1 in die Kochbuch-App (PWA) importieren lässt. Verwenden, wenn der Nutzer ein Rezept für sein Kochbuch, seine Koch-App oder zum Importieren haben möchte, ein Rezept "umwandeln", "aufbereiten" oder "importierbar machen" will, oder einfach einen Rezept-Link oder ein Rezeptfoto schickt.
---

# Kochbuch-Rezept für den App-Import

Ziel: Aus jeder Eingabe entsteht **ein Codeblock** mit einem Rezepttext in exakt dem Format unten. Der Nutzer kopiert ihn auf dem iPhone und fügt ihn in der Kochbuch-App unter **Rezepte → Klemmbrett-Symbol → Einsetzen → Erkennen** ein. Der Parser der App ist streng – halte dich genau an das Format.

## Ablauf

1. **Quelle erfassen**
   - *Link:* Seite abrufen und das vollständige Rezept lesen (Zutaten mit Mengen, alle Schritte, Portionen, Zeit). Viele Seiten enthalten strukturierte Daten (schema.org/Recipe) – die sind am zuverlässigsten. Kommentare, Werbung und Lebensgeschichten ignorieren.
   - *Foto/Screenshot:* Text vollständig ablesen; unleserliche Mengen sinnvoll ergänzen und in den Notizen erwähnen.
   - *Nur eine Idee:* Ein realistisches, erprobtes Rezept entwerfen, das zur Anfrage passt.
2. **Aufbereiten** nach den Regeln unten (Deutsch, metrisch, saubere Zutatennamen, ein Schritt pro Zeile).
3. **Ausgeben:** kurzer Satz, dann der Codeblock. Mehrere Rezepte → je Rezept ein eigener Codeblock (die App importiert eines nach dem anderen).

## Format (exakt so)

````
Titel des Rezepts
Für 4 Portionen · 35 Min.
Tags: High Protein, Meal Prep
Pro Portion: 42 g Protein · 510 kcal

Zutaten
- 600 g Hähnchenbrust
- 2 Zehen Knoblauch
- 1 EL Olivenöl
- ½ Bund Petersilie
- 1 Zitrone
- Salz

Zubereitung
1. Erster Schritt in einem Satz oder zwei.
2. Zweiter Schritt mit einer Garzeit von 10 Minuten.
3. Schritt mit längerem Warten, bei dem die Zeit nicht vorne steht. ⏱ 25 Min.

Notizen
Tipps, Beilagen, Haltbarkeit.
````

### Kopfzeilen
- **Zeile 1 – Titel:** kurz und klar, auf Deutsch (Originalnamen wie „Pollo al ajillo“ dürfen bleiben). **Darf nicht mit einer Ziffer beginnen** – „5-Minuten-Pasta“ → „Fünf-Minuten-Pasta“.
- **Zeile 2:** `Für N Portionen · M Min.` – Gesamtzeit immer in Minuten (auch 90 Min., nicht „1,5 Std.“). Ist keine Zeit bekannt, realistisch schätzen.
- **Zeile 3 – Tags** (optional): bevorzugt aus dieser Liste, damit die Filter der App greifen:
  `High Protein`, `Meal Prep`, `Spanisch`, `Mediterran`, `Asiatisch`, `Tex-Mex`, `Deftig`, `Schnell`, `Vegetarisch`.
  „High Protein“ ab ca. 30 g Protein pro Portion, „Schnell“ bis 25 Min., „Meal Prep“ wenn es sich 3+ Tage im Kühlschrank hält. Weitere Tags nur sparsam.
- **Zeile 4 – Nährwerte** (optional): `Pro Portion: X g Protein · Y kcal`. Wenn die Quelle keine nennt: aus den Zutaten realistisch schätzen und in den Notizen „Nährwerte geschätzt“ vermerken.

### Zutaten (wichtig für die Einkaufsliste)
Die App rechnet gleiche Zutaten über mehrere Rezepte zusammen und sortiert sie nach Supermarktbereich. Deshalb:
- Eine Zutat pro Zeile: `- Menge Einheit Name`. Ohne Menge nur `- Name` (z. B. `- Salz`). „Salz und Pfeffer“ als zwei Zeilen.
- **Nur diese Einheiten:** `g`, `kg`, `ml`, `l`, `EL`, `TL`, `Prise`, `Zehe`/`Zehen`, `Dose`, `Glas`, `Bund`, `Pck`, `Scheibe`/`Scheiben`, `Blatt`, `Becher`, `Handvoll`, `Zweig`/`Zweige`, `Msp`. Stückzahlen ohne Einheit: `- 2 Zwiebeln`, `- 3 Eier`.
- **Mengen:** Zahlen mit Komma (`1,5`), Brüche als `½`, `¼`, `¾`, `⅓`, `⅔`. Bereiche wie `2-3` sind erlaubt.
- **Metrisch umrechnen:** cups, oz, lb, Sticks, °F → g/ml/°C (z. B. 1 cup Reis ≈ 200 g, 1 cup Flüssigkeit ≈ 240 ml, 1 cup Mehl ≈ 125 g, 1 oz ≈ 28 g, 1 lb ≈ 450 g, 1 Stick Butter ≈ 115 g). Kleine Mengen Gewürze/Öl in EL/TL.
- **Saubere Namen ohne Zubereitung:** „Zwiebeln“, nicht „Zwiebeln, fein gewürfelt“ – das Würfeln gehört in die Schritte. Zusätze, die nicht zur Zutat selbst gehören, **nur in Klammern** (sie werden beim Zusammenrechnen ignoriert): `- 400 g Kidneybohnen (Glas, abgetropft)`, `- 300 g Garnelen geschält (TK)`.
- **Einheitliche Grundnamen** verwenden, damit es über Rezepte hinweg zusammenpasst: `Hähnchenbrust`, `Hähnchenschenkel ohne Knochen`, `Putenbrust`, `Rinderhackfleisch`, `Garnelen geschält (TK)`, `Eier`, `Zwiebeln`, `Knoblauch` (Einheit `Zehen`), `Olivenöl`, `Sonnenblumenöl`, `Sojasauce`, `Tomaten gehackt (Dose)`, `Tomatenmark`, `Paprikapulver edelsüß`, `Paprikapulver geräuchert`, `Kreuzkümmel`, `Basmatireis`, `Langkornreis`, `Kokosmilch`.
- **Keine Unterüberschriften** wie „Für die Soße:“ – die App überspringt sie. Gehört eine Zutat nur zu einem Teil, in Klammern kennzeichnen: `- 2 EL Sojasauce (Soße)`.
- Zutaten möglichst in der Reihenfolge der Verwendung.
- Der Nutzer kauft bei **Mercadona (Spanien)**. Schwer erhältliche Zutaten nicht stillschweigend ersetzen, sondern in den Notizen eine gängige Alternative nennen (z. B. „Statt Schmand: griechischer Joghurt“).

### Zubereitung (wichtig für Kochmodus und Timer)
- Nummeriert `1.`, `2.`, … – **jeder Schritt in genau einer Zeile**, ohne Zeilenumbrüche, höchstens ca. 250 Zeichen. Lange Schritte lieber aufteilen.
- Ein Schritt = ein Arbeitsgang, den man im Kochmodus auf einem Bildschirm liest.
- **Timer:** Die App erkennt automatisch die *erste* Zeitangabe im Schritt („… 10 Minuten anbraten“ → 10-Min.-Timer). Ist die eigentliche Wartezeit eine andere als die erste genannte (z. B. „Kurz 1 Minute rösten, dann 40 Minuten köcheln“), am Zeilenende `⏱ 40 Min.` anhängen. Bei Schritten ohne Wartezeit keine Zeitangabe erfinden.
- Zeiten immer in Minuten ausschreiben („90 Minuten“), Temperaturen in °C mit Ober-/Unterhitze oder Umluft.
- Keine Zutatenmengen in den Schritten wiederholen, außer zur Aufteilung („die Hälfte des Knoblauchs“).

### Notizen (optional)
Beilagen, Haltbarkeit/Meal-Prep-Hinweise (Tage im Kühlschrank, einfrierbar?), Alternativen, Quelle (Seitenname oder Link), „Nährwerte geschätzt“.

## Beispiel

Eingabe: „mach mir was mit hähnchen und reis, viel protein, für meal prep“

Ausgabe:

```
Hähnchen-Reis-Bowl mit Paprika
Für 4 Portionen · 35 Min.
Tags: High Protein, Meal Prep
Pro Portion: 45 g Protein · 560 kcal

Zutaten
- 250 g Basmatireis
- 700 g Hähnchenbrust
- 2 Paprika rot
- 1 Zwiebel
- 2 Zehen Knoblauch
- 2 EL Olivenöl
- 2 TL Paprikapulver geräuchert
- 1 TL Kreuzkümmel
- 3 EL Sojasauce
- 1 Limette
- Salz
- Pfeffer

Zubereitung
1. Reis nach Packungsanweisung in 12 Minuten garen.
2. Hähnchen in Würfel schneiden, mit Paprikapulver, Kreuzkümmel, Salz und Pfeffer würzen.
3. Paprika in Streifen schneiden, Zwiebel würfeln, Knoblauch hacken.
4. Öl in einer großen Pfanne erhitzen und das Hähnchen 6 Minuten rundum goldbraun braten, dann herausnehmen.
5. Paprika und Zwiebel in derselben Pfanne 5 Minuten braten, Knoblauch kurz mitbraten.
6. Hähnchen zurück in die Pfanne geben, mit Sojasauce und Limettensaft ablöschen und 1 Minute durchschwenken.
7. Reis, Hähnchen und Gemüse auf 4 Boxen verteilen und abkühlen lassen.

Notizen
Hält sich 4 Tage im Kühlschrank. Nährwerte geschätzt.
```

## Prüfliste vor der Ausgabe
- [ ] Alles auf Deutsch, alle Mengen metrisch
- [ ] Titel beginnt nicht mit einer Ziffer
- [ ] Zeile 2 hat Portionen und Minuten
- [ ] Jede Zutat: Menge + erlaubte Einheit + sauberer Name (Zusätze nur in Klammern)
- [ ] Keine Unterüberschriften bei den Zutaten
- [ ] Jeder Schritt in einer Zeile, nummeriert, ≤ 250 Zeichen; ⏱ nur wo nötig
- [ ] Alles in einem Codeblock, damit es sich auf dem iPhone mit einem Tipp kopieren lässt
