# Kochbuch – Rezepte, Kochplaner & Einkaufsliste

Offline-fähige Web-App (PWA) für das iPhone. Reines HTML/CSS/JavaScript ohne Build-Schritt,
ohne Framework, ohne Backend. Alle Daten liegen lokal im Browser (IndexedDB).

## Funktionen

- **Kochbuch:** Rezepte mit Foto, Portionen, Zeit, Zutaten, Schritten, Tags und Nährwerten;
  Suche, Filter, Favoriten, Portionsrechner, Kochmodus (Wake Lock, Timer), Text-Import.
- **Planer:** Die nächsten Kochtage mit je 1–2 Rezepten und eigener Portionszahl.
  Rezepte lassen sich auch direkt aus der Rezeptansicht einplanen (Kalender-Symbol).
- **Einkaufsliste:** Wird live aus den kommenden Kochtagen berechnet. Gleiche Zutaten werden
  zusammengerechnet (auch „Zwiebel“/„Zwiebeln“), Einheiten vereinheitlicht (kg/g, l/ml, EL/TL),
  Stückzahlen aufgerundet und nach Supermarktbereich gruppiert. Abhaken, eigene Artikel
  („2 l Milch“), Vorrat ausblenden, Bereich ändern (ⓘ), als Text teilen oder kopieren.

## Projektstruktur

```
index.html        Gerüst, iOS-Meta-Tags, Tab-Leiste
styles.css        Mobile-first, Dark Mode, Safe-Areas
manifest.json     PWA-Manifest (Name, Icons, Vollbild)
sw.js             Service Worker (Offline-Cache, Network-first mit 3-s-Timeout)
icons/            App-Icons (192, 512, apple-touch-icon 180)
js/app.js         Einstieg: Router, Erststart, Service-Worker-Registrierung
js/db.js          IndexedDB-Hülle + Datenmodell (normalizeRecipe)
js/units.js       Einheiten, Umrechnung, Mengenformatierung
js/aisles.js      Supermarktbereiche + automatische Zuordnung
js/parser.js      Rezepttext-Import (Titel, Zutaten, Schritte, Timer)
js/seed.js        10 Beispielrezepte
js/plan.js        Kochtage (Datum + Rezepte mit Portionen)
js/shopping.js    Einkaufsliste berechnen, zusammenfassen, teilen
js/backup.js      Export/Import als JSON
js/ui.js          DOM-Helfer, Icons, Dialoge
js/state.js       Flüchtiger UI-Zustand
js/views/*.js     Eine Datei pro Bildschirm
```

## Lokal testen

```bash
cd cooking_web_app
python3 -m http.server 8000
```

Dann `http://localhost:8000` im Browser öffnen (am besten mit den DevTools in der iPhone-Ansicht).

> Pythons einfacher Testserver verliert gelegentlich Anfragen, wenn der Browser viele Dateien
> gleichzeitig lädt – die Seite bleibt dann leer. Einfach neu laden. Auf GitHub Pages tritt das nicht auf.

> Service Worker (Offline) und Wake Lock funktionieren nur über **HTTPS** oder `localhost`.
> Auf dem iPhone über `http://192.168.x.x:8000` läuft die App zwar, aber ohne diese beiden
> Funktionen. Für den echten iPhone-Test → GitHub Pages (unten).

## Auf GitHub Pages veröffentlichen

1. Auf <https://github.com/new> ein neues Repository anlegen, z. B. `kochbuch`.
   - **Public** wählen (GitHub Pages ist für private Repos nur mit bezahltem Plan verfügbar).
   - Kein README/.gitignore anhaken – das Repo soll leer sein.
2. Im Projektordner:
   ```bash
   git add .
   git commit -m "Kochbuch Teil 1"
   git remote add origin https://github.com/DEIN-NAME/kochbuch.git
   git push -u origin main
   ```
3. Auf GitHub im Repo: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main**, Ordner **/ (root)** → **Save**
4. Nach 1–2 Minuten ist die App erreichbar unter
   `https://DEIN-NAME.github.io/kochbuch/`

**Updates:** Änderungen committen und pushen; GitHub Pages aktualisiert automatisch.
Die App lädt online immer die neueste Version (Network-first). Wenn du neue Dateien hinzufügst,
trage sie in `sw.js` in `ASSETS` ein und erhöhe `VERSION`, damit sie auch offline verfügbar sind.

> Die Rezepte liegen nur auf deinem Gerät, nicht im Repo. Das Repo enthält nur den App-Code.

## Zum iPhone-Home-Bildschirm hinzufügen

1. Die GitHub-Pages-URL in **Safari** öffnen.
2. Unten auf **Teilen** (Quadrat mit Pfeil) tippen.
3. **Zum Home-Bildschirm** wählen (ggf. in der Liste nach unten scrollen).
   Falls angeboten, **„Als Web-App öffnen“** eingeschaltet lassen.
4. Name prüfen („Kochbuch“) → **Hinzufügen**.

Die App startet jetzt im Vollbild ohne Browserleiste und funktioniert offline,
sobald sie einmal online geöffnet wurde.

**Wichtig:** Die Daten der Home-Bildschirm-App sind getrennt von Safari. Wenn du vorher in
Safari Rezepte angelegt hast, über **Mehr → Backup exportieren** sichern und in der App wieder importieren.

## Backup

iOS kann Daten von Web-Apps bei Speichermangel löschen. Deshalb regelmäßig unter
**Mehr → Backup exportieren → Teilen → In Dateien sichern** eine JSON-Datei in iCloud Drive ablegen.
Die App erinnert nach 7 Tagen mit ungesicherten Änderungen daran.
Wiederherstellen: **Mehr → Backup importieren** (zusammenführen oder alles ersetzen).
