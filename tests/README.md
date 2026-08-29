# Tests

Zwei Sorten, beide gegen eine laufende App:

- **`*-api.sh`** sprechen mit `/api` über `curl` und prüfen die Regeln direkt in
  der Datenbank. Sie sind schnell und sagen genau, welche Regel gebrochen ist.
- **`ui-*.mjs`** fahren die Oberfläche mit Playwright — zu zweit oder zu dritt,
  jede Person in einem eigenen Browserfenster. Sie prüfen, was auf dem Schirm
  steht, und melden jeden Fehler aus der Browserkonsole mit.

## Loslegen

```bash
npx wrangler dev --local --port 8792     # in einem zweiten Fenster
bash tests/alle.sh
```

`alle.sh` spielt alles in der Reihenfolge durch, in der es sich verträgt, und
gibt je Suite die letzten Zeilen aus. Jede muss auf **ALLES GRÜN** enden.

Playwright liegt bewusst nicht im Projekt — es wiegt mehr als die ganze App.
`alle.sh` sucht es an den üblichen Stellen; mit `HQ_PLAYWRIGHT=/pfad/node_modules`
lässt sich der Ort auch vorgeben. Screenshots landen in `HQ_BILDER` (sonst
`/tmp`).

## Die Reihenfolge ist keine Laune

Alle Suiten teilen sich eine Datenbank:

1. `seed.sql` + `sitzungen.sh` legen den **Zweier-Haushalt** an — den braucht
   `test.sh` für die sieben Arten von Vorschlägen.
2. `haushalt.sh` baut daraus die **Dreier-WG**. Alles Weitere setzt sie voraus.
3. `ui3.mjs` prüft die **Ersteinrichtung** und braucht dafür frische Konten,
   die `reset-def.sh` herstellt — deshalb steht es am Ende.

Wer eine Suite einzeln laufen lässt, sollte vorher `reset-def.sh` und
`haushalt.sh` aufrufen. Jede Suite räumt hinter sich auf, was sie umgestellt
hat; ein laufender Haushaltsurlaub etwa hielte sonst den Plan der nächsten an —
genau so, wie er es soll.

## Was drin steckt

| Suite | Prüft |
| --- | --- |
| `test.sh` | Alle Arten von Vorschlägen: anlegen, ändern, löschen, Aktionen — und dass eine hängengebliebene Abstimmung sich selbst heilt |
| `haushalt.sh` | Einrichtung, Beitritt, Räume, Bilder, Rollen, Übertragungen |
| `plan-api.sh` | Haushaltsplan: Rhythmus, Sperre, Bewerbung, Rangliste, Mahnung, Gruppenstrafe |
| `rueck-api.sh` | Rückfragen, Empfangsbestätigung, Strafe bei Nichtlieferung, Nachholen |
| `storno-api.sh` | Eine offene Anfrage nachbessern oder zurückziehen |
| `urlaub-api.sh` | Urlaub für eine Person und für den Haushalt |
| `gutschrift-api.sh` | Cleanies einer Belohnung dem Empfänger gutschreiben |
| `ruecktritt-api.sh` | Von einer zugeteilten Aufgabe zurücktreten — Mehrheit statt Einstimmigkeit |
| `event-api.sh` | Events: anlegen, freigeben, einlösen, Deckel, Dauerevent, beenden |
| `ui.mjs` | Dunkles Design, Einstellungen |
| `ui3.mjs` | Ersteinrichtung von der Begrüßung bis zum Einladecode |
| `ui-plan.mjs` | Der Haushaltsplan auf dem Schirm |
| `ui-rueck.mjs` | Rückfragen und Belohnungen auf dem Schirm |
| `ui-wieder.mjs` | Eine Quest zur wiederkehrenden Aufgabe machen |
| `ui-offen.mjs` | Der Wartekasten auf der Startseite |
| `ui-abst.mjs` | Abstimmungen bei „Prüfen“, mit allem, was draufsteht |
| `ui-storno.mjs` | Nachbessern und Zurückziehen auf dem Schirm |
| `ui-urlaub.mjs` | Urlaubsmodus auf dem Schirm |
| `ui-gutschrift.mjs` | Der Haken „Cleanies an Empfänger senden“ |
| `ui-ruecktritt.mjs` | Zurücktreten auf dem Schirm, zu dritt |
| `jubel-api.sh` | Cleanies-Phasen verschieben, eigene GIFs hochladen und löschen |
| `ui-jubel.mjs` | Der Jubel in der App, die Einstellungen der Verwaltung |
| `mockup-anim.mjs` | Das Animations-Mockup: laufen wirklich alle dreißig? |
| `ui-event.mjs` | Events auf dem Schirm, zu dritt — vom Blatt bis zum Beenden |
| `mockup-events.mjs` | Das Event-Mockup: alle Schirme da, nichts läuft über, kein „Punkte“ |
| `cleanie-shot.mjs` | Der Cleanies-Stern in hell und dunkel |
