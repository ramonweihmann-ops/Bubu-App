# Bubu App

Punktekonto für zwei. Aufgaben („Quests“) haben einen **vorher festgelegten** Punktwert.
Wer eine erledigt, meldet sie — gutgeschrieben wird sie erst, wenn **der andere bestätigt**.
Punktwerte ändern sich nie im Alleingang, sondern nur über eine **Abstimmung**, der beide zustimmen.

Grundlage ist die Reinigungsquest-Tabelle (22 Quests, 11 Belohnungen, zwei Konten).

Eigenes Projekt mit eigener Datenbasis — bewusst getrennt von allen anderen Projekten.

- **Mockup:** [`docs/mockup.html`](./docs/mockup.html) — im Browser öffnen, der Prototyp oben ist antippbar.
- **Einrichtung:** [`docs/SETUP.md`](./docs/SETUP.md) — Schritt für Schritt, was zu klicken ist.
- **Datenbank:** [`d1/schema.sql`](./d1/schema.sql) — Tabellen und Regeln.

---

## Die drei Regeln

| Regel | Bedeutung |
| --- | --- |
| Preis steht vorher | Beim Melden wird der aktuelle Punktwert eingefroren. Spätere Änderungen wirken nie rückwirkend. |
| Vier Augen | Melden darf jeder, freigeben nur der andere. Ohne Bestätigung keine Punkte. |
| Nur gemeinsam | Punktwert ändern, Quest anlegen, Belohnung ergänzen: nur mit Zustimmung von beiden. Ein Nein lässt alles beim Alten. |

Die zweite Regel ist keine Frage der Oberfläche, sondern der Datenbank: Wer eine eigene Meldung
bestätigen will, bekommt einen Fehler — nicht weil ein Knopf versteckt ist, sondern weil die
Datenbank es abweist (`claim_no_self_decide` im Schema). Punktestände werden nirgends
gespeichert, sondern aus allen Buchungen berechnet.

## Aufbau

```
deine-domain.de          →  Seite mit dem Installationsknopf
deine-domain.de/app      →  die App (Web-App zum Anheften, PWA)
deine-domain.de/api/…    →  Worker: prüft, wer fragt, und setzt die Regeln durch
                            D1: Quests, Meldungen, Buchungen
```

| Baustein | Technik | Kosten |
| --- | --- | --- |
| Website + App | Cloudflare Pages | 0 € |
| API und Regeln | Cloudflare Workers | 0 € |
| Datenbank | Cloudflare D1 (SQLite) | 0 € |
| Anmeldung | Google OAuth, Sitzung im Worker | 0 € |
| Benachrichtigungen | Web Push (VAPID) | 0 € |
| Domain | beliebiger Registrar | ~5–12 €/Jahr |

Warum nicht Supabase: Der kostenlose Rahmen erlaubt zwei aktive Projekte pro Konto, und die
sind hier bereits belegt. Das fertige Postgres-Schema liegt für den Fall der Fälle unter
[`supabase/schema.sql`](./supabase/schema.sql) bereit — Details im
[Anhang der Einrichtung](./docs/SETUP.md#anhang-supabase-variante).

## Anmeldung

Google Sign-In — kein eigenes Passwort, keine Registrierung. Übernommen werden Name, E-Mail
und Profilbild.

Danach das **Pairing**: Der erste erzeugt einen sechsstelligen Code, der zweite gibt ihn ein.
Der Code ist einmal einlösbar und verfällt nach 24 Stunden. Ein Konto kann in genau einem Paar
sein, ein Paar besteht aus genau zwei Personen — beides erzwingt die Datenbank.

## Trennung von anderen Projekten

| Ebene | Trennung |
| --- | --- |
| Repository | Eigenes Repo, eigener Verlauf, eigene Releases. |
| Datenbank | Eigene D1-Instanz, ausschließlich für diese App. Kein geteiltes Schema, keine geteilten Tabellen. |
| Nutzerkonten | Eigene Sitzungsverwaltung. Eine Anmeldung anderswo gilt hier nicht und umgekehrt. |
| Schlüssel | Eigene Secrets in diesem Repo. Kein Schlüssel wandert zwischen Projekten. |
| Hosting | Eigenes Cloudflare-Projekt unter eigener Domain. |

## Wie die App aufs Handy kommt

Über die Domain: Seite öffnen, **App installieren** antippen, fertig. Danach liegt sie als
Symbol auf dem Startbildschirm, mit eigenem Fenster und Push-Benachrichtigungen — auf Android
kaum von einer Store-App zu unterscheiden. Kein Store, keine Gebühr, keine Installationsdatei
zum Verschicken, und Updates sind sofort bei beiden.

Falls es später doch in den Play Store soll: Dieselbe App lässt sich mit Bubblewrap in eine APK
verpacken, ohne den Code neu zu schreiben. Das Google-Entwicklerkonto kostet einmalig 25 US-Dollar.

## Figuren und Namen

Fuchs und Wolf sind eigene Vektorzeichnungen und liegen an **einer** Stelle im Mockup
(die `<symbol>`-Blöcke `m-fox`, `m-wolf`, `m-duo` in `docs/mockup.html`). Sie können bleiben
oder in einem Zug getauscht werden. Für einen späteren Verkauf wäre nur der Name „Bubu App“
zu prüfen — und, falls doch Tenor-GIFs dazukommen, deren Lizenz.
